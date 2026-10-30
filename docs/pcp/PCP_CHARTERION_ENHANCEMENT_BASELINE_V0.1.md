# Charterion × PCP｜WebGPT 角色会话增强设计基线 V0.1

> **版本继承提示（2026-10-27）**：本文件的原版观察事实仍是研究记录；2026-10-27 随后确认的增强方案为 [目标架构 V0.3](PCP_CHARTERION_TARGET_ARCHITECTURE_V0.3.md)，包括内置控制/雷达面板、项目化角色会话、Git 中间成果及手动锁定/可调配置。与此处旧方案冲突时按 V0.3 实施。


- **日期**：2026-10-27
- **文档状态**：**设计基线（目标、边界与验收口径固定；实现机制为待验证方案）**。不代表软件已运行通过、PR 已批准、或更改 PCP 治理架构。
- **实施仓库**：`Su9moon/Charterion`；**设计分支**：`pcp/role-session-enhancement-v0.1`。
- **上游权威**：PCP 主仓现行 `PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md` 优先于历史 V0.1；EO/ES/CB 各自原有正式契约仍有效。
- **已冻结研究证据**：PCP 主仓 `research/charterion-facts-20261027` 分支 `assets/candidates/2026-10-27-charterion-research-facts.md`。
- **范围**：仅评估和增强 Charterion 用于 PCP 的 **WebGPT 角色会话控制、消息触发、回复观察、会话恢复与状态呈现** 能力。

## 0. 决策摘要

Charterion **是候选会话运行层，不是新的 PCP Core、Engineering Operations、Execution Server、Codex Bridge 或正式任务权威**。停止以“跑通原版弹性管理”为独立目标；保留确实可复用的 Extension / Native Host / Kernel / Tab observation / Attempt evidence，优先改造与 PCP 已固定目标冲突的行为，改一项验一项。

五个 WebGPT 角色：`supervisor`、`chief_engineer`、`execution_coordinator`、`reviewer`、`operations`。PCP Controller 是控制面板而非第六个 WebGPT Agent。首先真实验收前三角色；Reviewer、Operations 按职责参与而非每个工单强制经过。N 个 Codex Worker 与 WebGPT 角色数量无一一对应关系。

**角色身份持久** ≠ **Chrome 标签页必须常开**。对 PCP 固定角色的 Role/Conversation 绑定默认应受主控明确授权；空闲计时不能静默解绑、改变角色权威或销毁尚需恢复的工作关联。浏览器本身可在明确策略下休眠、关闭与恢复，但其生命周期事实与角色绑定事实必须分离。

## 1. 本次实验确认的事实

| 对象 | 结论 | 状态 |
| --- | --- | --- |
| 本地 Extension / Native Host / Kernel 通信 | 有真实读取和回执 | PASS（单项） |
| ProjectCell、AgentSlot 创建和列举 | 已操作成功 | PASS（单项） |
| Fleet 打开页面、临时 Role/Project/Slot 映射与租约 | 曾取得一致 Tab ID 和 Lease | PASS（瞬时，不等于稳定） |
| `minSlots=0,maxSlots=1` 的空闲缩容 | 事件 466–471 证实自动 drain/suspend/absent | PASS（原版行为证据） |
| 多 Chrome 实例争用 | Tab 1744288835 与 50017043 交替租约、使用共享 `gam-default`；根因未排他证明 | RISK / OPEN |
| 目标 Worker 页面状态 | `unknown` / `No trusted ChatGPT readiness signal is visible` | FAIL（发送前置条件） |
| E2E-Worker 正式 Conversation ID | 未创建 | NOT_RUN |
| 唯一发送、回复、任务交接、跨角色、恢复 | 未做完 | NOT_RUN |

基线实例（保留用于有控制地再验）：`GAM_HOME=%LOCALAPPDATA%\PCP-WebGPT-Lab\Charterion`，项目 ID `2aaa4e8e-df72-437d-928d-57126697ea13`，Slot ID `a65940ce-0545-46d4-b1f7-47dde02f3a7b`，目前处于 `suspended/absent`。Tab ID 不是持久标识。旧测试项目、其他暂停 Slot、历史会话和证据不得清理。

## 2. 系统权威与能力边界（不可被实现改写）

| 权威对象 | 权威持有者 | Charterion 可做 | Charterion 不得做 |
| --- | --- | --- | --- |
| PCP 项目目标、角色契约、授权 | PCP Git 基线 / 用户主控 | 读取带版本的 Role Charter 并按约束投递 | 自行增设角色、替代审批 |
| 工程 Job / Workorder / Result / Evidence / Review | EO / GitHub 正式记录 | 传递 `work_ref` 与正式材料链接、触发角色查看 | 以本地 Task DAG 覆盖正式工单状态 |
| ExecutionRequest / Execution / Attempt 语义 | ES 契约，当前可复用 CB 执行链路 | 查阅正式运行 ID 与回执 | 重建执行权威、Claim/Worker 调度器 |
| CB Worker 运行 | CB 与 Codex Workers | 由具有授权的 WebGPT 角色发起受控派工 | 复制 CB 队列、无凭据直写 Worker 事实 |
| Role ↔ Conversation ↔ 浏览器运行映射 | PCP 角色绑定策略；Charterion 保存必要运行态 | 定位、投递、观察、显式恢复和审计 | 将 `tabId` 当角色 ID；自动覆盖长期绑定 |
| 浏览器投递 Attempt | Charterion 运行证据 | 记录提交尝试、观察、回执和不确定性 | 将“已发送”冒充“已完成并验收” |

原版 Task DAG 如被保留，仅作为**局部试验/暂存投递工具**；是否仅做适配、最终弃用，取决于 R1/R2 的证据。禁止以“功能已有”为理由向 PCP 重新添加一套 Workorder/Job DB、队列或 Scheduler。

## 3. 逻辑对象与生命周期约束

### 3.1 身份层与运行层分离

建议最小逻辑关系（字段是设计意图，不承诺全部新建数据表）：

- **RoleDefinition**：`role_id` + `role_version`；源头为 PCP Git 中可核查的 Role Charter。
- **RoleBinding**：`role_id, role_version, provider, conversation_ref, binding_revision, authorization_ref, active_work_refs`。更新/换绑需要主控明确操作或预先批准的恢复规则；保留旧映射及变更原因。
- **SessionObservation**：`runtime_instance_id, browser_profile_id, tab_id, content_epoch, page_health, observed_at`；临时地址会变化，不覆盖 RoleBinding。
- **DeliveryAttempt**：`event_id, work_ref, target_role_id, binding_revision, conversation_ref, attempt_id, correlation_id, delivery_state, evidence_ref`；用于触发、观察、失败恢复，不是工程任务本体。

RoleBinding 可以指向待恢复的 Conversation，而此时 `tab_id=null`。正当关闭浏览器不等于解绑角色。会话切换、失效或重建时必须有明确状态和可追溯的映射变更。

### 3.2 固定角色优先的手动绑定策略

PCP 固定角色采用 **controlled** 策略：
1. 创建/移除固定角色、首次绑定/换绑/解绑 Conversation，由主控明确授权；不因空闲超过 120 秒自动失去身份或长期会话关联。
2. 投递任务、观察回复、采集网页健康状态、异常检测、必要时提示恢复属于自动运行。
3. 是否自动打开/关闭浏览器页面是**独立可配置策略**；默认不允许静默关闭正在验证的测试会话；且不得以“标签页回收”为依据改变逻辑角色权威。
4. 原版 Elastic Fleet 可保留为明确选择的临时 Worker 实验模式；不能自动套用于固定 PCP 角色。
5. 禁止用绕过 `minSlots` 逻辑的临时脚本冒充正式生命周期改造；在实现期明确策略入口、状态不变量和测试覆盖。

### 3.3 多实例隔离

Chrome Profile 独立不等于 Kernel 独立。不同部署实例应具独立 `GAM_HOME`、SQLite、Native Host 指向、命名管道、令牌和运行实例 ID。多个浏览器 Profile 若授权共享一个 Kernel，则**观测/控制消息必须有可识别来源，并防止同一 Slot 被两个运行实例相互覆盖**；不允许默认把所有来源视为 `gam-default` 的同一物理浏览器。优先验证单专用 Chrome 的基本闭环，再验证第二实例安全拒绝或显式共享模式。

## 4. WebGPT 对话投递契约

每次触发源于已存在的正式工作引用或最小独立测试事件；包含：
`event_id / correlation_id / work_ref / source_ref / target_role_id / role_version / binding_revision / event_kind / created_at`，及可审计的来源。

最小状态区别：
- `accepted`：运行层接受触发；
- `page_ready`：目标身份、地址、权限和页面已检查；
- `dispatched`：已尝试向正确目标提交，保留 attempt ID；
- `acknowledged`：页面侧有可信提交确认；
- `reply_observed`：观测到与该 attempt 相关的新回复；
- `result_recorded`：角色将正式结果/证据保存至权威系统；
- `reviewed`：在适用审核流程中审核通过。

后两个由上游正式数据确认，Charterion 不能单凭网页文字置为完成。任何 `failed / unknown / unauthorized / uncertain` 必须显式呈现；尤其物理提交后回执丢失时不允许盲目自动重发（防止真实 CB/工具动作重复）。去重以 `event_id + target_role_id + binding_revision` 为最小候选键；具体持久方案实现时以实际边界验证，不能假装 DOM 提交具有真正 exactly-once 语义。

只携带正式来源和需要的上下文摘要/引用；不广播私密对话正文、密码、cookie、Token 或生产密钥。Role Prompt 不是硬权限边界；涉及受限真实执行仍受 CB/宿主/授权规则控制。

## 5. 角色工作方式及运行验收顺序

- `supervisor`：通过真实来源汇总项目进展、任务偏差和升级事项；不抄 Worker 日志充当确定性监控。
- `chief_engineer`：读取正式目标、输出方案与模块边界；不承担大量微任务拆分。
- `execution_coordinator`：根据已批准方案执行必要拆分、Issue/CB 派工、模型/思考等级建议、进度追踪和原范围内返工；不能擅改架构。
- `reviewer`：独立读取原始需求、现行基线与证据；未参与相同成果的实施，提出可复核评审。
- `operations`：部署、运行、故障/恢复事件按需触发，受主机与生产操作权限约束。

Reviewer/Operations 按事件参与；不设定所有任务必须走五角色的强制长链审批。默认只运行真正有需求的角色，但逻辑 RoleBinding 的存续必须与页面运行状态解耦。

## 6. 分阶段增强 + 每阶段实测（不先改大架构）

| 阶段 | 允许改造的范围 | 最小验收 |
| --- | --- | --- |
| **P0：稳定角色绑定与生命周期** | 分离 RoleBinding/SessionObservation；固定角色受控绑定/解绑和空闲策略；消除无权限主动销毁关联 | 指定 Role + Conversation 可回读；空闲超原版 120s 不导致未授权解绑；显式 suspend/恢复有审计；页面关闭后逻辑映射保留 |
| **P1：DOM 就绪与一次投递** | ChatGPT 新版 composer/readiness、发送/回执关联、unknown 原因诊断 | 专用 Chrome 上指定页 `idle`；一条唯一指令至正确 Conversation，证明新回复与 attempt 关联；错误目标 fail-closed；无盲重发 |
| **P2：三 WebGPT 核心协作** | 正式 Role Charter 加载与基于 `work_ref` 的投递/跨角色通知，不新增 Workorder 数据库 | Supervisor、Chief Engineer、Execution Coordinator 三个真实独立对话，分别送达不同消息；一次非前台页面；方案/交接有正式引用，状态不会靠对话自述推进 |
| **P3：正式 CB/Review/恢复** | CB/GitHub 引用整合、独立 Reviewer、幂等和断点恢复 | 一次真实受控 Issue/CB 工单有 Task ID/Commit/Test 回执；Reviewer 不复用实施上下文；恢复/重复事件不重复真实派工；所有不可得指标标 `NOT_EXPOSED` |
| **P4：Operations 和 PCP 可视化衔接** | 运维事件与统一状态投影，供控制面板读取 | 一次授权非生产运维事件可追溯；五角色状态及 Worker 事实可查询，不用模拟数据冒充上线 |

此增强阶段与 PCP R1–R4 对齐，**不取代** PCP 正式路线。P0/P1 可以在当前隔离环境先小范围验证；R1 必须覆盖三个真实普通 WebGPT 对话，不把三个 Codex Worker 充数。

测试矩阵至少包括：新会话 canonical ID、同一角色正确绑定/错误角色拒绝、页面 `unknown`、Chrome 关闭重开、MV3 Service Worker 休眠、两 Profile 冲突/隔离、超时回执不确定、重复事件、目标 ChatGPT 网页升级、MCP 不可用、账号额度不足、人工接管。每项保留时间戳、提交 SHA、事件/attempt ID 与可验证结果；未跑标 NOT_RUN。

## 7. 最小源码改造候选点（不是立即施工授权）

- `control/src/elasticFleet.ts` / `control/src/controlPlane.ts`：生命周期策略与身份权威；须避免一刀切关闭正常的自动观察和恢复。
- `src/background.ts` / `src/fleet.ts` / `src/fleetTabRegistry.ts`：Profile 来源识别、绑定、Tab 观察、投递与事件处理。
- `src/chatgptAdapter.ts` / `src/content.ts`：页面状态、输入框、提交与回复观测。
- `src/contracts.ts` / 现有 Native RPC 契约：必要的事件关联字段，避免让 `tabId` 成为长期会话身份。
- `src/sidepanel.ts`：暂作诊断和显式绑定入口；PCP Controller 工作台另按既有设计推进，不直接替代。
- `tests/`：以行为验收与故障注入为先，不靠单次瞬时 `open` 或浏览器总体 `ready` 判定成功。

实现时先列出“已有代码能够实现、需要适配、应停用、绝不能复制”的映射表；优先做最小差异；正常自动观察、事件证据和原版受控能力保留。当前 Draft PR #1（ChatGPT DOM）及 #2（conversation fencing）分别审查，**不得不经独立验收直接合并**。

## 8. 操作约束与回滚

- 现存 `main`、测试 `GAM_HOME`、历史 Agent/Conversation、Git/证据保持不变；设计基线先进入独立分支。
- 改动须使用隔离分支/工作树、明确输入和预期输出、局部测试 + E2E、审查后合并；失败不得以重装或清库替代定位。
- 不通过更换浏览器、强制自动唤醒、修改 PCP 五角色定义来掩盖低层 Bug。
- 不触及第三方生产环境和账号凭据；能观察就先观察，必要的真实消息只发唯一无害探针。
- 若 Charterion 的修改成本高于保留原生 Chrome + 最小 Relay，应保留比较和退出机制，**不以 fork 已存在作为必须选型的理由**。

## 9. 待验证且不得提前声称完成的问题

1. 当前 `unknown` 的直接 DOM/内容脚本根因、实际本地部署文件版本。
2. 双 Chrome/Profile 是否仍存在同时报告同一 `gam-default` 的活动实例、哪一个作出了 `absent` 报告。
3. RoleBinding 在关闭标签页、重建 Conversation、Kernel 重启后的恢复与授权细节。
4. WebGPT 是否能在后台稳定收发和执行 MCP；延迟、限制与配额。
5. Charterion 原有 Task DAG 与正式 Workorder 的最小适配方案，避免形成双权威。
6. ChatCMD 是否适合承载 PCP Controller 的部分控制界面；该议题不由本增强文档自动决定。

## 10. 权威参考与状态声明

- PCP FIXED V0.2： https://github.com/Su9moon/personal-ai-control-plane/blob/main/governance/baselines/PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md
- PCP 多对话 V0.1（历史非冲突原则）： https://github.com/Su9moon/personal-ai-control-plane/blob/main/governance/baselines/PCP_WEBGPT_MULTI_CONVERSATION_ROLE_COLLABORATION_BASELINE_V0.1_FIXED.md
- PCP EO 基线： https://github.com/Su9moon/personal-ai-control-plane/blob/main/governance/baselines/PCP_Engineering_Operations_BASELINE.md
- Charterion 研究事实： https://github.com/Su9moon/personal-ai-control-plane/blob/research/charterion-facts-20261027/assets/candidates/2026-10-27-charterion-research-facts.md
- 原版 Charterion： https://github.com/Su9moon/Charterion

**本文件固定的是 Charterion 适配 PCP 的增强范围、分工、设计不变量与验收标准。尚未证明上述新增功能运行成功；不得将设计状态标为 PASS，不得借本文件直接覆盖 PCP FIXED 基线。**
