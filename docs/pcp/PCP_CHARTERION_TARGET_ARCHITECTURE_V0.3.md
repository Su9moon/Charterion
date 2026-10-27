# Charterion × PCP｜项目中心、Git 交接与内置控制台目标架构 V0.3

- **状态**：产品目标及架构方向已由用户确认；技术结构为待实施设计；`NOT_IMPLEMENTED / NOT_E2E_VERIFIED`
- **确认日期**：2026-10-27
- **取代**：`PCP_CHARTERION_TARGET_ARCHITECTURE_V0.2.md` 在控制台归属、角色实例/项目关系、上下文交接方面的旧方案；其他不冲突的安全、持久化及运行边界继续有效。
- **上级权威**：PCP Git 主仓 `PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md` 的**五种角色类型、职责和权责分离**不变。Controller 是控制界面而不是第六个 WebGPT。
- **代码实现仓**：`Su9moon/Charterion`，分支 `pcp/role-session-enhancement-v0.1`。此处不更改 PCP 主仓正式组织基线。
- **术语**：用户口述的「get」在本设计中按 **Git / GitHub（项目仓库、Issue、PR、正式工作引用）** 理解，而不是 HTTP GET 请求。若具体数据不在 Git，不虚构已存在。

## 1. 一句话定位和本版关键决策

**Charterion 成为 PCP 的项目化 WebGPT 角色协作运行层和内置管理/雷达控制界面；以项目为工作容器，以 Git/正式工单为工程过程交接中心，以短工作引用触发各角色自行检索所需材料；必要时调用现有 CB/Codex 执行；所有绑定、锁定、角色权限和行为参数应有可配置的明确策略。**

从原版 Charterion 复用：本地 Kernel、SQLite、Native Host、原生 Chrome/Content Script、AgentSlot、Conversation 观察、投递/Attempt 证据、有限 Fleet 功能。重划 Charterion 原有 Task DAG/Git Workspace/工程 Scheduler 的权威，不让其与 PCP 现有 EO/ES/CB 重复。原版自动弹性 Fleet 改为显式可选的运行资源策略。

## 2. 面向用户的实际使用方式（产品场景）

1. 打开 Charterion 的 PCP 管理界面，**先看项目列表**：计费、经营看板、CB、其他工程项目及每项健康/进度/阻断。
2. 点选项目，在项目配置中为需要的角色建立 WebGPT 工作会话（不强制一项目五会话），填 Role Charter 版本、Conversation 映射、Git 上下文源及必要的执行权限。
3. 管理界面显示每个项目的各会话：角色、实际 ChatGPT Conversation、最近任务、在线/未知/未授权/阻断、投递/回复、Git 工单与证据，以及按授权可见的 CB Worker。
4. 用户在界面上可显式绑定/换绑/解绑 Conversation、暂停/恢复角色参与、锁定某会话、锁定某项派发或项目维护状态；每个动作记录操作者/原因/时间。**手动锁比自动管理优先**。
5. 产生新的正式工作时，目标角色只收到短消息：`project_ref`、`role_id`、`work_ref`、`source_ref`、目标、验收、必要约束。不是将完整上下文从另一 WebGPT 对话复制过来。
6. 当前 WebGPT 角色利用已有受限 GitHub/MCP/工具能力**按自己的角色权限读取** Git Issue/PR/指定文件、历史结论及相关证据；输出写回该项目的正式位置，再以结果引用通知下一角色。
7. 进入编码/测试时，Execution Coordinator 在已批准边界内通过 GitHub/已有 CB 调用 Codex Workers；其 Task ID、Git SHA、测试和真实回执回到原有权威。Reviewer 独立读取原始范围和证据，不相信 Worker 自述。
8. 对浏览器不在线、额度耗尽、MCP 不可用、工单无法读取等情况，控制台准确显示阻断，允许人工接管；不假装自动化已成功。

## 3. 原版 / 前版 / V0.3 的变化对照

| 维度 | 原版 Charterion | 此前增强 V0.2 | 本次确定 V0.3 |
| --- | --- | --- | --- |
| 用户入口 | 原版 Side Panel + CLI，内部工程平台视角 | Charterion 偏底层适配器，Controller 独立规划 | **Charterion 内建 PCP 管理/雷达控制台**，可供 PCP 上层复用，不另造第二套管理后台 |
| 组织主轴 | ProjectCell/AgentSlot、内部任务 | 五固定角色与独立 Conversation | **项目优先**：项目内选择并配置角色会话；五种是角色类型而非五个全局唯一 Tab |
| 任务/过程交接 | 内部 Task DAG / Work Authority / Git Workspaces | Git/EO/ES/CB 作正式权威 | **以 Git/GitHub/正式引用贯穿中间工程过程**，短消息触发角色自行读取 |
| ChatGPT 上下文 | 内部 task prompt 组合 | 角色简短通知、Conversation 隔离 | **项目 × 角色按需取上下文**；不相互复制完整聊天记录；跨项目隔离 |
| Fleet 生命周期 | 自动按 demand 和 idle 收缩/复活 | controlled 与可选 elastic | **默认人工可锁定、可配置调度**；观察状态与管理意图分离 |
| 参数管理 | 原版若干内置硬编码/配置 | 拟新增少量策略 | **全局默认 + 项目覆盖 + 角色/会话覆盖**，有校验与版本化 |
| CB 接入 | Charterion 自己有工程执行逻辑 | 外部 CB/EO/ES 独立 | **按项目按需连接既有 CB**；无 CB 项目照样运行，不造新的 CB Worker 引擎 |

## 4. 建议的逻辑分层与数据流

```text
PCP 整体治理（PCP Git：角色类型/角色契约/边界/全局授权）
                          │
                          ▼
          Charterion 内置 PCP Controller / Radar
        项目选择 / 健康状态 / 手动锁定 / 参数配置 / 回执
                          │
                 project_id / role_id / work_ref
                          ▼
           Charterion Kernel（现有进程内增强）
      ┌─────────────────────────────────────────┐
      │ Project Registry：项目与项目的 Git 定位 │
      │ Role Session Registry：项目×角色×会话   │
      │ Policy/Lock Manager：人工锁定优先       │
      │ Delivery Ledger：短消息尝试/去重/回执   │
      │ Runtime Observation：页面/租约/恢复      │
      │ Status Projection：只读真实状态供雷达   │
      └──────────────────┬──────────────────────┘
                         │ Native Host
                         ▼
              Chrome Extension / ChatGPT Web
       ┌────────────────┼────────────────┐
       │ 项目A          │ 项目B          │ 项目N
       │ Supervisor     │ Chief Engineer │ ...
       │ Chief Engineer │ Coordinator    │
       │ Coordinator    │ Reviewer       │
       └────────────────┴────────────────┘
                         │
              角色受限 Git 读取/写回正式成果
                         ▼
    Git 项目 Repo/Issue/PR ── EO/ES 既定工作契约
                         │
                    需要时才调用
                         ▼
                    CB → Codex Workers
                         │
             Task ID / SHA / Test / Evidence
                         └──> Git 正式结果 + 雷达状态投影
```

图是**职责模型**，不要求新建 6 个服务；第一期尽量复用 Kernel/SQLite/扩展与现有侧边栏。桌面雷达 UI 的具体技术（原生桌面容器/本地界面/复用现有 UI）在实现阶段比较；最终应是实际可操作的应用界面而非只读 HTML 文档。

## 5. 项目中心的会话模型

**角色定义 `RoleType` 只有五种，身份由 PCP Git 定义；实例 `ProjectRoleSession` 则按实际项目创建。** 同一角色类型可以参与多个项目，但必须具有各自明确的 `project_id + scope + conversation_ref`；不能因角色同名就把其他项目上下文混入当前对话。

建议概念键：

- `ProjectConfig`：`project_id`、名称、正式仓库、Issue/PR 工作源、项目授权、允许角色、可选 CB 接口、默认运行/监控配置。
- `ProjectRoleSession`：`project_id`、`role_id`、`role_version`、可选 `session_key`、`conversation_ref`、`binding_revision`、授权/锁定/活跃工作引用。
- `RuntimeObservation`：`runtime_instance_id`、`profile_id`、`tab_id`、`lease`、页面状态和最新观测时间。**这是运行快照**，不是绑定主键。
- `WorkPointer`：`project_id`、`work_ref`、Git commit/issue/PR 源版本、目标角色、所需最小输入与输出引用。
- `DeliveryAttempt`：`event_id`、目标项目和角色实例、`binding_revision`、`attempt_id`、实际发送/回复/不确定状态。

一个项目可以只配置两个角色；三个核心角色是首个 E2E 示例，不强制所有项目创建三或五个。**同一项目同一角色是否允许多个 Session** 是可选功能，需显式 `session_key` 或稳定绑定 ID，不可静默择一。跨项目的 Supervisor 总览可通过**明确授权的聚合只读视图**实现，而非默认让项目 A 的对话有读取项目 B 的能力。

## 6. Git 中间过程、短通知和按角色读取上下文

**原则**：对话不是事实库；Git/GitHub 是工程协作工件及阶段交接的主要入口；EO/ES/CB 已有正式事实以稳定引用呈现，不将其数据库复制成另一套仓库。

| 信息种类 | 放在哪里 | 谁可以读取 |
| --- | --- | --- |
| PCP 五种角色契约与治理 | PCP 主仓（按版本） | 相应角色读取自己允许的定义及必要共用规则 |
| 项目目标、批准基线、设计决议、工单 | 项目 Git repo / Issue / PR / 授权文件引用 | **项目和角色授权**允许的当前任务范围 |
| 方案草案、阶段成果、实现/测试/Review | 对应 Issue/PR、提交、artifact 或规范文档 | 具备对应权限的角色；Reviewer 读取独立证据 |
| CB Task/Worker 状态、模型/时间/Token | CB 的真实运行记录，Git 中引用任务 ID/回执/必要冻结证据 | 根据角色允许的真实执行和审查范围 |
| 浏览器心跳、tabId、lease、临时投递状态 | Charterion 本地 SQLite/必要运行缓存 | 管理界面/已授权运行模块；**不提交 Git 作为每秒日志** |
| 密码、cookie、令牌、可复用私钥 | 原有受保护本地/凭据机制 | 不经由 Git/角色群消息分发 |

**标准通知示意（不是最终 RPC schema）**：

```json
{
  "project_id": "project-a",
  "target_role": "chief_engineer",
  "work_ref": "github:owner/repo#123",
  "source_ref": "git:commit-or-approved-baseline-sha",
  "purpose": "阅读已批准需求，形成模块设计",
  "expected_result_ref": "github:owner/repo#123/comment-or-PR",
  "correlation_id": "stable-workflow-id"
}
```

**交接规则**：
1. 角色先验 `project_id + role_id + work_ref + scope`，再读取该角色被允许的文档；Reader 不能用“知道 URL”替代授权。
2. Reader 读取当前 Issue、相关批准基线、所需改动/证据；不要默认拉入另一个角色的全部聊天、草稿及所有仓库。
3. 角色提交阶段结论到目标 Git 位置（或现有 EO/CB 明确权威），记录 commit/Issue comment/PR/ref；只有可信的新结果引用才触发下一角色。
4. 若 WebGPT 会话本身已具备授权 GitHub/MCP 读取能力，则自行检索；**否则** Charterion 可在权限校验后附上允许的**最小片段/单个结果引用**，不能声称网页天然具备自动连接能力。
5. 源数据访问控制应由 GitHub/工具授权/Host/CB 硬边界实现；Prompt 角色规则仅约束任务意图，不是跨项目数据安全隔离的唯一保障。
6. 用户若手动锁定“暂停派发”或“禁止跨项目读取”，任何自动组织或恢复均不能绕过；Git 提交与通知的 correlation 保持以便恢复。

**正式工程中间过程走 Git** 不意味着把所有高频状态或密钥写入 Git。Git 是成果/决策/证据的权威来源之一，运行瞬态留 Kernel；CB/EO/ES 的已有专用权威仍有效。

## 7. 内置雷达/控制台应有什么？

### 7.1 四级视图

- **全局概览**：项目数量、运行/暂停/锁定/阻断分布，待人工决策，CB/Worker 总况和异常。
- **项目视图（默认工作入口）**：每个项目的角色会话、工作流水、Git Issue/PR 和工单、关联 CB Task、最近事件、阶段结果。
- **角色会话视图**：Role Version、Conversation 绑定、当前 Tab/页面/模型可得信息、投递/回复、锁定/恢复动作、最近一次读取的工作引用。
- **运行与审计视图**：Kernel/Native Host/Chrome Profile/extension、连接健康、投递 attempt、错误原因、版本/重启/回滚证据。

UI 应支持列表、按项目筛选、重要状态聚合、可追踪任务图或时间线、深度状态详情和手动操作。借鉴 Codex Radar/ChatCMD 的交互体验，但数据来自真实事件与正式工单引用；用户不希望仅生成一个静态 HTML 监控页。

### 7.2 手动锁定语义（必须与实际观测分离）

| 人工控制 | 作用 | 自动逻辑必须如何处理 |
| --- | --- | --- |
| `binding_lock` | 禁止自动换绑/解绑会话 | 只读观察继续，自动变更拒绝 |
| `dispatch_lock` | 禁止向某项目/角色/会话投递新消息 | 继续观测现有已发 attempt，不再新发 |
| `lifecycle_lock` / `pinned_tab` | 禁止自动关闭/暂停测试中的页面资源 | Fleet 可监控但不得收缩指定资源 |
| `project_maintenance` | 项目进入维护/手动暂停 | 自动工单触发进入 hold，保留 pending 与原因 |
| `manual_recovery` | 由用户明确恢复/解除相应锁定 | 记录谁/何时/理由/影响的记录 |

**锁定的是管理指令，不能伪造事实**：手工把“暂停派发”设为 true，不意味着网页健康状态必须显示 `idle`；也不能把失败的 Task 手动显示为已真实执行。锁需持久化、可审计、重启恢复、明确解除，按项目/角色/会话层级继承覆盖；手动锁的优先级高于自动调度规则。

### 7.3 参数和配置分层

默认：`Global defaults → ProjectConfig → ProjectRoleSession override`。会话层覆盖仍不得超出角色权限/安全上限；对每项配置明确类型、默认、允许区间、来源和审计。

可调范围按优先级分批实现：
- 项目仓库/Issue 路径、角色启用/禁用、对话绑定、角色模型/工具偏好（若网页或 Runtime 不支持强制模型，应显示“建议/不可保证”）。
- 手动/按需/临时弹性生命周期，pinned 状态，健康轮询节奏、超时、告警阈值、自动恢复次数。
- 单项目/单角色最大并发、消息节流、发送去重、在 uncertain 状态下是否要求人工检查（默认要求）。
- Git 上下文许可范围（路径/Issue/PR/材料类型）、哪些成果必须写回 Git、是否需要 Reviewer。
- 是否启用项目的 CB、可选 Worker/执行 Profile、模型建议和成本预算/可得用量展示。
- UI 偏好：排序、项目分组、过滤、状态列、告警级别。

**不可配置绕过**：正式授权、错会话拒发、密钥保护、真实完成证据、CB/生产权限、Reviewer 独立性。应显示哪些是上层策略而非任意可关的“安全开关”。

## 8. 与现有 Charterion 原码的映射

| 模块 | V0.3 工程调整 | 保留的能力 |
| --- | --- | --- |
| `control/src/controlPlane.ts` + DB 契约 | 加入/明确项目配置、受控角色会话绑定、持久人工锁、审计/状态投影 | 原有 ProjectCell、AgentSlot、事件/租约 |
| `control/src/elasticFleet.ts` | 只管理有策略授权的网页资源，手动 pin/锁定优先 | 明确 opt-in 的 elastic 管理 |
| `src/background.ts`、`src/fleet.ts` | 改为按项目角色路由、绑定版本校验、锁定及来源一致性检查 | 发送/观察/周期 reconcile |
| `src/bindingRegistry.ts` / `src/fleetTabRegistry.ts` | 长期 project-role-conversation 绑定与短期 tab 映射分离 | 原有 Browser 缓存及重启恢复 |
| `src/chatgptAdapter.ts` / `src/content.ts` | 先修 ChatGPT 新页面 `unknown`，再可观察地投递/读回复 | DOM/Content Script 框架 |
| `src/sidepanel.ts` + 新 UI 视图 | **直接扩展为 PCP Radar / Controller 操作入口**，先提供项目/会话/锁定/状态，再丰富图表 | 原版 Side Panel |
| `control/src/workAuthority.ts` / Task DAG | 仅留会话级投递事务/兼容，不提升为工程正式任务权威 | 现有 attempt、local recovery |
| Native Host/config | 保障本地实例来源身份、权限/命名空间；不重复服务部署 | 原有 Native RPC 与 Kernel |
| Git 接入/Role resolver | 解析项目工作引用、项目/角色白名单，角色自主读取或最小安全摘录 | 已有 Git/Worktree/授权能力中可用部分 |
| CB 集成 | 通过既有正式任务引用和授权 MCP/CB 接口接入 | 不另建 Worker 或执行数据库 |

UI 与项目模型可以并行设计，但**第一次真实消息闭环仍是里程碑**；不能因为 Dashboard 看起来完整就声称角色自动协作成功。

## 9. 实施切分和真正的完成标准

**I0 事实盘点**：核对当前源码、构建包、两 Draft PR、本机 Kernel/Native Host；建立实际可复用映射。旧环境不修改。

**I1 项目控制骨架**：项目配置 + 项目角色会话索引 + 显式绑定/解绑 + `binding_lock/dispatch_lock/lifecycle_lock` 持久化；在 Charterion Side Panel/内置本地 UI 上看到、操作及审计。没有真实角色会话时明确 OFFLINE/UNBOUND。回归自动缩容超过 120s 不覆盖锁定。

**I2 单 WebGPT 真实闭环**：修 DOM `unknown`、canonical Conversation 身份、错误会话拒发；项目/角色/工作引用短通知到正确网页，一次发送与回复，结果/证据状态可见；非前台发送和不确定重试测试。

**I3 Git 角色上下文和三角色交接**：项目仓库配置、Git 引用定位/按角色读取范围；三个角色分别从正式 Git 中拉取当前工作，独立保存阶段结果，短引用串联；另一项目无法误读其内容。

**I4 CB/Review/恢复**：按需调用现有 CB，真实工单/Worker/测试/PR 证据；Reviewer 独立核验；服务/Chrome/扩展重启、冻结锁/重复事件、角色恢复；尽力保证投递幂等且不伪称 exactly-once。

**I5 雷达完善/Operations**：在已具项目/角色/投递/CB 的真实数据上建设进度时间线、工单状态、用量、告警和操作视图；非生产运维事件真实验收。UI 可以自 I1 起持续完善而非到 I5 才启动。

每个阶段交付：独立 commit/PR、局部测试、真实浏览器验收截图/事件序号/回执、失败/NOT_RUN、可逆部署策略；**禁止仅以文档与纯单测宣布 E2E 完成**。

## 10. 部署和跨项目安全

首阶段在原有 Windows 本地 Kernel + 专用 Chrome + Native Host 上进行受控验证；代码构建使用隔离 worktree，不重建/清库既有数据。未解决同 Windows 用户 Native Host 注册覆盖之前，禁止把两个同名 Host 当作独立生产实例。项目隔离首先在**数据模型 + Git 授权 + 角色路由 + runtime scope**中落实，必要时使用独立 Chrome Profile/Windows 用户，不假装只靠 prompt 就能阻止串上下文。

**人工锁定与项目配置必须通过 Kernel 持久化，不能只有面板本地状态。** 新数据表/迁移版本的具体选择交由实施阶段评估已存在数据和回滚兼容性，避免突然破坏旧 AgentSlot。

## 11. 尚待实测/实现期决定

- 具体 UI 容器和技术选型；是否复用原生 Side Panel 并增加独立可展开控制窗口。
- 项目级角色会话是否需要多会话/多浏览器实例、以及 `session_key` 的最终 schema。
- WebGPT 从 GitHub 直接读取的真实能力、工具权限、无权限时的最小引用/摘要 fallback；不能假设所有登录对话都自动连接 GitHub。
- 哪些“工作草稿”确实需要 Git 提交，哪些只是未完成的暂时记录；不可把瞬态日志塞到 Git。
- 原版 Task DAG/organization Work Authority 在本 fork 的具体保留或封存方案及迁移。
- ChatGPT 页面 DOM/限额/MCP 在多项目多角色后台调度下是否稳定。

## 12. 上游事实和变更边界

本版记录用户对 Charterion 上层职责的**明确扩展**：控制/雷达面板做在 Charterion 内部，项目优先规划会话，配置与锁可管理，工程中间成果通过 Git 交接。PCP **五类角色、EO/ES/CB 工程事实权威及用户保留授权**没有被取消。实施不需要再为上层 Dashboard 独立建仓，也不意味着 ChatCMD 必须丢弃；ChatCMD 仍可用作 UI 交互参考或整合候选，具体由实测决定。

**状态结论**：TARGET V0.3 DEFINED；工程源码和本地部署 `NOT_RUN`。
