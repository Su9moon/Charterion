# PCP｜五角色 WebGPT 组织与 CB Worker 执行边界 V0.2

- **状态：FIXED — 用户确认的产品目标、角色组织与权责边界；不代表已部署。**
- **确认日期：2026-10-23**
- **确认依据：** 用户在本次 PCP 讨论中明确认可「五个固定 WebGPT 角色 + N 个 Codex Worker；Controller 作为统一控制面板而非第六个 Agent」并要求固定下来。
- **所属：** Personal AI Control Plane（PCP）
- **版本关系：** 本文件作为 **WebGPT 角色组织现行基线**，更新并取代 [V0.1 三个 WebGPT 对话的角色划分](PCP_WEBGPT_MULTI_CONVERSATION_ROLE_COLLABORATION_BASELINE_V0.1_FIXED.md) 相关段落。V0.1 保留为历史记录；其跨对话持久身份、GitHub/CB 事实权威、恢复与诚实验收、安全边界等不冲突规定继续有效。
- **不替代：** PCP-01 体系定位；EO、ES、HB、CB、IE 的各自已批准边界。
- **实现状态：** ROLE MODEL CONFIRMED；五 WebGPT 自动控制、事件唤醒、MCP 实际执行、跨对话交接、会话恢复与长期稳定性尚未通过运行验收。

## 1. 核心定论

**PCP Controller = 主控制面板 / 治理入口（非第六个 WebGPT Agent）。**

**五个固定、各有独立 WebGPT 对话与角色契约的 Agent：**
1. Supervisor（项目主管）；
2. Chief Engineer（总工程师）；
3. Execution Coordinator（执行协调工程师）；
4. Reviewer（独立审核）；
5. Operations（运维工程师）。

**N 个 Codex Worker：** 依据正式任务执行编码、测试、研究、受控部署和其他工程操作；Worker 的进程数与 WebGPT 角色数互不绑定，不能因增加角色而默认增加 Worker 或新调度器。

**运行原则：** 前三角色保持长期稳定身份，是优先验证的事件驱动协作链；Reviewer / Operations 保持独立角色身份与可恢复的对话，按需唤醒。所谓「常驻」是职责和身份持续存在，不是持续占用模型推理，也不要求五个标签页一直可见或打开。

## 2. 各角色的唯一主要责任

| role_id | WebGPT 角色 | 核心职责 | 不得代替谁 |
| --- | --- | --- | --- |
| `supervisor` | Supervisor / 项目主管 | 项目组合目标、优先级、进度与里程碑追踪、资源冲突、偏差监督、重大问题升级、跨项目协调 | 不替总工设计架构、不代替审核、不绕过用户授权 |
| `chief_engineer` | Chief Engineer / 总工程师 | 需求解释、总体设计、技术路线、模块与接口边界、技术约束、工程质量目标、重大技术变更判断与交付准备 | 不包办大量细分工单、CB 派单、日志跟踪；不得自审自批 |
| `execution_coordinator` | Execution Coordinator / 执行协调工程师 | 在批准的方案与边界内做**必要而不过度**的实施拆解、Issue/Workorder 组织、CB 派单、模型/参数建议传递、Worker 进度和结果收集、普通返工协调 | 不擅自新增需求或改架构；不把 Worker done 当交付验收 |
| `reviewer` | Reviewer / 独立审核 | 独立读取原始需求与证据、核对设计/代码/测试/交付标准、提出有证据的通过或退回建议，识别范围蔓延 | 不审核自己的实施成果、不自行增加验收条件、不授权生产 |
| `operations` | Operations / 运维工程师 | 按需分析环境/部署/监控/故障/恢复，提出操作方案、核验结果，安排受控 Worker 或宿主运维操作 | 不常驻执行、不能绕过主机或生产操作授权、不能擅自控制 Blue/Green |

### 2.1 Controller 的定义

PCP Controller 是用户查看与干预的**主控制面板**，而非需要额外 LLM 会话运行的第六个管理角色。面板展示项目、五角色、关联 Issue、CB Task/Worker、证据、阻断与人类决策事项；其展示需来自可核查的真实数据。

最终用户保留目标、优先级、预算、重大范围变化和受限生产操作的实际授权。Supervisor 负责组织、建议与升级，不取代人类授权。

### 2.2 角色关系不等于命令链式审批

- Supervisor 对**目标、进度与资源**负责；Chief Engineer 对**设计质量、技术判断**负责；Execution Coordinator 对**执行组织、派工和返工落实**负责。
- Reviewer 是**独立旁路审查者**，不是 Execution Coordinator 的自评子程序；对需要审核的成果给出有依据的评审结论。
- Operations 与工程交付链互通，但仅在出现运维事件/部署阶段时按需参与，不作为每一张普通开发工单的必经环节。
- 不建立固定「每张工单五角色全员过一遍」的额外 Gate；角色参与以真实职责与风险为准。

## 3. 为什么从上一版改成这一版

**已确认的两项失败模式：**
1. 总工程师既负责设计、又拆分微观任务和持续跟踪 Worker，导致上下文及注意力被过量任务细分淹没；
2. 实施与审核由同一角色或上下文完成，导致「自己审自己」、额外需求被混入必须返工范围、问题升级和交接失控。

**本版修正：**
- Chief Engineer 只做**方案、技术边界、重大异常和交付判断**；大量细化与执行跟踪明确下放 Execution Coordinator。
- Execution Coordinator 只在已确定范围内组织工作，避免为拆分而拆分。能在同一 CB 工单中完成的连贯任务，不强制拆成多个阶段/角色/文档。
- Reviewer 与实施上下文、责任分离；审核依据为**原始需求 + 现行批准基线 + 可复核证据**，不是实施者自述。
- 运维能力保留独立专业背景和对话，但按需触发，可与未来 IE Operations 专业角色复用，不单独造运维平台。
- Supervisor 不抄日志：状态事实优先由 GitHub / CB / EO/ES 的确定性数据采集，语义分析才交给 WebGPT。

## 4. 工作移交规则（目标契约）

```text
用户 → PCP Controller → Supervisor（目标/进度/优先级）
                          ↕
                   Chief Engineer（方案/边界/验收标准）
                          ↓
             Execution Coordinator（必要拆解/CB 派工）
                          ↓
                 GitHub Issue / EO / ES / CB
                          ↓
                       Codex Workers
                          ↓
                 实际 Git/测试/日志/任务证据
                          ↓
                Reviewer（独立、有据审核） [按需]
                          ├─ 原范围内缺陷/测试不足 → Coordinator 组织返工
                          ├─ 方案/范围争议 → Chief Engineer 决定技术调整；
                          │                 重大目标/成本变化报 Supervisor/用户
                          └─ 通过 → 按授权的工程验收流程完成
Operations（按需）←→ 部署、环境故障与恢复；受控主机/Worker 执行
```

### 各交接内容与升级门槛

| 交接 | 必须给出 | 不能做 |
| --- | --- | --- |
| Supervisor → Chief Engineer | 项目目标、优先级、交付要求、范围约束、需解决的重大风险 | 直接细分每个子任务或改代码 |
| Chief Engineer → Execution Coordinator | 方案版本/Issue、模块边界、必要技术约束、验收标准、可实施范围 | 把普通 Worker 调度和日志查看留在总工对话内 |
| Execution Coordinator → CB/Worker | 指定仓库/Issue、最小任务、输入依据、预计输出、推荐模型与思考等级、权限和验收要求 | 无依据新增需求或让 Worker 自动修改上游目标 |
| Worker → Coordinator / Reviewer | 真实 Task ID、状态、Git SHA/PR、测试与日志证据、明确 NOT_RUN/失败项 | 把 CB done 冒充 GitHub Issue 完成或审核通过 |
| Reviewer → Coordinator / Chief Engineer / Supervisor | 逐条可复核的问题与影响、通过/返工建议、额外优化建议的独立列表 | 把新想法变成强制返工；自己实施再自审 |
| Operations ↔ 相关角色 | 环境状态、变更方案、风险、回退、宿主验收证据 | 违反 Blue/Green 真实授权边界、重复部署或删除未经确认的任务 |

**Reviewer 对已批准目标提出的“可选优化”不得阻塞本次交付；真正扩范围必须走原有的上游决策权，不得借修复 Bug 顺带加需求。**

**低风险、原范围内的返工可由 Coordinator 组织，不应每次升级到 Chief Engineer 或 Supervisor。**

## 5. 固定身份与 WebGPT 自动协作目标

每个角色拥有可版本化的 Role Charter、独立的 WebGPT 会话关联、明确的输入输出和工具使用边界。记录 `role_id`、`role_version`、`conversation_ref`、当前 `work_ref`；正式定义存于 PCP Git，不将 tabId 或浏览器窗口当作永久身份。

期望的事件：
- 新目标/重大偏差 → Supervisor；
- 已批准的设计任务/重大技术阻断 → Chief Engineer；
- 新执行工单、Worker 回执、普通返工 → Execution Coordinator；
- 进入需独立审核的交付节点 → Reviewer；
- 部署、故障、恢复事件 → Operations。

**WebGPT 会话投递是通知/触发通道，不是最终任务权威。** 交接状态以 GitHub Issue/PR、EO/ES 工单与 CB 运行记录为准；区分消息投递、页面已读取、推理完成、实际工具执行、证据保存与正式验收。必须避免失败重试引起重复真实派单。

**浏览器自动唤醒/后台连续运行：目标未验收。** 既有 Conversation Relay 的单对话测试不能推出五对话无人值守运行；Chrome 关闭、后台节流、会话过期、ChatGPT 网页变更、MCP 工具可用性以及适用服务规则均需验证，失败须显式呈现，不得假装完成。

优先复用原生 Chrome + 最小 Relay 会话控制的**候选路径**；Charterion、OpenTeam 仅为源码参考，Lume、Codex Radar 仅为管理体验/可视化参考，**均非批准依赖**。不因五角色方案另造浏览器、系统调度器、持久任务库或复制 CB/EO/ES/HB。

## 6. Reviewer 独立性、权限和运行规则

- 同一交付物的实施者、执行协调者不能充当独立 Reviewer；审核 WebGPT 应独立读取正式材料而非只继承执行者对话摘要。
- 独立性不强制「每次 Reviewer 都开新标签页」；固定 Reviewer 会话可以保留历史，但同一成果须用正式的当前需求和证据重新核验，记录审查身份与依据。
- Reviewer 可以提出审核不通过及有据返工；是否合并、上线、解除重要限制仍按用户已经批准的项目权威执行。
- 运维与生产变更遵循已批准的宿主权限/操作流程；角色提示词不可代替执行层的硬权限控制。
- 五角色共享项目事实的**引用**，不广播完整私密对话、登录凭据或生产访问密钥。

## 7. 分阶段实现与验收（不等于新增强制审批流程）

**R0：固定角色契约（本版）。** 确认五角色定义、职责边界及 GitHub 交接方式。此项为组织决策已完成，运行能力未实现。

**R1：最小三核心角色闭环。** 验证 Supervisor、Chief Engineer、Execution Coordinator 三个**真实普通 WebGPT 对话**的准确绑定、不同任务投递、回复观察、跨对话交接与角色隔离，至少验证一次非前台页面；严禁拿 Codex 三 Worker 冒充三个 WebGPT 会话成功。

**R2：实际工程任务与独立 Reviewer。** 核对 GitHub Issue / CB 工单真实执行、模型参数与可得的耗时/Token 指标，按事件启动独立 Reviewer。审核拒绝后，普通返工回 Coordinator，范围争议升级；保留所有证据。

**R3：Operations + 状态恢复。** 独立运维对话按真实的非生产运维事件启动；验证会话关闭/重新绑定、事件重发幂等、恢复与受控主机操作边界。

**R4：PCP Controller 工作台。** 汇总五角色、GitHub/EO/ES/CB 的真实状态；参照雷达、Lume 的可视化体验。界面可以与前述验证并行设计，但不能使用模拟 UI 宣称运行闭环完成。

各阶段不要求全套大型集成工程；所有进展标记必须有可核查的真实运行记录。未可见的 Token/模型用量明确标 `unavailable` 或 `not exposed`。

## 8. 与 V0.1 的明确映射

| V0.1 | V0.2 |
| --- | --- |
| `controller`（曾作为 role_id） | **PCP Controller 控制面板**，不算第六个 AI；原管理/监督职能进入 `supervisor` |
| `architect` | `chief_engineer`，保留设计判断，剥离微观派工 |
| `developer`（兼执行协调） | `execution_coordinator` 管派工；真正 `developer` 为 Codex Worker 执行任务 |
| `reviewer` | `reviewer`，独立固定 WebGPT 身份，按需启动 |
| 早期 Operations 候选 | `operations`，固定 WebGPT 身份，按需运维，可对接 IE 专业角色 |
| V0.1 三 WebGPT 闭环 | V0.2 **五个固定角色；三核心优先验证 + 两专业按需唤醒** |

本版角色数量是**五个 WebGPT 角色定义**，不意味着必须一次建满五个活动标签页，也不意味着增加 CB Worker 数量。

## 9. 下次会话恢复与变更规则

新的 ChatGPT 对话讨论「PCP 角色、管理组织、Relay、WebGPT 多对话自动协作」时，先读：
1. **本文件：** `governance/baselines/PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md`（现行角色组织）；
2. `governance/baselines/PCP_WEBGPT_MULTI_CONVERSATION_ROLE_COLLABORATION_BASELINE_V0.1_FIXED.md`（历史目标与仍有效的非冲突原则）；
3. 根目录 `README.md`、`governance/README.md`、`AGENTS.md`，以及相关 EO/ES/CB/IE 仓库的真实运行证据。

**不得再在没有用户确认的情况下，把已确定的五个 WebGPT 角色减成两三个，或擅自增加第六个长期 Agent。** 角色契约的细化和运行机制探索不等于改变组织边界。后续改变固定角色组织需用户明确确认并另立新版本；不得覆盖本 FIXED 文件。

**最终事实：组织架构已获批准并固定；五对话自动驱动、MCP 交接、Reviewer 实际隔离、Operations 运行及雷达式工作台都仍是实施/验收事项。**
