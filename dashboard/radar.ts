import type { RadarAgent, RadarSnapshot } from '../shared/radar';
import { mountFleetControls } from './fleetControls';

const labels: Record<string, string> = { active: '启用', suspended: '暂停', retired: '退役', idle: '空闲', assigned: '已分配',
  generating: '生成中', blocked: '受阻', unauthorized: '未登录', error: '错误', unknown: '未知', unavailable: '不可用',
  absent: '离线', opening: '打开中', open: '已打开', closing: '关闭中', controlled: '受控', elastic: '弹性', paused: '暂停', draining: '排空', archived: '归档' };

function isSnapshot(value: unknown): value is RadarSnapshot {
  if (!value || typeof value !== 'object') return false;
  const x = value as RadarSnapshot;
  return x.schemaVersion === 1 && typeof x.instanceId === 'string' && !!x.instanceId && Number.isFinite(x.observedAt) && Number.isFinite(x.observationTtlMs) &&
    Array.isArray(x.projects) && x.projects.every(p => p && [p.id, p.name, p.rootPath, p.status].every(v => typeof v === 'string') &&
      Number.isFinite(p.minSlots) && Number.isFinite(p.maxSlots) && p.fleet && typeof p.fleet.mode === 'string' && typeof p.fleet.lifecycleLocked === 'boolean' && Number.isFinite(p.fleet.revision)) &&
    Array.isArray(x.agents) && x.agents.every(a => a && [a.id, a.projectId, a.role, a.status, a.desiredState, a.browserState, a.pageStatus, a.rolloverState].every(v => typeof v === 'string') &&
      ['offline', 'unavailable', 'fresh'].includes(a.observationState) && (a.conversationKey === null || typeof a.conversationKey === 'string') &&
      Number.isFinite(a.conversationGeneration) && Number.isFinite(a.leaseEpoch) && typeof a.quarantined === 'boolean' && (a.error === null || typeof a.error === 'string') &&
      [a.browserObservedAt, a.runtimeObservedAt, a.browserTabId].every(v => v === null || Number.isFinite(v))) &&
    Array.isArray(x.events) && x.events.every(e => e && Number.isFinite(e.seq) && Number.isFinite(e.createdAt) &&
      [e.type, e.subject].every(v => typeof v === 'string') && (e.projectId === null || typeof e.projectId === 'string'));
}

export function mountRadar(doc: Document, win: Window, fetcher: typeof fetch) {
  const get = <T extends HTMLElement>(id: string): T => {
    const value = doc.getElementById(id); if (!value) throw new Error(`Missing radar element: ${id}`); return value as T;
  };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string) => {
    const node = doc.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node;
  };
  const tag = (text: string, tone = '') => el('span', text, `tag ${tone}`);
  const timestamp = (value: number | null) => value === null ? '未观测' : new Date(value).toLocaleString('zh-CN', { hour12: false });
  const filter = get<HTMLSelectElement>('project-filter');
  const button = get<HTMLButtonElement>('refresh');
  let snapshot: RadarSnapshot | undefined, selected = '', connected = false, disposed = false;
  let timer: number | undefined, controller: AbortController | undefined;
  let token = '';
  try {
    const supplied = new URLSearchParams(win.location.hash.slice(1)).get('read');
    if (supplied) { token = supplied; win.sessionStorage.setItem('charterion.radar.read', token); }
    else token = win.sessionStorage.getItem('charterion.radar.read') ?? '';
  } catch { /* A supplied fragment still works when session storage is unavailable. */ }
  // Read sessions are process-scoped; never leave even a read-only token in browser history.
  win.history.replaceState(null, '', win.location.pathname);
  let refreshing: Promise<void> | undefined;
  const controls = mountFleetControls(doc, win, fetcher, { readToken: () => token, reload: async () => {
    await refreshing; await refresh(); return connected ? snapshot : undefined;
  } });

  function render(): void {
    controls.update(snapshot, connected);
    if (!snapshot) return;
    const focusedSlot = doc.activeElement?.getAttribute('data-inspect-slot');
    const data = snapshot;
    const known = new Set(data.projects.map(p => p.id));
    const chosen = known.has(filter.value) ? filter.value : '';
    const allOption = el('option', '全部项目'); allOption.value = ''; filter.replaceChildren(allOption);
    for (const p of data.projects) { const option = el('option', p.name); option.value = p.id; filter.append(option); }
    filter.value = chosen;
    const projects = data.projects.filter(p => !chosen || p.id === chosen);
    const agents = data.agents.filter(a => !chosen || a.projectId === chosen);
    const names = new Map(data.projects.map(p => [p.id, p.name]));
    get('scope-label').textContent = chosen ? names.get(chosen)! : '全部项目';
    get('project-count').textContent = String(projects.length);
    get('agent-count').textContent = String(agents.length);
    get('online-count').textContent = connected ? String(agents.filter(a => a.observationState === 'fresh' && a.browserState === 'open').length) : '—';
    get('locked-count').textContent = String(projects.filter(p => p.fleet.lifecycleLocked).length);
    get('instance').textContent = `Kernel ${data.instanceId}`;
    const projectRoot = get('projects'); projectRoot.replaceChildren();
    for (const p of projects) {
      const card = el('article', undefined, 'project'); card.append(el('h3', p.name));
      const tags = el('div', undefined, 'tags'); tags.append(tag(labels[p.status] ?? p.status), tag(labels[p.fleet.mode] ?? p.fleet.mode),
        tag(p.fleet.lifecycleLocked ? '生命周期已锁定' : '生命周期未锁定', p.fleet.lifecycleLocked ? 'warn' : ''),
        tag(`${agents.filter(a => a.projectId === p.id).length} 个角色会话`));
      card.append(tags, el('p', `${p.rootPath} · 槽位 ${p.minSlots}–${p.maxSlots}`)); projectRoot.append(card);
    }
    if (!projects.length) projectRoot.append(el('p', '此 Kernel 尚无项目。', 'empty'));
    const agentRoot = get('agents'); agentRoot.replaceChildren();
    for (const a of agents) {
      const row = el('article', undefined, `agent${selected === a.id ? ' selected' : ''}`); row.dataset.slotId = a.id;
      const content = el('div'); content.append(el('h3', `${a.role} · ${names.get(a.projectId) ?? a.projectId}`));
      const currentStatus = a.browserState === 'open' ? a.pageStatus : a.browserState;
      const state = !connected ? '不可用 · 历史快照' : a.observationState === 'offline' ? '离线' : a.observationState === 'unavailable' ? '观测过期 / 不可用' : labels[currentStatus] ?? currentStatus;
      const tags = el('div', undefined, 'tags'); tags.append(tag(state, !connected || a.observationState === 'unavailable' ? 'warn' :
        a.quarantined || ['error', 'blocked', 'unauthorized'].includes(currentStatus) ? 'bad' :
        a.observationState === 'fresh' && ['idle', 'generating'].includes(currentStatus) ? 'good' : ''), tag(`期望：${labels[a.desiredState] ?? a.desiredState}`));
      if (a.quarantined) tags.append(tag('已隔离', 'bad'));
      content.append(tags, el('code', a.conversationKey ?? 'UNBOUND · 尚未建立正式 Conversation'), el('small', `最近浏览器观测 ${timestamp(a.browserObservedAt)}`));
      const inspect = el('button', '查看详情'); inspect.type = 'button'; inspect.setAttribute('aria-label', `查看 ${a.role} 的状态详情`);
      inspect.dataset.inspectSlot = a.id;
      inspect.setAttribute('aria-pressed', String(selected === a.id)); inspect.addEventListener('click', () => { selected = a.id; render(); });
      row.append(content, inspect); agentRoot.append(row);
    }
    if (!agents.length) agentRoot.append(el('p', '此范围尚无 AgentSlot。', 'empty'));
    const detailRoot = get('details'); detailRoot.replaceChildren();
    const agent: RadarAgent | undefined = agents.find(a => a.id === selected);
    if (!agent) detailRoot.append(el('p', '选择一个角色查看 Kernel 原始状态。', 'empty'));
    else {
      if (!connected) detailRoot.append(el('p', '历史快照：Kernel 当前不可用，以下信息不代表实时状态。', 'detail-note'));
      const fleet = data.projects.find(p => p.id === agent.projectId)?.fleet;
      const fields: [string, string][] = [ ['角色', agent.role], ['项目', names.get(agent.projectId) ?? agent.projectId], ['Project ID', agent.projectId], ['AgentSlot', agent.id],
        ['Conversation', agent.conversationKey ?? 'UNBOUND'], ['绑定代数', String(agent.conversationGeneration)], ['租约 epoch', String(agent.leaseEpoch)],
        ['期望状态', agent.desiredState], ['Slot 状态', agent.status], ['浏览器状态', agent.browserState], ['页面状态', agent.pageStatus], ['观测状态', agent.observationState],
        ['生命周期锁', fleet?.lifecycleLocked ? '锁定' : '未锁定'], ['锁版本', String(fleet?.revision ?? 'unavailable')], ['Rollover', agent.rolloverState],
        ['Tab ID', String(agent.browserTabId ?? 'unavailable')], ['浏览器观测', timestamp(agent.browserObservedAt)], ['页面观测', timestamp(agent.runtimeObservedAt)], ['错误 / 隔离', agent.error ?? '无记录'] ];
      const dl = el('dl'); for (const [key, value] of fields) dl.append(el('dt', key), el('dd', value)); detailRoot.append(dl);
    }
    const eventRoot = get('events'); const scroll = eventRoot.scrollTop; eventRoot.replaceChildren();
    const events = data.events.filter(e => !chosen || e.projectId === chosen);
    for (const event of events) {
      const item = el('li', undefined, 'event'); const time = el('time', timestamp(event.createdAt)); time.dateTime = new Date(event.createdAt).toISOString();
      const body = el('div'); body.append(el('strong', event.type), el('small', `#${event.seq} · ${event.projectId ? names.get(event.projectId) ?? event.projectId : 'Kernel'} · ${event.subject}`));
      item.append(time, body); eventRoot.append(item);
    }
    if (!events.length) eventRoot.append(el('li', '当前全局最近 100 条中，此范围无事件记录。', 'empty'));
    eventRoot.scrollTop = scroll;
    if (focusedSlot) Array.from(doc.querySelectorAll<HTMLButtonElement>('[data-inspect-slot]')).find(b => b.dataset.inspectSlot === focusedSlot)?.focus({ preventScroll: true });
  }

  function refresh(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = readSnapshot().finally(() => { refreshing = undefined; }); return refreshing;
  }
  async function readSnapshot(): Promise<void> {
    if (disposed) return;
    if (timer !== undefined) win.clearTimeout(timer);
    controller = new AbortController(); button.disabled = true;
    const timeout = win.setTimeout(() => controller?.abort(), 8000);
    try {
      if (!token) throw new Error('READ_SESSION_REQUIRED');
      const response = await fetcher('/pcp/api/snapshot', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP_${response.status}`);
      const data: unknown = await response.json();
      if (!isSnapshot(data)) throw new Error('INVALID_SNAPSHOT');
      if (disposed) return;
      snapshot = data; connected = true; doc.body.dataset.state = 'connected'; render();
      get('connection-state').textContent = '已连接 Kernel';
      get('connection-detail').textContent = `每 3 秒刷新 · 快照 ${timestamp(data.observedAt)} · 浏览器观测超过 ${data.observationTtlMs / 1000} 秒显示不可用`;
    } catch (error) {
      if (disposed) return;
      connected = false; doc.body.dataset.state = 'unavailable';
      get('connection-state').textContent = 'Kernel 不可用';
      const reason = error instanceof Error ? error.message : 'REQUEST_FAILED';
      get('connection-detail').textContent = reason === 'READ_SESSION_REQUIRED' || reason === 'HTTP_401' ? '只读会话缺失或已失效，请从 Chrome 插件重新打开控制台。' :
        `连接失败，正在重试。${snapshot ? `以下为历史快照，最后成功时间 ${timestamp(snapshot.observedAt)}。` : '尚无可用快照。'}`;
      render();
    } finally {
      win.clearTimeout(timeout); controller = undefined; button.disabled = false;
      if (!disposed) timer = win.setTimeout(() => { void refresh(); }, 3000);
    }
  }
  button.addEventListener('click', () => { void refresh(); });
  filter.addEventListener('change', () => { selected = ''; render(); });
  void refresh();
  return { refresh, dispose() { disposed = true; controls.dispose(); if (timer !== undefined) win.clearTimeout(timer); controller?.abort(); } };
}
