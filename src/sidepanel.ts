import { sidebarIdentities, renderSidebarGroups, type SidebarIdentity } from './sidebarIdentity';
import { projectGroupCards } from './projectGroupCards';
import type {
  AgentMessageType,
  CreateAgentMessageInput,
  CreateTaskInput,
  HumanDecision,
  ManagedMessage,
  ManagedTab,
  ManagedTask,
  RoleBinding,
  RuntimeNotice,
  SendResult,
  TaskDispatchResult,
  TaskKind,
} from './contracts';
import type { NativeControlSnapshot } from './nativeControl';

const controlStatus = required<HTMLSpanElement>('control-status');
required<HTMLButtonElement>('open-console').addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'manager:open-console' }).then((response: { ok: boolean; error?: string }) => {
    if (!response.ok) controlStatus.textContent = response.error ?? '控制台不可用';
  }).catch(() => { controlStatus.textContent = '控制台不可用，请检查扩展和 Kernel'; });
});
const controlSummary = required<HTMLParagraphElement>('control-summary');
const controlProjects = required<HTMLDivElement>('control-projects');
const agentsRoot = required<HTMLDivElement>('agents');
const tasksRoot = required<HTMLDivElement>('tasks');
const messagesRoot = required<HTMLDivElement>('messages');
const dagRoot = required<HTMLDivElement>('dag-view');
const emptyState = required<HTMLDivElement>('empty');
const summary = required<HTMLSpanElement>('summary');
const instruction = required<HTMLTextAreaElement>('instruction');
const sendStatus = required<HTMLParagraphElement>('send-status');
const taskStatus = required<HTMLParagraphElement>('task-status');
const messageStatus = required<HTMLParagraphElement>('message-status');
const stateStatus = required<HTMLParagraphElement>('state-status');
// Visible state labels only; protocol identifiers and task payloads remain unchanged.
const stateLabels: Record<string, string> = {
  idle: '空闲 / idle', generating: '生成中 / generating', blocked: '受阻 / blocked',
  unauthorized: '未登录 / unauthorized', unknown: '未知 / unknown', unavailable: '不可用 / unavailable',
  active: '运行 / active', suspended: '暂停 / suspended', retired: '退役 / retired',
  pending: '待处理 / pending', ready: '就绪 / ready', running: '执行中 / running',
  completed: '完成 / completed', skipped: '跳过 / skipped', cancelled: '取消 / cancelled',
  rejected: '拒绝 / rejected', error: '错误 / error', attention: '需关注 / attention',
  'waiting-human': '等待人工 / waiting-human', 'reply-observed': '已观察回复 / reply-observed',
  acknowledged: '已确认 / acknowledged', failed: '失败 / failed', uncertain: '结果不明 / uncertain',
};
const displayState = (value: string) => stateLabels[value] ?? value;
const selected = new Set<number>();
let tabs: ManagedTab[] = [];
let ordinaryOpen = false;
let tasks: ManagedTask[] = [];
let messages: ManagedMessage[] = [];
let supervisorEnabled = false;
let controlSnapshot: NativeControlSnapshot | undefined;
let lastControlRefresh = 0;
let controlRefreshInFlight: Promise<void> | undefined;
let controlRefreshPending = false;
let controlRefreshPendingForce = false;
let refreshTimer: number | undefined;

function required<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing side panel element #${id}`);
  return node as T;
}

async function request<T>(message: object): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error ?? 'Manager request failed');
  return response as T;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function setStatus(node: HTMLElement, text: string, isError = false): void {
  node.textContent = text;
  node.classList.toggle('error', isError);
}

function taskName(taskId: string): string {
  return tasks.find((item) => item.task.id === taskId)?.task.title ?? taskId;
}

function bindingInput(labelText: string, value: string, wide = false): { wrap: HTMLLabelElement; input: HTMLInputElement } {
  const wrap = el('label', wide ? 'wide' : undefined);
  wrap.append(document.createTextNode(labelText));
  const input = el('input');
  input.value = value;
  input.autocomplete = 'off';
  wrap.append(input);
  return { wrap, input };
}

async function persistBinding(
  tab: ManagedTab,
  inputs: readonly [HTMLInputElement, HTMLInputElement, HTMLInputElement],
): Promise<void> {
  const binding: RoleBinding = {
    role: inputs[0].value.trim(),
    project: inputs[1].value.trim(),
    notes: inputs[2].value.trim(),
  };
  await request({
    type: 'manager:update-binding',
    tabId: tab.tabId,
    conversationKey: tab.snapshot.conversationKey,
    binding,
  });
}

function renderAgent(identity: SidebarIdentity): HTMLElement {
  const { tab } = identity;
  const card = el('article', 'agent-card');
  const head = el('div', 'agent-head');
  const checkbox = el('input', 'agent-select');
  checkbox.type = 'checkbox';
  checkbox.checked = selected.has(tab.tabId);
  checkbox.addEventListener('change', () => checkbox.checked ? selected.add(tab.tabId) : selected.delete(tab.tabId));
  const title = el('div', 'agent-title');
  const strong = el('strong');
  strong.textContent = identity.state === 'managed' ? identity.agent!.role : tab.snapshot.title;
  const small = el('small');
  small.textContent = tab.binding.project || tab.snapshot.title;
  title.append(strong, small);
  const badge = el('span', `status status-${tab.snapshot.status}`);
  badge.textContent = displayState(tab.snapshot.status);
  head.append(checkbox, title, badge);
  card.append(head);

  const metadata = el('small');
  metadata.textContent = `Tab ID: ${tab.tabId} · Conversation: ${tab.snapshot.conversationKey || 'unavailable'} · Project: ${identity.agent?.projectId ?? tab.binding.projectId ?? 'unavailable'} · Role: ${(identity.agent?.role ?? tab.binding.role) || 'unavailable'} · ${identity.state} · AgentSlot: ${identity.agent?.id ?? 'unavailable'}${identity.duplicate ? ' · duplicate conversation / additional tab instances' : ''}${identity.agent && identity.agent.browserTabId !== tab.tabId ? ' · additional tab, not lease owner' : ''}`;
  card.append(metadata);

  const grid = el('div', 'binding-grid');
  const role = bindingInput('角色 / Role', tab.binding.role);
  const project = bindingInput('项目 / Project', tab.binding.project);
  const notes = bindingInput('备注 / Notes', tab.binding.notes, true);
  const inputs = [role.input, project.input, notes.input] as const;
  for (const input of inputs) input.addEventListener('change', () => {
    void persistBinding(tab, inputs).catch((error) => setStatus(sendStatus, String(error), true));
  });
  grid.append(role.wrap, project.wrap, notes.wrap);
  if (identity.state === 'managed') card.append(grid);

  if (tab.snapshot.latestAssistantText) {
    const latest = el('div', 'latest');
    latest.textContent = tab.snapshot.latestAssistantText;
    card.append(latest);
  }
  if (tab.lastAttempt) {
    const attempt = el('div', `attempt attempt-${tab.lastAttempt.state}`);
    const replySuffix = tab.lastAttempt.replyMessageId ? ` · ${tab.lastAttempt.replyMessageId}` : '';
    attempt.textContent = `最近发送 / Last send: ${displayState(tab.lastAttempt.state)}${replySuffix}`;
    card.append(attempt);
  }
  const actions = el('div', 'agent-actions');
  const focus = el('button');
  focus.type = 'button';
  focus.textContent = '切换标签 / Focus Tab';
  focus.addEventListener('click', () => {
    void request({ type: 'manager:focus', tabId: tab.tabId })
      .catch((error) => setStatus(sendStatus, String(error), true));
  });
  actions.append(focus);
  card.append(actions);
  return card;
}

function renderAttemptHistory(managed: ManagedTask): HTMLElement | undefined {
  if (managed.attemptHistory.length === 0) return undefined;
  const details = el('details', 'task-history');
  const summaryNode = el('summary');
  summaryNode.textContent = `尝试记录 / Attempt History (${managed.attemptHistory.length})`;
  details.append(summaryNode);
  for (const attempt of [...managed.attemptHistory].reverse()) {
    const item = el('div', `history-item history-${attempt.state}`);
    const meta = el('div', 'history-meta');
    meta.textContent = `${displayState(attempt.state)} · ${attempt.attemptId}`;
    item.append(meta);
    if (attempt.error) {
      const error = el('div', 'task-error');
      error.textContent = attempt.error;
      item.append(error);
    }
    if (attempt.replyTextTail) {
      const reply = el('pre', 'history-reply');
      reply.textContent = attempt.replyTextTail;
      item.append(reply);
    }
    details.append(item);
  }
  return details;
}

function renderTask(managed: ManagedTask): HTMLElement {
  const card = el('article', 'task-card');
  const head = el('div', 'task-head');
  const title = el('div', 'task-title');
  const strong = el('strong');
  strong.textContent = managed.task.title;
  const small = el('small');
  const role = managed.task.kind === 'human' ? 'human' : managed.task.targetRole;
  small.textContent = `${managed.task.kind} · ${managed.task.completionPolicy} · ${role}${managed.task.project ? ` · ${managed.task.project}` : ''}`;
  title.append(strong, small);
  const badge = el('span', `task-state task-state-${managed.status}`);
  badge.textContent = displayState(managed.status);
  head.append(title, badge);
  card.append(head);

  const id = el('code', 'task-id');
  id.textContent = managed.task.id;
  card.append(id);
  if (managed.task.dependsOn.length > 0) {
    const deps = el('div', 'task-deps');
    deps.textContent = `依赖 / Depends on: ${managed.task.dependsOn.map(taskName).join(' · ')}`;
    card.append(deps);
  }
  if (managed.task.kind === 'review') {
    const reviewMeta = el('div', 'task-deps');
    const target = managed.task.reviewTargetTaskId ? taskName(managed.task.reviewTargetTaskId) : 'missing target';
    reviewMeta.textContent = `审核目标 / Review target: ${target} · 轮次 / Round ${managed.reviewRound ?? 0}/${managed.task.maxReviewRounds ?? 3}`;
    card.append(reviewMeta);
  }
  const body = el('div', 'task-instruction');
  body.textContent = managed.task.instruction;
  card.append(body);
  if (managed.task.revisionInstruction) {
    const revision = el('div', 'task-review-remediation');
    revision.textContent = `要求修订 / Revision requested: ${managed.task.revisionInstruction}`;
    card.append(revision);
  }
  if (managed.lastAttempt?.error) {
    const error = el('div', 'task-error');
    error.textContent = managed.lastAttempt.error;
    card.append(error);
  }
  if (managed.structuredResult) {
    const result = el('div', 'task-review task-review-pass');
    result.textContent = `结构化结果 / Structured result: ${managed.structuredResult.summary}`;
    card.append(result);
    const evidence = el('pre', 'history-reply');
    evidence.textContent = managed.structuredResult.evidence.map((item) => `- ${item}`).join('\n');
    card.append(evidence);
  }
  if (managed.structuredResultError) {
    const resultError = el('div', 'task-error');
    resultError.textContent = `结构化结果协议错误 / Structured-result protocol error: ${managed.structuredResultError}`;
    card.append(resultError);
  }
  if (managed.reviewResult) {
    const review = el('div', `task-review task-review-${managed.reviewResult.decision}`);
    review.textContent = `审核 / Review ${managed.reviewResult.decision.toUpperCase()}: ${managed.reviewResult.reason}`;
    card.append(review);
    if (managed.reviewResult.nextInstruction) {
      const remediation = el('div', 'task-review-remediation');
      remediation.textContent = `后续 / Next: ${managed.reviewResult.nextInstruction}`;
      card.append(remediation);
    }
  }
  if (managed.reviewError) {
    const reviewError = el('div', 'task-error');
    reviewError.textContent = `审核协议错误 / Review protocol error: ${managed.reviewError}`;
    card.append(reviewError);
  }
  if (managed.reviewLoopExhausted) {
    const exhausted = el('div', 'task-error');
    exhausted.textContent = '审核轮次已达到上限 / Review loop exhausted its configured maximum rounds.';
    card.append(exhausted);
  }
  if (managed.task.humanDecision) {
    const human = el('div', `task-human task-human-${managed.task.humanDecision.decision}`);
    human.textContent = `人工决策 / Human ${managed.task.humanDecision.decision.toUpperCase()}${managed.task.humanDecision.reason ? `: ${managed.task.humanDecision.reason}` : ''}`;
    card.append(human);
  }
  const history = renderAttemptHistory(managed);
  if (history) card.append(history);

  const actions = el('div', 'task-actions');
  let hasAction = false;
  if (managed.status === 'waiting-human') {
    for (const decision of ['approve', 'reject'] as HumanDecision[]) {
      const button = el('button');
      button.type = 'button';
      button.textContent = decision === 'approve' ? '批准 / Approve' : '拒绝 / Reject';
      button.addEventListener('click', () => {
        const reason = window.prompt(`可选原因 / Optional reason for ${decision}:`, '') ?? '';
        void request({ type: 'manager:decide-human-task', taskId: managed.task.id, decision, reason })
          .then(async () => { setStatus(taskStatus, `人工任务已处理 / Human task ${decision}d.`); await refresh(); })
          .catch((error) => setStatus(taskStatus, String(error), true));
      });
      actions.append(button);
      hasAction = true;
    }
  }
  if (managed.task.kind === 'review' && managed.reviewResult?.decision === 'fail' && !managed.reviewLoopExhausted) {
    const revise = el('button');
    revise.type = 'button';
    revise.textContent = '修订并复审 / Revise & Re-review';
    revise.addEventListener('click', () => {
      void request({ type: 'manager:retry-review-loop', taskId: managed.task.id })
        .then(async () => { setStatus(taskStatus, '已请求修订；完成后重新审核 / Revision requested; review will re-run after completion.'); await refresh(); })
        .catch((error) => setStatus(taskStatus, String(error), true));
    });
    actions.append(revise);
    hasAction = true;
  }
  const plainRetry = (managed.status === 'error' || managed.status === 'attention') &&
    !(managed.task.kind === 'review' && managed.reviewResult?.decision === 'fail');
  if (plainRetry) {
    const retry = el('button');
    retry.type = 'button';
    retry.textContent = '重试 / Retry';
    retry.addEventListener('click', () => {
      void request({ type: 'manager:retry-task', taskId: managed.task.id })
        .then(async () => { setStatus(taskStatus, '已请求重试 / Retry requested.'); await refresh(); })
        .catch((error) => setStatus(taskStatus, String(error), true));
    });
    actions.append(retry);
    hasAction = true;
  }
  if (['pending', 'ready', 'waiting-human', 'error', 'attention', 'blocked'].includes(managed.status)) {
    const skip = el('button');
    skip.type = 'button';
    skip.textContent = '跳过 / Skip';
    skip.addEventListener('click', () => {
      const reason = window.prompt('可选跳过原因 / Optional skip reason:', '') ?? '';
      void request({ type: 'manager:skip-task', taskId: managed.task.id, reason })
        .then(async () => { setStatus(taskStatus, '已跳过 / Task skipped.'); await refresh(); })
        .catch((error) => setStatus(taskStatus, String(error), true));
    });
    actions.append(skip);
    hasAction = true;
  }
  if (!['completed', 'skipped', 'cancelled', 'rejected'].includes(managed.status)) {
    const cancel = el('button');
    cancel.type = 'button';
    cancel.textContent = '取消 / Cancel';
    cancel.addEventListener('click', () => {
      const reason = window.prompt('可选取消原因 / Optional cancellation reason:', '') ?? '';
      void request({ type: 'manager:cancel-task', taskId: managed.task.id, reason })
        .then(async () => { setStatus(taskStatus, '已取消任务编排 / Task orchestration cancelled.'); await refresh(); })
        .catch((error) => setStatus(taskStatus, String(error), true));
    });
    actions.append(cancel);
    hasAction = true;
  }
  if (hasAction) card.append(actions);
  return card;
}

function renderDag(): void {
  if (tasks.length === 0) {
    dagRoot.replaceChildren();
    return;
  }
  const rows = tasks.map((managed) => {
    const row = el('div', 'dag-row');
    const parents = managed.task.dependsOn.length > 0
      ? managed.task.dependsOn.map(taskName).join(' + ')
      : 'ROOT';
    const edge = el('span', 'dag-edge');
    edge.textContent = `${parents} → `;
    const node = el('span', `dag-node task-state-${managed.status}`);
    node.textContent = `${managed.task.title} [${displayState(managed.status)}]`;
    row.append(edge, node);
    return row;
  });
  dagRoot.replaceChildren(...rows);
}

function updateTaskEditorOptions(): void {
  const deps = required<HTMLSelectElement>('task-deps');
  const selectedDeps = new Set([...deps.selectedOptions].map((option) => option.value));
  const depOptions = tasks.map((managed) => {
    const option = el('option');
    option.value = managed.task.id;
    option.textContent = `${managed.task.title} · ${displayState(managed.status)}`;
    option.selected = selectedDeps.has(managed.task.id);
    return option;
  });
  deps.replaceChildren(...depOptions);

  const reviewTarget = required<HTMLSelectElement>('task-review-target');
  const currentTarget = reviewTarget.value;
  const targetOptions = [el('option'), ...tasks.map((managed) => {
    const option = el('option');
    option.value = managed.task.id;
    option.textContent = managed.task.title;
    return option;
  })];
  targetOptions[0]!.value = '';
  targetOptions[0]!.textContent = '选择待审核任务 / Select Reviewed Task';
  reviewTarget.replaceChildren(...targetOptions);
  if (tasks.some((managed) => managed.task.id === currentTarget)) reviewTarget.value = currentTarget;
}

function updateTaskKindFields(): void {
  const kind = required<HTMLSelectElement>('task-kind').value as TaskKind;
  required<HTMLElement>('task-role-wrap').hidden = kind === 'human';
  required<HTMLElement>('task-review-target-wrap').hidden = kind !== 'review';
  required<HTMLElement>('task-review-rounds-wrap').hidden = kind !== 'review';
  if (kind === 'human') required<HTMLInputElement>('task-role').value = '';
}

function ensureReviewTargetDependency(): void {
  const target = required<HTMLSelectElement>('task-review-target').value;
  if (!target) return;
  const deps = required<HTMLSelectElement>('task-deps');
  for (const option of [...deps.options]) {
    if (option.value === target) option.selected = true;
  }
}

function renderControl(): void {
  if (!controlSnapshot) { controlProjects.replaceChildren(); controlSummary.textContent = '本地控制平面不可用时仍可浏览器编排 / Browser orchestration remains available without the local control plane.'; return; }
  const runtime = [...controlSnapshot.browserRuntime].sort((x, y) => y.observedAt - x.observedAt)[0];
  const auth = runtime?.authStatus ?? 'unknown';
  const cards = controlSnapshot.projects.map((project) => {
    const card = el('article', 'control-project-card'); const title = el('strong'); title.textContent = project.name; const meta = el('small');
    const agentCount = controlSnapshot!.agents.filter((x) => x.projectId === project.id).length; const resourceCount = controlSnapshot!.resources.filter((x) => x.projectId === project.id).length; const leaseCount = controlSnapshot!.leases.filter((x) => x.projectId === project.id && x.status === 'active').length;
    const changes = controlSnapshot!.changeRequests.filter((x) => x.projectId === project.id); const openRequests = controlSnapshot!.workerRequests.filter((x) => x.projectId === project.id && x.status === 'open'); const reviewable = changes.filter((x) => x.status === 'open').length; const mergeReady = changes.filter((x) => x.status === 'approved' || x.status === 'queued').length;
    meta.textContent = [project.status, project.isolationTier, agentCount + ' 个角色 / agent(s)', resourceCount + ' 个资源 / resource(s)', leaseCount + ' 个租约 / active lease(s)', reviewable + ' 个待审变更 / reviewable CR(s)', openRequests.length + ' 个 Worker 请求 / worker request(s)', mergeReady + ' 个可合并 / merge-ready'].join(' · ');
    const path = el('code', 'control-project-path'); path.textContent = project.rootPath; card.append(title, meta, path);
    const projectAgents = controlSnapshot!.agents.filter((agent) => agent.projectId === project.id);
    for (const agent of projectAgents) {
      const row = el('div', 'control-agent-row');
      const tab = agent.browserTabId !== undefined ? 'tab ' + agent.browserTabId : '无标签 / no tab';
      row.textContent = [agent.role, agent.id, agent.conversationKey ?? 'unbound', '期望 / desired ' + displayState(agent.desiredState), '浏览器 / browser ' + displayState(agent.browserState), tab].join(' · ');
      if (agent.browserError) row.title = agent.browserError;
      card.append(row);
    }
    for (const request of openRequests.slice(-5).reverse()) {
      const row = el('div', 'control-request-row');
      row.textContent = ['REQUEST', request.type, request.fromSubject, request.title].join(' · ');
      row.title = request.body + (request.suggestedAction ? '\nSuggested: ' + request.suggestedAction : '');
      card.append(row);
    }
    for (const change of changes.slice(-5).reverse()) { const row = el('div', 'control-change-row'); const reviews = controlSnapshot!.reviews.filter((x) => x.changeRequestId === change.id); const latestReview = reviews.at(-1); const queue = controlSnapshot!.mergeQueue.find((x) => x.changeRequestId === change.id); const reviewText = latestReview ? latestReview.verdict : 'pending-review'; const queueText = queue ? queue.status + (queue.candidateSha ? ':' + queue.candidateSha.slice(0, 10) : '') : 'not-queued'; row.textContent = [change.status, change.branch + ' → ' + change.targetBranch, 'r' + change.revision, change.headSha.slice(0, 10), reviewText, queueText].join(' · '); card.append(row); }
    return card;
  });
  controlProjects.replaceChildren(...projectGroupCards(controlSnapshot, cards)); const activeLeases = controlSnapshot.leases.filter((x) => x.status === 'active').length; const tabs = runtime?.openTabs ?? 0;
  controlSummary.textContent = ['ChatGPT ' + auth, tabs + ' 个标签 / tab(s)', controlSnapshot.projects.length + ' 个项目 / project(s)', controlSnapshot.agents.length + ' 个角色槽 / agent slot(s)', activeLeases + ' 个租约 / active lease(s)', controlSnapshot.mergeQueue.filter((x) => x.status === 'validating').length + ' 个验证中的合并 / validating merge(s)'].join(' · ');
}

async function refreshControlOnce(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastControlRefresh < 2000) return;
  lastControlRefresh = now;
  try {
    const response = await request<{ snapshot: NativeControlSnapshot }>({ type: 'manager:control-snapshot' });
    controlSnapshot = response.snapshot;
    setStatus(controlStatus, '已连接 / connected');
  } catch (error) {
    controlSnapshot = undefined;
    setStatus(controlStatus, '不可用 / unavailable', true);
    controlSummary.textContent = error instanceof Error ? error.message : String(error);
  }
  renderControl();
  render();
}

function refreshControl(force = false): Promise<void> {
  const now = Date.now();
  if (!force && !controlRefreshInFlight && now - lastControlRefresh < 2000) return Promise.resolve();
  controlRefreshPending = true;
  controlRefreshPendingForce ||= force;
  if (controlRefreshInFlight) return controlRefreshInFlight;

  controlRefreshInFlight = (async () => {
    do {
      controlRefreshPending = false;
      const nextForce = controlRefreshPendingForce;
      controlRefreshPendingForce = false;
      await refreshControlOnce(nextForce);
    } while (controlRefreshPending);
  })().finally(() => {
    controlRefreshInFlight = undefined;
  });
  return controlRefreshInFlight;
}

function render(): void {
  agentsRoot.replaceChildren(...renderSidebarGroups(sidebarIdentities(tabs, controlSnapshot), renderAgent, ordinaryOpen, open => { ordinaryOpen = open; }));
  tasksRoot.replaceChildren(...tasks.map(renderTask));
  messagesRoot.replaceChildren(...messages.map(renderMessage));
  renderDag();
  updateTaskEditorOptions();
  emptyState.hidden = tabs.length !== 0;
  const idle = tabs.filter((tab) => tab.snapshot.status === 'idle').length;
  const generating = tabs.filter((tab) => tab.snapshot.status === 'generating').length;
  const attention = tabs.filter((tab) => !['idle', 'generating'].includes(tab.snapshot.status)).length;
  summary.textContent = `${tabs.length} 已打开 / open · ${idle} 空闲 / idle · ${generating} 生成中 / generating · ${attention} 需关注 / attention`;
}

let refreshInFlight: Promise<void> | undefined;
let refreshPending = false;

async function refreshOnce(): Promise<void> {
  try {
    const response = await request<{ tabs: ManagedTab[]; tasks: ManagedTask[]; messages: ManagedMessage[]; supervisorEnabled: boolean }>({ type: 'manager:list' });
    tabs = response.tabs;
    tasks = response.tasks;
    messages = response.messages;
    supervisorEnabled = response.supervisorEnabled;
    required<HTMLInputElement>('supervisor-enabled').checked = supervisorEnabled;
    const present = new Set(tabs.map((tab) => tab.tabId));
    for (const tabId of [...selected]) if (!present.has(tabId)) selected.delete(tabId);
    render();
  } catch (error) {
    setStatus(sendStatus, error instanceof Error ? error.message : String(error), true);
  }
}

function refresh(): Promise<void> {
  refreshPending = true;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    do {
      refreshPending = false;
      await refreshOnce();
    } while (refreshPending);
  })().finally(() => {
    refreshInFlight = undefined;
  });
  return refreshInFlight;
}

function scheduleRefresh(): void {
  if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = undefined;
    void refresh();
  }, 120);
}

async function sendSelected(): Promise<void> {
  const text = instruction.value.trim();
  if (!text) return setStatus(sendStatus, '请先填写指令 / Enter an instruction first.', true);
  const tabIds = [...selected];
  if (tabIds.length === 0) return setStatus(sendStatus, '请至少选择一个角色 / Select at least one agent.', true);
  setStatus(sendStatus, `正在发送到 ${tabIds.length} 个角色 / Sending to ${tabIds.length} agent(s)…`);
  try {
    const response = await request<{ results: SendResult[] }>({ type: 'manager:send', tabIds, text });
    const failed = response.results.filter((result) => !result.ok);
    setStatus(
      sendStatus,
      failed.length === 0
        ? `已发送到 ${response.results.length} 个角色 / Sent to ${response.results.length} agent(s).`
        : `${failed.length}/${response.results.length} 个发送失败 / send(s) failed.`,
      failed.length > 0,
    );
    await refresh();
  } catch (error) {
    setStatus(sendStatus, error instanceof Error ? error.message : String(error), true);
  }
}

function dependencyIds(): string[] {
  return [...required<HTMLSelectElement>('task-deps').selectedOptions].map((option) => option.value);
}

async function createTask(): Promise<void> {
  const kind = required<HTMLSelectElement>('task-kind').value as TaskKind;
  const reviewTarget = required<HTMLSelectElement>('task-review-target').value;
  if (kind === 'review') ensureReviewTargetDependency();
  const input: CreateTaskInput = {
    kind,
    title: required<HTMLInputElement>('task-title').value.trim(),
    project: required<HTMLInputElement>('task-project').value.trim(),
    instruction: required<HTMLTextAreaElement>('task-instruction').value.trim(),
    targetRole: kind === 'human' ? '' : required<HTMLInputElement>('task-role').value.trim(),
    dependsOn: dependencyIds(),
  };
  if (kind === 'review') {
    if (reviewTarget) input.reviewTargetTaskId = reviewTarget;
    input.maxReviewRounds = Number(required<HTMLInputElement>('task-review-rounds').value);
  }
  setStatus(taskStatus, '正在创建任务 / Creating task…');
  try {
    await request({ type: 'manager:create-task', input });
    setStatus(taskStatus, '任务已创建 / Task created.');
    required<HTMLInputElement>('task-title').value = '';
    required<HTMLTextAreaElement>('task-instruction').value = '';
    required<HTMLSelectElement>('task-deps').selectedIndex = -1;
    await refresh();
  } catch (error) {
    setStatus(taskStatus, error instanceof Error ? error.message : String(error), true);
  }
}

async function runReadyTasks(): Promise<void> {
  setStatus(taskStatus, '正在派发就绪任务 / Dispatching ready tasks…');
  try {
    const response = await request<{ results: TaskDispatchResult[] }>({ type: 'manager:run-ready-tasks' });
    const failed = response.results.filter((result) => !result.ok);
    const sent = response.results.length - failed.length;
    setStatus(
      taskStatus,
      response.results.length === 0
        ? '暂无就绪任务 / No tasks are ready.'
        : `${sent} 个已派发 / dispatched · ${failed.length} 个未派发 / not dispatched.`,
      failed.length > 0,
    );
    await refresh();
  } catch (error) {
    setStatus(taskStatus, error instanceof Error ? error.message : String(error), true);
  }
}

async function setSupervisorMode(enabled: boolean): Promise<void> {
  setStatus(taskStatus, enabled ? '正在启用自动主管 / Enabling auto supervisor…' : '正在停用自动主管 / Disabling auto supervisor…');
  try {
    await request({ type: 'manager:set-supervisor-enabled', enabled });
    supervisorEnabled = enabled;
    setStatus(taskStatus, enabled ? '自动主管已启用 / Auto supervisor enabled.' : '自动主管已停用 / Auto supervisor disabled.');
    await refresh();
  } catch (error) {
    required<HTMLInputElement>('supervisor-enabled').checked = supervisorEnabled;
    setStatus(taskStatus, error instanceof Error ? error.message : String(error), true);
  }
}

async function exportState(): Promise<void> {
  setStatus(stateStatus, '正在导出状态 / Exporting state…');
  try {
    const response = await request<{ document: string }>({ type: 'manager:export-state' });
    required<HTMLTextAreaElement>('state-json').value = response.document;
    setStatus(stateStatus, '状态已导出 / State exported.');
  } catch (error) {
    setStatus(stateStatus, error instanceof Error ? error.message : String(error), true);
  }
}

async function importState(): Promise<void> {
  const document = required<HTMLTextAreaElement>('state-json').value.trim();
  if (!document) return setStatus(stateStatus, '请先粘贴状态文档 / Paste a state document first.', true);
  setStatus(stateStatus, '正在验证并导入状态 / Validating and importing state…');
  try {
    await request({ type: 'manager:import-state', document });
    setStatus(stateStatus, '状态已导入 / State imported.');
    await refresh();
  } catch (error) {
    setStatus(stateStatus, error instanceof Error ? error.message : String(error), true);
  }
}

required<HTMLButtonElement>('refresh').addEventListener('click', () => { void refresh(); void refreshControl(true); });
required<HTMLButtonElement>('send-selected').addEventListener('click', () => void sendSelected());
required<HTMLButtonElement>('create-task').addEventListener('click', () => void createTask());
required<HTMLButtonElement>('run-ready').addEventListener('click', () => void runReadyTasks());
required<HTMLButtonElement>('export-state').addEventListener('click', () => void exportState());
required<HTMLButtonElement>('import-state').addEventListener('click', () => void importState());
required<HTMLInputElement>('supervisor-enabled').addEventListener('change', (event) => {
  void setSupervisorMode((event.currentTarget as HTMLInputElement).checked);
});
required<HTMLSelectElement>('task-kind').addEventListener('change', updateTaskKindFields);
required<HTMLSelectElement>('task-review-target').addEventListener('change', ensureReviewTargetDependency);
required<HTMLButtonElement>('select-idle').addEventListener('click', () => {
  selected.clear();
  for (const identity of sidebarIdentities(tabs, controlSnapshot)) if (identity.idle) selected.add(identity.tab.tabId);
  render();
});
required<HTMLButtonElement>('clear-selection').addEventListener('click', () => {
  selected.clear();
  render();
});

chrome.runtime.onMessage.addListener((message: RuntimeNotice) => {
  if (message.type === 'manager:changed') scheduleRefresh();
  return false;
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { void refresh(); void refreshControl(true); }
});

updateTaskKindFields();
void refresh();
void refreshControl(true);

function renderMessage(managed: ManagedMessage): HTMLElement {
  const card = el('article', 'message-card');
  const head = el('div', 'message-head');
  const title = el('div', 'message-title');
  const strong = el('strong');
  const target = managed.message.target.kind === 'role' ? managed.message.target.role : '@project';
  strong.textContent = `${managed.message.fromRole} → ${target}`;
  const small = el('small');
  small.textContent = `${managed.message.type} · ${managed.message.project}`;
  title.append(strong, small);
  const badge = el('span', 'message-attempt-count');
  badge.textContent = `${managed.attemptHistory.length} 次发送 / send(s)`;
  head.append(title, badge);
  card.append(head);

  const body = el('div', 'message-content');
  body.textContent = managed.message.content;
  card.append(body);
  if (managed.message.taskId) {
    const related = el('div', 'task-deps');
    related.textContent = `关联任务 / Related task: ${taskName(managed.message.taskId)}`;
    card.append(related);
  }
  if (managed.attemptHistory.length > 0) {
    const details = el('details', 'message-history');
    const summaryNode = el('summary');
    summaryNode.textContent = '投递记录 / Delivery History';
    details.append(summaryNode);
    for (const attempt of [...managed.attemptHistory].reverse()) {
      const item = el('div', `history-item history-${attempt.state}`);
      const meta = el('div', 'history-meta');
      meta.textContent = `${attempt.state} · ${attempt.conversationKey}`;
      item.append(meta);
      if (attempt.error) {
        const error = el('div', 'task-error');
        error.textContent = attempt.error;
        item.append(error);
      }
      if (attempt.replyTextTail) {
        const reply = el('pre', 'history-reply');
        reply.textContent = attempt.replyTextTail;
        item.append(reply);
      }
      details.append(item);
    }
    card.append(details);
  }
  const actions = el('div', 'message-actions');
  const deliver = el('button');
  deliver.type = 'button';
  deliver.textContent = '投递 / Deliver';
  deliver.addEventListener('click', () => {
    void request<{ results: SendResult[] }>({ type: 'manager:dispatch-message', messageId: managed.message.id })
      .then(async (response) => {
        setStatus(messageStatus, response.results.length === 0 ? '消息已投递给全部当前接收者 / Message already delivered to all current recipients.' : `已投递给 ${response.results.length} 个接收者 / Delivered to ${response.results.length} recipient(s).`);
        await refresh();
      })
      .catch((error) => setStatus(messageStatus, String(error), true));
  });
  actions.append(deliver);
  card.append(actions);
  return card;
}

function updateMessageTargetFields(): void {
  const kind = required<HTMLSelectElement>('message-target-kind').value;
  required<HTMLElement>('message-target-role-wrap').hidden = kind === 'project';
}

async function queueMessage(): Promise<void> {
  const targetKind = required<HTMLSelectElement>('message-target-kind').value;
  const input: CreateAgentMessageInput = {
    project: required<HTMLInputElement>('message-project').value.trim(),
    fromRole: required<HTMLInputElement>('message-from').value.trim(),
    target: targetKind === 'project'
      ? { kind: 'project' }
      : { kind: 'role', role: required<HTMLInputElement>('message-target-role').value.trim() },
    type: required<HTMLSelectElement>('message-type').value as AgentMessageType,
    content: required<HTMLTextAreaElement>('message-content').value.trim(),
  };
  const taskId = required<HTMLInputElement>('message-task').value.trim();
  if (taskId) input.taskId = taskId;
  setStatus(messageStatus, '正在加入消息队列 / Queueing message…');
  try {
    await request({ type: 'manager:create-message', input });
    required<HTMLTextAreaElement>('message-content').value = '';
    setStatus(messageStatus, '消息已入队，接收者就绪时再投递 / Message queued. Use Deliver when recipients are ready.');
    await refresh();
  } catch (error) {
    setStatus(messageStatus, error instanceof Error ? error.message : String(error), true);
  }
}

required<HTMLButtonElement>('queue-message').addEventListener('click', () => void queueMessage());
required<HTMLSelectElement>('message-target-kind').addEventListener('change', updateMessageTargetFields);
updateMessageTargetFields();
