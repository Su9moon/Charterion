import type { RadarProject, RadarSnapshot } from '../shared/radar';

export function mountFleetControls(doc: Document, win: Window, fetcher: typeof fetch, options: {
  readToken: () => string; reload: () => Promise<RadarSnapshot | undefined>;
}) {
  const get = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
  const form = get<HTMLFormElement>('fleet-form'), project = get<HTMLSelectElement>('control-project');
  const mode = get<HTMLSelectElement>('fleet-mode'), locked = get<HTMLInputElement>('fleet-locked');
  const credential = get<HTMLInputElement>('control-credential'), reason = get<HTMLTextAreaElement>('control-reason');
  const confirmed = get<HTMLInputElement>('control-confirm'), submit = get<HTMLButtonElement>('control-submit');
  const load = get<HTMLButtonElement>('control-load'), status = get('control-result');
  let projects: RadarProject[] = [], baseline: RadarProject | undefined, connected = false, busy = false, disposed = false;
  let pending: AbortController | undefined;
  const feedback = (text: string, state = '') => { status.textContent = text; status.dataset.state = state; };
  function availability() {
    submit.disabled = busy || !connected || !baseline || !/^fleet_[A-Za-z0-9_-]{43}$/.test(credential.value.trim()) || !reason.value.trim() || !confirmed.checked;
    for (const el of [project, mode, locked, credential, reason, confirmed, load]) el.disabled = busy || !connected;
  }
  function loadCurrent() {
    baseline = projects.find(p => p.id === project.value);
    confirmed.checked = false;
    if (baseline) {
      // Copy the revision seen by the human. Polling must never silently rebase a pending command.
      baseline = { ...baseline, fleet: { ...baseline.fleet } };
      mode.value = baseline.fleet.mode; locked.checked = baseline.fleet.lifecycleLocked;
      get('control-revision').textContent = `操作项目：${baseline.name} · ${baseline.id} · Revision ${baseline.fleet.revision}`;
    } else get('control-revision').textContent = '请选择项目并载入当前版本。';
    availability();
  }
  project.addEventListener('change', () => { credential.value = ''; reason.value = ''; loadCurrent(); feedback('项目已切换，请使用此项目的独立管理授权。'); });
  load.addEventListener('click', () => { loadCurrent(); feedback('已载入当前观测版本，请重新核对并确认。'); });
  form.addEventListener('input', availability);
  form.addEventListener('submit', event => {
    event.preventDefault(); if (submit.disabled || busy || !baseline) return;
    const target = baseline;
    const command = { projectId: target.id, mode: mode.value, lifecycleLocked: locked.checked, expectedRevision: target.fleet.revision,
      reason: reason.value.trim(), requestId: win.crypto.randomUUID() };
    const capability = credential.value.trim();
    busy = true; availability(); feedback('正在提交；请勿重复操作…');
    pending = new AbortController(); const timeout = win.setTimeout(() => pending?.abort(), 8000);
    void (async () => {
      let accepted = false;
      try {
        const response = await fetcher('/pcp/api/fleet-control', { method: 'POST', headers: { 'Content-Type': 'application/json',
          Authorization: `Bearer ${options.readToken()}`, 'X-Charterion-Control': capability }, body: JSON.stringify(command), signal: pending!.signal });
        if (!response.ok) {
          const failure = await response.json() as { error?: string };
          if (response.status === 401 || response.status === 403) credential.value = '';
          const message = response.status === 409 ? '版本冲突或重复请求冲突，未应用本次变更。载入当前版本后重新核对。' :
            response.status === 401 || response.status === 403 ? '授权无效、已过期或不属于此项目。请重新授权；Kernel 重启后需从插件重新打开。' :
              `操作未确认（${failure.error ?? response.status}），请刷新核对状态。`;
          feedback(message, 'error'); await options.reload(); return;
        }
        const receipt = await response.json() as { revision?: number; requestId?: string; changed?: boolean };
        if (receipt.requestId !== command.requestId || !Number.isSafeInteger(receipt.revision)) throw new Error('Invalid receipt');
        accepted = true;
        const fresh = await options.reload(); if (disposed) return;
        const actual = fresh?.projects.find(p => p.id === target.id);
        if (!actual || actual.fleet.revision !== receipt.revision || actual.fleet.mode !== command.mode || actual.fleet.lifecycleLocked !== command.lifecycleLocked) {
          feedback('Kernel 已接受请求，但回读未确认目标状态；请刷新核对，勿直接重试。', 'error'); return;
        }
        loadCurrent(); reason.value = '';
        feedback(receipt.changed ? `已保存并回读确认：${actual.name} · Revision ${actual.fleet.revision}` : '回读确认：设置未变，无新增变更审计。', 'success');
      } catch {
        if (!disposed) {
          feedback(accepted ? 'Kernel 已接受请求，但回读失败；结果尚未确认，请刷新核对。' : '连接失败或响应不明；可能已写入。请刷新核对，勿直接重试。', 'error');
          await options.reload();
        }
      } finally { win.clearTimeout(timeout); pending = undefined; busy = false; confirmed.checked = false; if (!disposed) availability(); }
    })();
  });
  availability();
  return {
    update(snapshot: RadarSnapshot | undefined, online: boolean) {
      connected = online; projects = snapshot?.projects ?? [];
      const selected = project.value; const ids = projects.map(p => p.id);
      if (Array.from(project.options).map(o => o.value).join('|') !== ['', ...ids].join('|')) {
        const empty = doc.createElement('option'); empty.value = ''; empty.textContent = '选择要操作的项目'; project.replaceChildren(empty);
        for (const p of projects) { const option = doc.createElement('option'); option.value = p.id; option.textContent = p.name; project.append(option); }
        project.value = ids.includes(selected) ? selected : '';
      }
      if (baseline && !ids.includes(baseline.id)) { baseline = undefined; credential.value = ''; confirmed.checked = false; }
      if (!online) { credential.value = ''; confirmed.checked = false; }
      availability();
    },
    dispose() { disposed = true; pending?.abort(); credential.value = ''; },
  };
}
