import type { RadarAgent, RadarSnapshot } from '../shared/radar';
import { mountFleetControls } from './fleetControls';

const labels: Record<string, string> = { active: '启用 / active', suspended: '暂停 / suspended', retired: '退役 / retired', idle: '空闲 / idle', assigned: '已分配 / assigned',
  generating: '生成中 / generating', blocked: '受阻 / blocked', unauthorized: '未登录 / unauthorized', error: '错误 / error', unknown: '未知 / unknown', unavailable: '不可用 / unavailable',
  absent: '离线 / absent', opening: '打开中 / opening', open: '已打开 / open', closing: '关闭中 / closing', controlled: '受控 / controlled', elastic: '弹性 / elastic', paused: '暂停 / paused', draining: '排空 / draining', archived: '归档 / archived' };

function isSnapshot(value: unknown): value is RadarSnapshot {
  if (!value || typeof value !== 'object') return false;
  const x = value as RadarSnapshot;
  return x.schemaVersion === 1 && typeof x.instanceId === 'string' && !!x.instanceId && Number.isFinite(x.observedAt) && Number.isFinite(x.observationTtlMs) &&
    (x.projectGroups === undefined || (Array.isArray(x.projectGroups) && x.projectGroups.every(g => g &&
      [g.id, g.name, g.leadIdentity, g.leadConversationKey].every(v => typeof v === 'string') &&
      g.leadRole === 'chief_engineer' && g.browserRuntime === 'NOT_VERIFIED' && Array.isArray(g.members) &&
      g.members.every(m => m && typeof m.projectId === 'string' && typeof m.developerSlotId === 'string')))) &&
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
  const timestamp = (value: number | null) => value === null ? '未观测 / Not observed' : new Date(value).toLocaleString('zh-CN', { hour12: false });
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
    const allOption = el('option', '全部项目 / All Projects'); allOption.value = ''; filter.replaceChildren(allOption);
    for (const p of data.projects) { const option = el('option', p.name); option.value = p.id; filter.append(option); }
    filter.value = chosen;
    const projects = data.projects.filter(p => !chosen || p.id === chosen);
    const agents = data.agents.filter(a => !chosen || a.projectId === chosen);
    const names = new Map(data.projects.map(p => [p.id, p.name]));
    get('scope-label').textContent = chosen ? names.get(chosen)! : '全部项目 / All Projects';
    get('project-count').textContent = String(projects.length);
    get('agent-count').textContent = String(agents.length);
    get('online-count').textContent = connected ? String(agents.filter(a => a.observationState === 'fresh' && a.browserState === 'open').length) : '—';
    get('locked-count').textContent = String(projects.filter(p => p.fleet.lifecycleLocked).length);
    get('instance').textContent = `Kernel ${data.instanceId}`;
    const projectRoot = get('projects');
    const expandedGroups = new Set(Array.from(projectRoot.querySelectorAll<HTMLDetailsElement>('details.project-group[open]')).map(g => g.dataset.groupId));
    projectRoot.replaceChildren();
    const cards = new Map<string, HTMLElement>();
    for (const p of projects) {
      const card = el('article', undefined, 'project'); card.append(el('h3', p.name));
      const tags = el('div', undefined, 'tags'); tags.append(tag(labels[p.status] ?? p.status), tag(labels[p.fleet.mode] ?? p.fleet.mode),
        tag(p.fleet.lifecycleLocked ? '生命周期已锁定 / Locked' : '生命周期未锁定 / Unlocked', p.fleet.lifecycleLocked ? 'warn' : ''),
        tag(`${agents.filter(a => a.projectId === p.id).length} 个角色会话`));
      card.append(tags, el('p', `Project ID ${p.id} · ${p.rootPath} · 槽位 ${p.minSlots}–${p.maxSlots}`)); cards.set(p.id, card);
    }
    for (const group of data.projectGroups ?? []) {
      const members = group.members.filter(m => cards.has(m.projectId));
      if (!members.length) continue;
      const section = el('details', undefined, 'project-group');
      section.dataset.groupId = group.id;
      section.open = expandedGroups.has(group.id);
      section.append(el('summary', `${group.name} · ${group.id}`),
        el('p', `${group.leadRole} · ${group.leadIdentity} · ${group.leadConversationKey} · binding metadata · browser NOT_VERIFIED`));
      for (const member of members) {
        const card = cards.get(member.projectId)!;
        const developer = data.agents.find(a => a.id === member.developerSlotId && a.projectId === member.projectId);
        card.append(el('p', `developer · AgentSlot ${member.developerSlotId} · ${developer?.conversationKey ?? 'UNBOUND'} · ${developer?.observationState ?? 'unavailable'}`));
        section.append(card); cards.delete(member.projectId);
      }
      projectRoot.append(section);
    }
    projectRoot.append(...cards.values());
    if (!projects.length) projectRoot.append(el('p', '此 Kernel 尚无项目 / No projects in this Kernel.', 'empty'));
    const agentRoot = get('agents'); agentRoot.replaceChildren();
    for (const a of agents) {
      const row = el('article', undefined, `agent${selected === a.id ? ' selected' : ''}`); row.dataset.slotId = a.id;
      const content = el('div'); content.append(el('h3', `${a.role} · ${names.get(a.projectId) ?? a.projectId}`));
      const currentStatus = a.browserState === 'open' ? a.pageStatus : a.browserState;
      const state = !connected ? '不可用 / Unavailable · 历史快照 / Historical' : a.observationState === 'offline' ? '离线 / Offline' : a.observationState === 'unavailable' ? '观测过期 / Unavailable' : labels[currentStatus] ?? currentStatus;
      const tags = el('div', undefined, 'tags'); tags.append(tag(state, !connected || a.observationState === 'unavailable' ? 'warn' :
        a.quarantined || ['error', 'blocked', 'unauthorized'].includes(currentStatus) ? 'bad' :
        a.observationState === 'fresh' && ['idle', 'generating'].includes(currentStatus) ? 'good' : ''), tag(`期望 / Desired: ${labels[a.desiredState] ?? a.desiredState}`));
      if (a.quarantined) tags.append(tag('已隔离 / Quarantined', 'bad'));
      content.append(tags, el('code', a.conversationKey ?? 'UNBOUND · 尚未绑定 / Not Bound'), el('small', `最近浏览器观测 / Last browser observation ${timestamp(a.browserObservedAt)}`));
      const inspect = el('button', '查看详情 / Details'); inspect.type = 'button'; inspect.setAttribute('aria-label', `查看 ${a.role} 的状态详情 / Inspect role status`);
      inspect.dataset.inspectSlot = a.id;
      inspect.setAttribute('aria-pressed', String(selected === a.id)); inspect.addEventListener('click', () => { selected = a.id; render(); });
      row.append(content, inspect); agentRoot.append(row);
    }
    if (!agents.length) agentRoot.append(el('p', '此范围尚无 AgentSlot / No AgentSlot in selected scope.', 'empty'));
    const detailRoot = get('details'); detailRoot.replaceChildren();
    const agent: RadarAgent | undefined = agents.find(a => a.id === selected);
    if (!agent) detailRoot.append(el('p', '请选择角色查看 Kernel 原始状态 / Select a role to inspect Kernel state.', 'empty'));
    else {
      if (!connected) detailRoot.append(el('p', '历史快照：Kernel 当前不可用 / Historical snapshot: Kernel unavailable; values are not live.', 'detail-note'));
      const fleet = data.projects.find(p => p.id === agent.projectId)?.fleet;
      const fields: [string, string][] = [ ['角色 / Role', agent.role], ['项目 / Project', names.get(agent.projectId) ?? agent.projectId], ['Project ID', agent.projectId], ['AgentSlot', agent.id],
        ['Conversation', agent.conversationKey ?? 'UNBOUND'], ['绑定代数 / Generation', String(agent.conversationGeneration)], ['租约 / Lease epoch', String(agent.leaseEpoch)],
        ['期望状态 / Desired', agent.desiredState], ['Slot 状态 / Slot status', agent.status], ['浏览器状态 / Browser status', agent.browserState], ['页面状态 / Page status', agent.pageStatus], ['观测状态 / Observation', agent.observationState],
        ['生命周期锁 / Lifecycle lock', fleet?.lifecycleLocked ? '锁定 / Locked' : '未锁定 / Unlocked'], ['锁版本 / Lock Revision', String(fleet?.revision ?? 'unavailable')], ['Rollover', agent.rolloverState],
        ['Tab ID', String(agent.browserTabId ?? 'unavailable')], ['浏览器观测 / Browser observed', timestamp(agent.browserObservedAt)], ['页面观测 / Page observed', timestamp(agent.runtimeObservedAt)], ['错误 / 隔离 / Error', agent.error ?? '无记录 / No record'] ];
      const dl = el('dl'); for (const [key, value] of fields) dl.append(el('dt', key), el('dd', value)); detailRoot.append(dl);
    }
    const eventRoot = get('events'); const scroll = eventRoot.scrollTop; eventRoot.replaceChildren();
    const events = data.events.filter(e => !chosen || e.projectId === chosen);
    for (const event of events) {
      const item = el('li', undefined, 'event'); const time = el('time', timestamp(event.createdAt)); time.dateTime = new Date(event.createdAt).toISOString();
      const body = el('div'); body.append(el('strong', event.type), el('small', `#${event.seq} · ${event.projectId ? names.get(event.projectId) ?? event.projectId : 'Kernel'} · ${event.subject}`));
      item.append(time, body); eventRoot.append(item);
    }
    if (!events.length) eventRoot.append(el('li', '最近 100 条中，此范围无事件 / No events for this scope among latest 100.', 'empty'));
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
      get('connection-state').textContent = '已连接 Kernel / Connected';
      get('connection-detail').textContent = `每 3 秒刷新 / 3s refresh · 快照 / Snapshot ${timestamp(data.observedAt)} · 观测超过 / Stale after ${data.observationTtlMs / 1000}s`;
    } catch (error) {
      if (disposed) return;
      connected = false; doc.body.dataset.state = 'unavailable';
      get('connection-state').textContent = 'Kernel 不可用 / Unavailable';
      const reason = error instanceof Error ? error.message : 'REQUEST_FAILED';
      get('connection-detail').textContent = reason === 'READ_SESSION_REQUIRED' || reason === 'HTTP_401' ? '只读会话缺失或失效，请从插件重新打开 / Read session expired; reopen from extension.' :
        `连接失败，正在重试 / Connection failed; retrying. ${snapshot ? `历史快照 / Last snapshot ${timestamp(snapshot.observedAt)}.` : '尚无快照 / No snapshot.'}`;
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
