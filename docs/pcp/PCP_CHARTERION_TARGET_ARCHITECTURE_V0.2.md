# PCP × Charterion｜目标架构、接口及模块改造设计 V0.2

- **状态**：APPROVED DESIGN SCOPE / IMPLEMENTATION PENDING（本次确定“要做什么、职责、约束及验收”；具体代码/API shape 仍须通过测试确定）
- **日期**：2026-10-27；**工程仓**：`Su9moon/Charterion`；**设计分支**：`pcp/role-session-enhancement-v0.1`
- **上位约束**：PCP 主仓 `governance/baselines/PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md`；非冲突部分沿用 V0.1 多对话基线；EO/ES/CB 权威不变。
- **关联文件**：本目录 `PCP_CHARTERION_ENHANCEMENT_BASELINE_V0.1.md`（已知事实和需求），`PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md`（环境/回滚），`PCP_CHARTERION_IMPLEMENTATION_ACCEPTANCE_V0.1.md`（实际动工工序）。
- **声明**：图、接口与状态机是目标设计，不是原版已实现能力；“FIXED”只描述 PCP 已批准的产品组织边界，本文件不会改写原批准角色数。

## A. 产品目标与作用域

Charterion 在 PCP 体系里作为 **WebGPT Session Runtime Adapter**（可选择的具体实现）：准确找到五种逻辑角色已授权的普通 ChatGPT Web 会话；在明确工作引用下通知/投递；读取回复；维护投递证据；失联显式报告和按策略恢复；向未来 PCP Controller/ChatCMD 提供只读可验证的投影。**它不是 PCP 主控制面、工程任务权威或 Codex Worker 运行时。**

PCP Controller 是操作界面/治理入口，**不是第六个 WebGPT Agent**。五角色固定：`supervisor`、`chief_engineer`、`execution_coordinator`、`reviewer`、`operations`。首验 Supervisor → Chief Engineer → Execution Coordinator，另两个仅在对应审核/运维事件参与。没有“一工单必须五人接力”的 Gate。WebGPT 角色数与 CB Worker 数不绑定。

### 目标拓扑（不意味着新增服务）

```text
Human ──授权/目标──> PCP Controller（可与 ChatCMD UI 组合，尚未决定）
                          │  Role Charter/Policy（Git）
                          │  Issue/Workorder/CB refs（权威系统）
                          v
               Charterion PCP Adapter（本 fork）
          ┌──────────────┼─────────────────┐
          │绑定/会话身份  │事件投递/回执      │健康/恢复/审计
          v              v                 v
    Kernel 本地持久态 ↔ Native Host ↔ 专用 Chrome 扩展/ChatGPT 会话
                                                 │
                          Supervisor / Chief Engineer / Execution Coordinator
                          Reviewer / Operations（按需）
                                                 │
                             具有授权的工具调用（非本层伪造）
                                                 v
       GitHub Issue / EO / ES 执行契约 / 现有 CB + Codex Workers
                                                 │
                              Git SHA / PR / Test / CB Task ID / Evidence
                                                 └──> 正式数据 → Controller 投影
```

**不要让 Charterion 自带的 Project/Task DAG/SQLite 取得 EO/ES/CB 工程事实最终权威。** 本地暂存任务或消息仅作为投递测试/会话事务；未来业务任务由上游 `work_ref` 作为指针，正式状态必须查询权威来源。无需本项目再造 Scheduler、Issue 镜像数据库、通用 EventBus 或 Codex Worker。

## B. 架构决策（现阶段确定的要求）

| 决策 | 目标行为（本 fork） | 不做 |
| --- | --- | --- |
| D01 角色是长期逻辑身份 | Role Registry 源于 PCP Git 的版本化定义；Role 不等于 Tab/AgentSlot | 不由随机标签页或原版 Task DAG 生成新的 PCP 角色 |
| D02 绑定是主控权威 | bind/rebind/unbind 显式授权且留变更凭据；新 ChatGPT Conversation 不能仅因 URL 变化自动占用既有授权角色 | 不在刷新、空闲、重启时偷偷重新指派角色 |
| D03 页面资源独立生命周期 | 角色绑定可保持 `bound+offline`；在授权策略内可开/关/恢复页面；测试期间明确 pin 资源 | 不将 `suspend/close tab` 等同于 `unbind role` |
| D04 事件自动、权限不自动 | 可自动发现/探测/投递已授权工作；每个真实工具动作仍用宿主和 CB 正式权限 | 不凭 prompt 授予 Git/生产操作能力 |
| D05 可检验的逐层回执 | 投递 ACK、回复观察、正式证据入库和审核结果各自不同 | 不将网页说“完成了”写成任务验收完成 |
| D06 多浏览器去冲突 | 生产路径单 Native Host + 单专用 Chrome；任何共享实例须显式身份/授权、拒绝交叉占用 | 不凭两个 Chrome Profile 就判定隔离 |
| D07 现有能力最小复用 | 复用 Native Host/Kernel/Content Script/Attempt 记录；评估旧 Task DAG/Elastic Fleet 的局部保留 | 不以跑通原版全部功能作为前提 |
| D08 接口前向兼容 | 与 PCP Controller、GitHub/CB 仅使用真实引用、版本和状态投影 | 不要求先做新桌面 UI 或安装 OpenHands |

## C. 核心对象及不变量

这是**逻辑模型**；不规定必须新增五张表。优先在已有 SQLite/扩展存储中完成最小迁移及一致性测试。

`RoleDefinition`：`role_id`, `role_version`, `charter_ref`, `charter_hash`, `allowed_actions`, `review_boundaries`（Git 是权威）。

`RoleBinding`：`binding_id`, `role_id`, `role_version`, `provider`, `conversation_ref`, `scope_ref?`, `binding_revision`, `authorized_by/ref`, `state` (bound|unbound|needs_attention), `active_work_refs`, `updated_at`。五个逻辑角色不按项目自动复制成五倍；如需一个角色对应多个工作会话，必须有明确 scope 和被选中的绑定，禁止含糊派发。

`SessionObservation`：`runtime_instance_id`, `profile_id`, `extension_origin/id`, `tab_id?`, `content_epoch?`, `conversation_ref_observed?`, `page_status`, `observed_at`, `lease_id?`。这是真实浏览器状态的**易失快照**，不得反向改写 RoleBinding 的权威。

`DeliveryAttempt`：`event_id`, `correlation_id`, `work_ref`, `target_role_id`, `binding_id`, `binding_revision`, `conversation_ref`, `attempt_id`, `state`, `observation_evidence`, `result_ref?`, `timestamps`。记录重复投递保护，而不存真实任务事实复制品。

**必须满足的系统不变量**：
1. 同一运行实例、同一浏览器 Tab 不得同时占有两个互斥 RoleBinding；有冲突时 `blocked`，不能任取一个继续发消息。
2. RoleBinding 的 revision 改变后，旧 revision 的 pending Attempt 不得向新会话自动投递。
3. 未取得可验证 `conversation:<id>` 的 canonical 身份时，绑定只能处于 `provisional` / 待确认；首次创建新会话的转正需可追溯授权与实际 URL 证明；**不允许跨错页发送**。
4. 页面 `unknown`、`unauthorized`、`blocked`、`generating` 或运行来源不一致时拒绝实际物理发送，并报告阻断原因；浏览器总 `ready` 不表示目标角色页可发送。
5. 关闭/重新打开 Chrome、MV3 Service Worker 休眠以及 `tabId` 变化，不得悄然解绑正式角色。
6. 在物理发送后响应不确定时必须进入 `uncertain` 并停止自动重发，先人工/证据对账。
7. 扩展运行时的状态事件包含来源实例或由确定性单实例权威保护，不接受跨实例的旧/伪 `absent` 覆盖活跃绑定。

## D. 角色与页面分离的生命周期

**角色绑定状态**：`unbound → binding_pending → bound → needs_attention → bound（恢复）/unbound（明确授权）`。`suspended` 是调度/页面活动状态，**不是删除 RoleBinding**。

**页面状态**：`offline / opening / idle / generating / unknown / blocked / closing`，由浏览器可信观察驱动。自动恢复失败必须保留离线状态与原因，不无限循环打开标签页。

**会话运行策略**（由 PCP 授权，明确记录在绑定或运行配置）：

- `controlled`（五固定角色默认）：绑定/换绑/解绑明确授权；不会因为 120 秒空闲就销毁角色绑定。是否关闭闲置网页是**另一项** `tab_policy`，不得篡改逻辑绑定。
- `pinned_tab`（开发/排障期）：当前测试页面不被 Elastic Fleet 回收，以便可重复 E2E；仍允许明确关闭或授权恢复。
- `on_demand_tab`（后续）：保留 Conversation 引用，必要时重新打开已有对话并验证登录/身份；不得视为能在 Chrome 关闭时持续推理。
- `elastic`（原版兼容试验）：仅显式加入的临时 AgentSlot，可按 `minSlots` 缩容；固定 PCP RoleBinding 不继承它的自动解绑含义。

建议把独立字段组合表示为 `binding_policy` + `tab_policy`，而不是企图通过 `minSlots=1` 假装实现持久 Role Registry。首次实现先只启用 controlled+pinned，待稳定后扩展 on-demand。

## E. WebGPT 输入/输出及可信交接

输入事件（目标结构）：

```json
{
  "event_id": "stable-upstream-event-id",
  "correlation_id": "stable-cross-role-chain-id",
  "work_ref": "github-issue-or-eo-workorder-ref",
  "source_ref": "approved-source-revision",
  "target_role_id": "chief_engineer",
  "role_version": "git-role-charter-version",
  "binding_revision": 1,
  "event_kind": "work-ready",
  "created_at": "RFC3339 timestamp",
  "requested_action": "notify-or-dispatch"
}
```

提交前验证：来源事件可追溯、目标角色/权限、绑定 revision、当前 Conversation、Chrome 标签所有权、ChatGPT 页面 `idle` 且 composer 可读写、未有同 correlation 的已完成或未决物理 Attempt。

**最低可观测状态序列**：`accepted → target_verified/page_ready → dispatched → acknowledged → reply_observed`；正式 `result_recorded` 与 `reviewed` 只能依据 GitHub/EO/CB 证据生成投影，Charterion 不自行推进。

发送、页面收据、回复关联和正式提交每项分别留 attempt/event 引用；无法证实的一律 `NOT_RUN`、`unavailable`、`uncertain`，不可伪造 exactly-once。可以实现“重复事件仅生成一个活跃物理发送决策”，不保证网页和 MCP 本身的 exactly-once 执行。消息内容优先短格式：角色、工作引用、输入版本、验收项、期望输出路径、受限权限；上下文从正式源独立读取，不群发全量聊天记录。

Reviewer 必须独立读取原始要求和正式 Evidence，不通过 Coordinator 或 Worker 的自述继承“已完成”。无依赖任务可以并行、有依赖任务靠正式证据推进。

## F. 技术模块及改动边界

| 当前文件/模块 | 保留/增强方向 | 测试责任 |
| --- | --- | --- |
| `control/src/config.ts` | 保留 `GAM_HOME → instanceId/pipe/SQLite`；多实例端到端需 Native Host 命名空间和来源鉴权 | 实例身份不冲突 |
| `native-host/scripts/install.ps1`、`native-host/GamNativeHost` | 注册键/manifest/origin 在 Windows 用户级；第二套运行时严禁覆盖同名注册键 | 双实例隔离/卸载回滚 |
| `control/src/elasticFleet.ts`、`control/src/controlPlane.ts` | 增加 managed fixed RoleBinding 策略；保留可选择的 Elastic 逻辑和事件证据 | 空闲 >120s 不误解绑 |
| `src/background.ts`、`src/fleet.ts` | 显式标签所有权和来源身份；只按策略打开/关闭；确保来自正确 Profile | 不发生 lease ping-pong |
| `src/fleetTabRegistry.ts`、`src/bindingRegistry.ts` / `src/bindingStore.ts` | 将 `storage.session` Tab 映射与长期 Conversation 绑定分开；必要字段持久化和冲突拒绝 | Reload/重启恢复 |
| `src/chatgptAdapter.ts`、`src/content.ts` | 2026 ChatGPT DOM readiness、真实发送、回复关联与页面诊断 | 页面 idle / reply-observed |
| `src/browserRuntimeReporting.ts` | 不再把所有扩展实例无条件归到 `gam-default`；具体 profileId shape 实测后确认 | 错实例拒绝 |
| `src/contracts.ts`、现有 Native RPC | 新增关联 ID、revision、失败证据最小字段，确保兼容现有 Caller | type/contract tests |
| `src/sidepanel.ts` | P0/P1 显示绑定、来源、阻断、手动恢复；非 PCP Controller 最终界面 | 错绑可见 |
| `tests/`、`control/tests/` | 稳定性、故障/重复事件、手动权威、完整浏览器 E2E | 可复查证据 |

已有 Draft PR #1（DOM）与 #2（conversation fencing）是候选代码差异而非默认正确实现；分别审核、按测试挑选必要代码，不先合并。当前原版 Task DAG/Auto Supervisor 保留兼容，但 PCP 正式事件路径**不得直接以其本地 completion 代替 EO 工单正式状态**。

## G. 必须拒绝的架构膨胀

- 不重写 PCP 五角色组织，不加第六个 WebGPT Controller。
- 不在 Charterion 新建 CB Worker、GitHub Job 镜像 DB、通用 Scheduler、第二个 EO/ES 引擎。
- 不让 Charterion 直接管理 Human Bridge、生产主机、GitHub 合并授权或 Codex 配额。
- 不强制 Electron、新 Chromium 内核、OpenHands 作为前提。
- 不强制五个角色连续忙碌或任何角色每秒心跳；轮询与恢复受网页、MV3、权限/配额约束。
- 不把 ChatCMD UI 对接作为 P0/P1 blocker；待 WebGPT 真实闭环形成后再接主控制面。

## H. 明确风险及未定实现点

1. 原版绑定记录是按 conversationKey 和 Tab 的混合层次；如何最小迁移到可审计的 RoleBinding，必须评估数据迁移及回退。
2. 正式新会话的首次 canonical URL 建立涉及“空白首页先发送第一条消息”，需在有授权且明确唯一目标下设计单独的 bootstrap 流程；不能假装已直接绑定完成。
3. 同一 Windows 用户级 Native Host 名称的双运行时并装会互相覆盖；命名空间隔离落地前，**同一账号只允许一套已注册 Host**。
4. 真正 MCP 可用性、后台发送和 reply correlation 受 ChatGPT 页面变化影响，必须真实验收。
5. 固定角色的复杂多项目工作是否需要按 scope 多 Conversation，P2 之后依实际工作选择，不提前复制全部会话。

**修改规则**：已确定的产品边界通过本设计维护；源代码实现 API、DB schema、tab_policy 具体枚举可因测试调整，但每次必须有明确 diff/测试/迁移说明，不得悄然越过上游 PCP FIXED 范围。
