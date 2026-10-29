# Charterion—CB 接入基线 V0.1

- 状态：FIXED / IMPLEMENTATION_PENDING / JOINT_VALIDATION_NOT_RUN。
- 固定日期：2026-10-28（Asia/Shanghai）。
- 权威仓库：Su9moon/personal-ai-control-plane；本目录为唯一 canonical 接入契约。
- 用户授权：本次对话确认共同基线、分别开发、联合验收的路线，并要求将对应材料上传两仓固定；联合验证由用户下次安排。
- 本次动作仅为文档、协议、测试样例和待执行工单发布，不启动实现、Worker、部署、升级或真实联合验证。
- 本接入范围选择 Su9moon/Charterion 为上层集成目标；这更新“仅作参考”的本次集成定位，不宣称其已成为生产依赖或通过验收，也不改变上游 Charterion 通用产品范围。

## 1. 唯一职责

| 所有者 | 负责 | 不接管 |
| --- | --- | --- |
| Charterion | 角色/会话身份、Mission/WorkItem、派发关联、依赖与审核流程、CB 事实的带来源投影 | CB 运行状态写入、执行工作区的第二套锁或清理、Codex CLI 调用 |
| CB Server | 任务接收与去重、有效执行权限、执行事实/事件、受控结果与交接引用、MCP 契约 | 角色组织、聊天唤醒、工程验收判断、第二套工程 Job 管理 |
| CB Worker/可信宿主 | 执行工作区、调用 Codex、报告事实、保全/传送产物 | 自审自批、越权发布/部署、修改上层目标 |
| Git/GitHub | 源码、提交、PR、正式工单与评审证据 | 实时 Worker 存活判断 |

EO 借用持久意图/Result/Evidence/Review 分离；ES 借用 Server owns state、当前执行权限与 stale rejection；不迁入完整 EO/ES 平台。HB 继续面向人及外部交互渠道。
五角色仍为 Supervisor、Chief Engineer、Execution Coordinator、Reviewer、Operations；Controller 是面板，不增加第六个 Agent。

## 2. 执行与完成

- 一项 WorkItem 可对应多个派发；一次 dispatch_id 只对应同一 CB 实例中的一个 Task。返工显式新派发，原终态不重开。
- execution_status、tests_status、delivery_status、handoff_status、review outcome 独立；CB done 不直接完成 WorkItem。
- 结果哈希验证仅证明字节完整性，不能证明测试真的执行、代码符合需求或审核通过；可信来源、测试证据和独立审核分别验证。
- Charterion 以 CB 的权威状态为来源保存投影，不从模型回复推断执行完成。时间戳过旧/无法观测明确 unknown，不据此自动重新执行。
- CB 执行工作区只由 CB 宿主管理。Charterion 为外部执行增加显式证据映射，不伪造内部 WorkClaim 的 workspace/lease/epoch。
- 正式源码优先通过 Git SHA/分支交接；未发布产物可通过不可变 Handoff 包交接。失败任务的可用产物经可信核验后可用于新派发，保留原失败事实。

## 3. 派发和观察

首版由 Execution Coordinator WebGPT 经现有 MCP 派单。Charterion 先持久化派发身份及准确输入，并将结构化参数提供给该角色。CB 持久化此关联，上层通过认证只读接口按 dispatch_id 找回任务；不解析自然语言任务号。
Charterion 的薄适配可作为认证 MCP 只读消费者做确定性查询；复用已有宿主与权限配置，不从浏览器提取凭据，不共享 Worker token。WebGPT 与只读采集端必须映射到相同受控 integration client scope。
首版不由 Charterion 后台另行提交第二次任务。响应不明时先查原派发，同标识安全重传；未经确认不得换新标识重跑。
事件查询/轮询是首版必需机制；主动推送与浏览器自动唤醒不是 CB 的义务。上层保留待处理事件与游标，恢复后再推进会话。

## 4. 版本与范围

本目录 PROTOCOL.md + contract.schema.json + cases.json + ACCEPTANCE.md 共同约束双方。已有调用保持兼容，新接入显式协商版本与能力；禁止伪装支持缺失能力。
接口定义变更先更新 canonical 契约/样例并形成新版本或勘误，再让两仓更新 pin；不得原地改写旧 FIXED 字节。无关内部实现可独立演进。
不强制重建数据库/队列/事件总线/第三套实例。自动取消、复杂重调度、账号池、全量 EO/ES 模型、跨域生产权限扩展不属 V0.1。
开发工单可各自离线使用统一样例；模拟通过不等于真实互通。本轮不提前执行联合验证，用户下次安排后按联合工单运行。

## 5. 现状证据与差距（源码检查，不是运行证明）

- Charterion main@afde4a493fa11311e56b4cf164f56c37940869f4：control/src/organizationExecutionBridge.ts 将组织工作投影到内部任务；control/src/contracts.ts 的 WorkClaim 使用本地 resource/lease/epoch。接入关键词检查未发现 CB 专用调用链。
- CB main@96ca5de96c4ef256dbb0fa62487a81268f9ef5fa：src/codex_bridge/server.py 有条件注册 Result Package MCP 工具；store.py 无本契约派发去重参数；当前 claim/result 未携带本次执行权限。docs/CB_RESULT_PACKAGE_V1_DRAFT.md 与 docs/CB_HANDOFF_V1_DRAFT.md 描述已有结果包、outbox 和宿主交接。
- GitHub CB PR #104 已合并不代表运行部署。两边线上版本、插件可见工具、真实跨会话读取、恢复与联调均 NOT_RUN。
- 源码差距：CB 补接入能力/派发幂等/权限与事件；Charterion 补外部执行适配/身份映射/原始证据消费与审核衔接。

## 6. Architecture Gate / Experience Reuse

```yaml
architecture_gate:
  required: true
  status: complete
  real_use_evidence: verified
  decision: INTEGRATE
  pcp_specific_remainder: "跨产品派发关联、执行事实投影与可信产物验证"
  minimum_formalization: "版本化接口契约、样例及现有产品内的薄适配；不增加独立运行服务"
experience_reuse: EXTEND
```

Structural problem：两个独立系统之间，在不重复调度和不混淆权威的前提下传递工作意图、执行事实及可信产物。
Cross-Domain Scan：COMPLETE（本对话已核对源码及官方资料）。
- Direct analog：现有 CB MCP/Result/Handoff；ES-03 V0.2 的 current authority、idempotency 与 stale writer 规则。REUSE/BORROW，不复制 ES 平台。
- Adjacent domain：GitHub Actions artifacts 的运行与产物分离。借用不可变产物与来源关联，不引入 Actions 作为新调度依赖。
- Structural analog：Kubernetes Job 在失败/重启时仍可能重复启动。借用去重、权限和不完整输出核验规则，不引入 Kubernetes。
- Decision：INTEGRATE；最小剩余为关联、协议、投影和现有产品内适配；PCP Core boundary impact：none，新增限定集成契约。
- Evidence：https://github.com/Su9moon/codex-bridge/issues/98 （已有真实交接失败）；https://github.com/Su9moon/pcp-execution-server/blob/85783a75bd5ef7bc44110c6f9184b55748b4bfc4/governance/contracts/WORKER_PROTOCOL_V0.2.md ；https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts ；https://kubernetes.io/docs/concepts/workloads/controllers/job/#handling-pod-and-container-failures 。

## 7. 上游治理引用（准确仓库、路径与版本）

以下均为 Su9moon/personal-ai-control-plane@63d15bdfbd3cb9e4c1ae2457fd0b3679d807df3e：
- governance/baselines/PCP-01_系统定位与核心边界_V0.2_FIXED.md
- governance/baselines/PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md
- processes/architecture-governance-gate.md
- processes/experience-reuse-gate.md
- governance/PCP_ENGINEERING_AGILITY_PRINCIPLE.md
- governance/PCP_EXECUTION_PROFILE_RESOLUTION_BASELINE.md
- .agents/skills/pcp-workorder-handoff/SKILL.md

本次授权选择 Charterion 为此接入目标，不修改历史五角色基线。上述资料为开发输入，运行产品不得要求在线访问治理 Git。
