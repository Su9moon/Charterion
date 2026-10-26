# PCP × Charterion｜实施工单分解、验证矩阵与开工条件 V0.1

- **日期**：2026-10-27
- **状态**：DELIVERY PLAN FIXED；**所有代码改造与新 E2E 均为 NOT_RUN**
- **开发分支**：`pcp/role-session-enhancement-v0.1`
- **输入**：`PCP_CHARTERION_ENHANCEMENT_BASELINE_V0.1.md`、`PCP_CHARTERION_TARGET_ARCHITECTURE_V0.2.md`、`PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md`
- **优先准则**：不再为跑通作者原版循环排障；每次只改与 PCP 某项确定需求对应的最小范围，立即在真实浏览器验收。原版功能存在≠适配完成。

## 1. 顺序及关键路径

```text
S0：当前源码/PR/实际运行包对齐（只读）
 ↓
P0A：角色身份/会话持久绑定与主控授权
 ↓
P0B：分离 Tab 与 Role 生命周期（controlled + pinned）
 ↓
P1A：正确识别 ChatGPT 页面/构造初始 Conversation
 ↓
P1B：单角色发送、关联回复、重复与不确定状态
 ↓
P2：三固定 WebGPT 角色各自收到不同事件、非前台交接
 ↓
P3：真实 Issue/CB + Reviewer，故障恢复、权限与证据
 ↓
P4：Operations + 主控只读投影
```

可并行进行的仅限不影响实测状态的独立静态检查/测试设计；真正 Native Host、Kernel、Extension 升级必须遵循部署 Gate。不因为 P3 要 CB 就在 P0 引入 CB 新开发工作或 GitHub Actions Runner。

## 2. 最先执行的四项小工单

### CH-PCP-00｜环境与源码锁定（read-only；第一项）

**输入**：已安装运行的 Chrome Extension 0.5.0、`GAM_HOME`、Charterion fork `main`、Draft PR #1/#2、当前设计分支 SHA。

**工作**：
1. 读 `git status`、工作树 HEAD、`package.json`、`manifest.json`、实际加载 Extension ID/dir/version/dist hashes、Native Host registry/manifest/pipe、Kernel instanceId/状态、最近 events。
2. 核对原版 `BindingStore` / `BindingRegistry` / `FleetTabRegistry` / `ControlPlane` 已经拥有的持久能力；输出 `REUSE / MODIFY / SUPPRESS / DO-NOT-DUPLICATE` 清单。
3. 对 PR #1（composer/assistant DOM）与 #2（conversation fencing）逐文件审查，标明冲突/可采纳 patch，不先合并。
4. 在新 worktree **不安装 Native Host**，做只读静态检查和单元基线验证。记录失败，不把“上游现存失败”误当新增改动失败。

**验收**：`S0_SOURCE_RUNTIME_INVENTORY` 一份可核对记录（版本、来源、是否已部署及真实未通过项）；主运行目录/进程/历史 Slot 均未更改。任何路径缺失标 `NOT_FOUND`，不猜测。

### CH-PCP-01｜受控 RoleBinding（P0A）

**需求**：PCP 五角色的绑定数据不等于 Kernel AgentSlot 或 Tab ID；应有可版本化、可恢复、可审计的 Conversation 关系。

**源代码候选**：`control/src/controlPlane.ts`、`control/src/contracts.ts`、`src/bindingStore.ts`、`src/bindingRegistry.ts`、`src/nativeControlPersistent.ts`、既有 SQLite 迁移机制。

**实现最小约束**：
- 用 PCP 的 `role_id/role_version` 和 `conversation_ref` 关联；授权者、revision、变更时间与原因可回查。
- `bind/unbind/rebind` 明确授权；幂等绑定不增加 revision；不同 Conversation 并发争用时 fail-closed。
- 兼容原来非 PCP Slot 的数据；旧 AgentSlot、Conversation、可用的原版 Task 不得删除。
- 不上传用户 Cookie/token，不将固定角色定义复制成另一套真相库。
- 角色绑定 `bound` 即使页面 `offline` 仍保持。

**测试**：绑定、重绑、授权拒绝、重复请求、不同账号/实例冲突、Kernel 重启后读取；检查旧数据迁移前后对照与回滚/兼容性。

**通过 Gate**：重启后同 `role_id + scope` 仍可得到同一授权 `conversation_ref` 和 revision；未经授权不会改变；旧绑定证据仍可回读。

### CH-PCP-02｜受控生命周期 / 真实会话资源（P0B）

**需求**：将原版 `minSlots=0` 的自动停止策略与 PCP 固定角色隔离，而不是删除 Elastic Fleet 的所有逻辑。

**源代码候选**：`control/src/elasticFleet.ts`、`control/src/controlPlane.ts`、`src/fleet.ts`、`src/background.ts`、`src/fleetTabRegistry.ts`、`src/browserRuntimeReporting.ts`。

**实现最小约束**：
- 角色绑定 `controlled`；初次 E2E 的页面资源 `pinned_tab`；历史实验 `elastic` 仍可按明确配置工作。
- 空闲 120 秒可记录页面 idle，但不能触发固定角色绑定的无授权删除/重新绑定。
- 角色/会话保持独立于 `tabId`；关闭/打开只影响 SessionObservation，并有原因和动作主体。
- 专用单实例运行，状态报文包含可验证 runtime/profile 身份；对不同实例对同 Slot 的虚假或陈旧报告拒绝而不是反复争租约。
- 对单 Chrome 而言，不因 `pageHealth=ready` 就认为所有 Tab 可用。

**测试**：空闲 >120 秒且两次以上 Fleet reconcile 后无静默解绑；明确暂停/恢复；无 tab 的 offline/恢复；模拟 profile 冲突；重启前后一致。检查事件中没有连续无原因 Acquire/Release 抖动。

**通过 Gate**：同一 RoleBinding 的 revision / Conversation 不变，Runtime Tab 可更新；无未授权缩容误判；来源错配 fail-closed。

### CH-PCP-03｜ChatGPT DOM、首次会话与单消息闭环（P1）

**需求**：真实 `idle` 检测、唯一无害测试消息、canonical Conversation ID、可信 reply-observed。

**源代码候选**：`src/chatgptAdapter.ts`、`src/content.ts`、`src/background.ts`、`src/contracts.ts`、ReplyCorrelation / SendAttempt Ledger 及测试。

**实现最小约束**：
- 输出 `unknown` 时附带可解释诊断（缺 composer? DOM not ready? 未登录?）但不能将 unknown 当 idle。
- 新会话 `https://chatgpt.com/` 的 bootstrap 特殊路径必须**显式授权**、绑定预计归属的 `slot/role`，首次提交后以真实 `/c/<id>` 确认 canonical Conversation 才转成 bound。
- 发送前按当前页身份、Binding revision、权限、页面状态、pending Attempt 决定是否发送；错页拒发。
- Attempt 区分 `prepared / dispatched / acknowledged / reply-observed / failed / uncertain`。即使操作后 RPC 失败，也不得盲重发。
- 真实回复关联不能仅靠页面显示任何新文字；根据 `attemptId + contentEpoch + baselineAssistantMessageId/count` 等可复核证据归属。
- 两 Draft PR 只选择实际可复用的差异，逐项用测试证明效果。

**测试**：已绑定对话单消息、一条全新对话的首次 bootstrap（单独测试）、非前台标签页、回复延迟/页面刷新/提交未知、发送后多回复/其他对话干扰、限流/账号失效、不重复真实提交。

**通过 Gate**：至少一条唯一探针 `CHARTERION_PCP_E2E_<timestamp>` 真正送达目标角色对话，产生 canonical ID、页面回复和明确 Attempt 回执；错误投递 = 0；重试不重复产生同一真实操作；所有异常可见。真实外部工具动作测试只能在另一个受限 Gate 授权后进行。

## 3. 后续阶段工单

| ID | 工作内容 | 必须给出的真实交付 |
| --- | --- | --- |
| CH-PCP-04 / P2 | Supervisor、Chief Engineer、Execution Coordinator 三角色绑定、Role Charter 加载、短事件交接 | 三个**真实普通 WebGPT 对话**、各自不同指令、至少一次后台页、正式工作引用可回查 |
| CH-PCP-05 / P3 | 一个真实 GitHub Issue/EO/CB 工单及独立 Reviewer | 来源 Issue、批准范围、CB Task ID、Worker/模型参数（若可得）、SHA/测试 Evidence、独立审核结果 |
| CH-PCP-06 / P3 | 重复事件、时序、异常与恢复 | 失联/重启/重复投递/超时/换绑修复时未错误发送；可人工接管 |
| CH-PCP-07 / P4 | Operations 非生产事件和 PCP 状态投影 | 运维审批与回滚证据；五角色/工单/Worker 实际状态；不可得用量显示 unavailable |
| CH-PCP-08 / Deployment | 一致性备份、受控切换、双实例隔离 | 明确前后 Host registry/pipe/extension SHA、数据库迁移证据、可恢复、不同实例互不争租约 |

每个小工单原则上只修改自己职责范围内的代码；不以角色数机械增加 Worker 数，不能为了“排架构图好看”创建新的跨仓通用子系统。

## 4. 验收矩阵与失败记录规范

| 编号 | 条件 | 预期 | 当前状态 |
| --- | --- | --- | --- |
| A01 | 现存 Slot / DB / Chrome 数据保全 | 旧历史仍可回查 | NOT_RUN（新基线） |
| A02 | controlled 绑定 + 2 分钟以上 idle | RoleBinding 不变化 | NOT_RUN |
| A03 | 显式 unbind/rebind | 审计、revision 与授权可回读 | NOT_RUN |
| A04 | 关闭 Chrome / 扩展 SW 休眠 | 逻辑绑定不丢失，恢复需核对页面身份 | NOT_RUN |
| A05 | 另一个浏览器实例错报同一 slot | 拒绝或隔离，不发生两个 Tab 交替 lease | NOT_RUN |
| A06 | 目标页面 `unknown` | 显示错误，拒绝投递 | 旧现象已观察，新实现 NOT_RUN |
| A07 | 目标页 `idle` + 正确角色 | 只发一次指定探针并得到 reply-observed | NOT_RUN |
| A08 | URL canonical `conversation:<id>` 变更 | 明确 bootstrap/恢复证据，禁止错误绑定 | NOT_RUN |
| A09 | 发送后中断/回执缺失 | 标 uncertain，安全地不盲重发 | NOT_RUN |
| A10 | 多角色非前台交接 | 3 个 WebGPT 实际独立收发、正式引用移交 | NOT_RUN |
| A11 | 一次 CB 工程工单 | 实际 Task ID/commit/test/Review 证据 | NOT_RUN |
| A12 | 部署/回滚和恢复 | 版本、Host、SQLite/备份和角色映射完整 | NOT_RUN |
| A13 | 真实指标 | 有则提供运行时来源，不可得标 `NOT_EXPOSED` | NOT_RUN |
| A14 | MCP/配额/安全操作阻断 | fail-closed，不伪报执行完成 | NOT_RUN |

**状态仅使用**：`PASS`、`FAIL`、`NOT_RUN`、`BLOCKED`；需单独展示缺失证据而非为了完成率标 PASS。所有真实事件/attempt/CI、用户批准均记录对应来源。

## 5. 研发交付格式（每项必备）

```text
Work ID:
Purpose / Scope:
Source baseline (PCP role version + current Charterion commit):
Actual changed files and diff:
Affected runtime identity / data migration:
Tests run (cmd / machine / timestamp / result):
Actual WebGPT E2E (role / canonical ID / attempt / reply correlation):
Actual CB / Git evidence if applicable:
Known FAIL / NOT_RUN / BLOCKED:
Rollback:
Next eligible step:
```

**只完成类型检查或提交 PR ≠ 原生 Chrome E2E 通过**。没有实时状态检查时标 Unknown/NOT_RUN，不从既有上次截图推断当前状态。记录必须把旧 `minSlots=0` Auto Suspend 正常事件与跨实例 Lease 抖动独立分析。

## 6. 优先审核现有 Draft PR

- [#1](https://github.com/Su9moon/Charterion/pull/1)：ChatGPT 新版编辑器/assistant DOM；需要比较目前安装 `dist/content.js` 与源码、单元测试和真实网页状态。
- [#2](https://github.com/Su9moon/Charterion/pull/2)：conversation-fenced routing 等；必须检查旧绑定兼容性、正确会话发送、重试不重复和数据迁移。
- 两个 PR 先保持 Draft，不在没有回归/权威审核前合并。该设计分支不能靠吞并旧修复掩盖新问题。

## 7. 即将动工时的执行边界

**立刻允许**：S0 的只读库存、依照设计文件创建独立工作树、编写单测/改造代码和独立开发分支提交。**还未执行**：修改现有 Host 注册、重启/关闭用户任何 Chrome 或 Kernel 进程、清理 Slot/会话、真实向已有对话投递测试内容、发真实 CB 工单、合并主仓、部署生产。这些操作在相应 Gate 需要明确当次实施/测试范围及证据。

当前这份清单仅把“怎么做、怎么验、失败怎么办”固定成可执行工程计划；后续实际完成状态由真实测试回执更新。
