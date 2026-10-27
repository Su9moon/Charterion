# PCP × Charterion｜项目中心增强实施与验收 V0.2

- **确认**：2026-10-27；**适用设计**：`PCP_CHARTERION_TARGET_ARCHITECTURE_V0.3.md`。
- **状态**：WORK PLAN FIXED；所有新版本运行/单测/E2E `NOT_RUN`。
- **取代**：旧 `PCP_CHARTERION_IMPLEMENTATION_ACCEPTANCE_V0.1.md` 的阶段描述及“主控界面后置”建议；旧版保留为历史工单细目参考。
- **不可更改的上游条件**：PCP 五种角色、Controller 非第六 WebGPT；GitHub/EO/ES/CB 正式工程任务权威；本地 Kernel/Web Extension 只协调会话、消息和状态。

## 总工序

**CH-PCP-00 / S0（无修改）**：对齐 Charterion fork `main`、两个 Draft PR 的源码差异、当前运行包和 Native Host 精确版本；输出 REUSE / MODIFY / SUPPRESS / DO-NOT-DUPLICATE。禁止动原 GAM_HOME、扩展配置或历史绑定。

**CH-PCP-01 / I1a（项目及会话模型）**：`ProjectConfig` + `ProjectRoleSession`，保留五个 `role_id` 类型但允许按项目选择数量；每个绑定有 `project_id + role_id + conversation_ref + binding_revision`，手动 bind/rebind/unbind 可审计，跨项目不自动复用 Conversation。

**CH-PCP-02 / I1b（锁与参数配置）**：支持 `binding_lock/dispatch_lock/lifecycle_lock/project_maintenance`，Kernel 持久化+手动解除+重启验证；配置继承 `Global → Project → RoleSession`，具有类型、边界、来源、审计。观察 `page_health` 独立于人为 `desired_control_state`，不会被“手动设成已完成”污染。

**CH-PCP-03 / I1c（独立动态 HTML 控制台）**：随 Charterion 提供**独立 HTML/CSS/JS 页面**，在浏览器新标签页打开，展示真实项目总览→角色会话→状态/手动锁与配置操作。Chrome 插件只增加“打开控制台”入口，**不得在 Side Panel 中开发完整面板**。优先让同一个 gamd Kernel 的回环 HTTP 接口提供页面和受控状态读写，不引入第二套后端。全局数据取自 Kernel 和正式 Git/CB 权威源，断线显示 unavailable。写操作须经 Kernel 鉴权/版本校验/审计并回读后确认。

**CH-PCP-04 / I2（DOM + 唯一消息闭环）**：修 `unknown` 和 canonical Conversation bootstrap；正确项目×角色×绑定版本校验、一次真实无害测试发送、回复关联、非前台页面和 fail-closed；不把“发送成功”当成 Git 中已有成果。

**CH-PCP-05 / I3a（Git 上下文检索）**：配置项目 repo/issue/PR 入口，Role Charter 定义允许的资料类型、路径/引用和工具范围；角色通过连接的 GitHub/MCP/工具**自取**工作文档。无直接权限时由受限 Reader/Charterion 返回短允许片段与引用，不复制全部对话上下文。测试跨项目与跨角色不越权、正式信息读取并保存引用。

**CH-PCP-06 / I3b（三角色真实协作）**：一个实际项目配置 Supervisor、Chief Engineer、Execution Coordinator 三个独立 WebGPT 会话；由 Git Issue 创建带 `work_ref` 的任务触发，前一角色将阶段产物保存 Git，下一角色从 Git 独立读取；至少一次非前台页面、两次跨角色交接。第二项目最少一个会话用于交叉污染拒绝检查；不需要每项目配齐五角色。

**CH-PCP-07 / I4（CB + 独立 Reviewer）**：项目配置决定是否连接已有 CB。Coordinator 在明确批准边界内提交真实 CB Task；记录模型/思考参数建议、Task ID/运行时间/Token 可得情况及 Git SHA/测试；Reviewer 独立读原始需求与证据，确认或退回；回执与 Review 由正式系统决定，不以 Charterion 文本伪造。

**CH-PCP-08 / I4b（故障与恢复）**：Chrome/扩展 SW/Kernel 重启、消息不确定、重复事件、锁继承、Git 403、MCP 不可用、CB quota、限流、浏览器 Profile 冲突；旧绑定保持，错误投递=0，不盲重发真实动作，人工可接管。

**CH-PCP-09 / I5（独立 HTML Radar/Operations 完善）**：在同一**独立动态 HTML 控制台**持续完善项目全局、角色会话、Issue/PR/CB、状态时间线、错误、真实可得用量与告警；包含受控非生产 Operations 事件及回滚证据。

## 第一批实际要做的文件/模块（非新增服务）

| 功能 | 既有源码候选 | 第一轮可验收结果 |
| --- | --- | --- |
| project × role session | `control/src/controlPlane.ts`, `control/src/contracts.ts`, `src/bindingRegistry.ts` | 一个项目绑定一角色，另一个项目同 role 不污染 |
| manual lock/config | `control/src/elasticFleet.ts`, `src/fleet.ts`, Kernel RPC | 空闲 120s 不自动关闭被 pin 的 Tab；dispatch lock 拒发 |
| standalone HTML dashboard | 独立 `dashboard/` HTML/CSS/JS（候选路径）、gamd 同进程本地 HTTP/API；扩展 action 仅启动链接 | 项目/角色真实状态、手动锁定与 Kernel 回读，不在 Side Panel 绘制 Radar |
| DOM and attempt | `src/chatgptAdapter.ts`, `src/content.ts`, `src/background.ts` | 唯一探针送达正确 Conversation，观察 reply |
| Git context | GitHub/已有连接、role/version 工作引用 | 三角色独立读当前授权工作引用，提交相应正式成果 |

先完成 I1 的真实可操作控制骨架，再做 I2 单会话闭环；**UI 与运行能力要同步迭代**。用户要求大部分参数可调，不意味着第一版把所有参数同时做成可覆盖：先提供与正确运行直接相关的绑定、锁、项目 Git 入口、超时和恢复策略，其他逐步开放。

## 本地部署/回滚（与旧部署规范兼容）

- Source-only worktree 使用独立路径进行开发/构建/静态单测；**不运行**会写用户级 Native Host 注册表的 setup/install 脚本。
- 第一套 E2E：单 Windows 用户注册的 Host、专用 Chrome Profile、单 GAM_HOME，受控切换并保留历史 DB/会话，确保同一项目角色绑定的迁移安全。
- **面板架构已定为独立动态 HTML 页面**，需要与 Kernel 实时通信；第一版采用同一 gamd 进程的本地 HTTP 静态页面/状态与操作 API（实施时核对兼容性），只绑定 `127.0.0.1`，端口可配置。回环监听仍必须有认证、Origin/CSRF 防护和写操作授权，不通过 URL 传递管理员令牌。Chrome 扩展 action 只负责打开页面，不在 Side Panel 承载仪表板；禁止未经授权暴露局域网/公网访问。
- 迁移必须能保持旧 ProjectCell/AgentSlot/Conversation，兼容方案和回滚证据先行；手动锁/项目配置的持久化必须随数据库快照核验。
- Native Host HKCU 同名注册限制未解决之前不采用两个 GAM_HOME 同账号平行安装来声称双实例隔离。
- 先取得本地 source exact SHA、extension build hash、runtime ID、真实事件序号，再验 E2E；GitHub Actions 额度不决定本地测试可否执行。

## 验收矩阵（全为 NOT_RUN，待逐项补证据）

| ID | 真实条件 | 预期 |
| --- | --- | --- |
| G01 | 两个项目使用相同角色类型 | 按 `project_id` 独立绑定并在 UI 正确展示 |
| G02 | 项目 A 的 Git issue 触发到角色 B | 只有允许角色读取指定正式材料；项目 B 不被误读 |
| G03 | 角色绑定/换绑/解绑 | 人工授权、revision、审计可回读；重启不丢 |
| G04 | dispatch_lock 期间有自动事件 | 有 hold 原因、不可新发；解除后由可靠来源恢复 |
| G05 | lifecycle_lock 且空闲超过 120s | 有真实 `idle` 观测，不会静默关闭锁定的 Tab |
| G06 | Chrome 关闭/重启或 MV3 SW 休眠 | 会话绑定保持，失联显示 offline，恢复前验证身份 |
| G07 | 页面已加载但 DOM status unknown | 显示诊断/不发送；修复后单探针 reply-observed |
| G08 | 发送成功但 ACK 丢失 | 标 uncertain，无危险重复物理发送 |
| G09 | 三 WebGPT 角色分工 | 3 真实独立对话、不同工作、短引用交接、至少一次非前台 |
| G10 | 正式 Git Issue→阶段结果 | Git 记录源和结果引用可核查，不复制聊天全文 |
| G11 | 按项目连接 CB | 有真实 Task ID/Commit/Test/Review，未授权项目不调用 |
| G12 | 独立动态 HTML Radar/UI | 在普通浏览器标签页独立加载，Chrome 插件一键打开；项目、角色、锁、运行状态、Git 工作及异常可操作且来自真实 Kernel/API 回执；扩展 Side Panel 中不包含完整 Radar |
| G13 | 多 Chrome/Profile | 独立源标识，跨实例的 lease 抖动拒绝或隔离 |
| G14 | 无法连接 Git/MCP/CB/额度 | 明确 BLOCKED/NOT_EXPOSED，可人工处理，不冒充完成 |

**Gate 通过定义**：每一项要有提交 SHA、测试命令/时间/机器、真实 Role/Conversation/Work ID、成功或失败的事件/Attempt/正式 Git 结果；`NOT_RUN` 不得当做 PASS。旧 PR #1/#2 独立审查，不直接合并。

## 关于进度与设计权威

本文件作为 V0.3 架构的下一步工单索引；原 V0.1 工单文件仍可参考，但不再用其中“主控另行实现”和“项目会话非核心”的表述限制当前目标。所有业务/工程过程继续遵守上游 PCP/EO/ES/CB 固定语义。当前没有实际修改运行代码、Native Host、Registry、Chrome Profile 或测试数据库。
