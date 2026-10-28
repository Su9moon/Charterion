# Charterion × PCP｜项目化角色协作、独立 HTML 控制台和 Git 交接

> **当前入口**：2026-10-27 用户确认的 Charterion 增强架构 **V0.3**。设计基线与各工单实际结果分开记录；既有 Runtime 保留，本轮另建独立试运行实例。
> **当前试运行**：[CH-PCP-006：Windows 集成试运行](reviews/CH-PCP-006-INTEGRATED-TRIAL-2026-10-27.md)。独立目录 `F:\0 codex\Charterion-PCP-Trial-006`，双击 `PCP-Start.cmd` 后由插件“打开控制台”；`PCP-Stop.cmd` 停止，`PCP-Diagnose.cmd` 诊断。独立 Host、数据和专用 Chrome Profile，验收结束已停止。项目管理边界见 [CH-PCP-005](reviews/CH-PCP-005-RADAR-CONTROLS-2026-10-27.md)，只读底座见 [CH-PCP-004](reviews/CH-PCP-004-READONLY-RADAR-2026-10-27.md)。
> **最新验收（2026-10-28）**：[CH-PCP-007 最终修复验收](reviews/CH-PCP-007-FINAL-REPAIR-2026-10-28.md)。`53240ae` 已安装到既有 Dev；独立新 Conversation 一次消息的首次回复直接进入 reply-observed（同一 observedAt，26ms 持久确认），509 项回归通过。新增 Kernel-only/Dev 入口，原 Start 不再启动 CFT。人工验证已完成；正式测试 Slot 暂停/恢复后为 active/absent，canonical 绑定、锁和两个 Attempt 保留，但打开恢复 URL 被自动审批拒绝，最终 idle 仍 BLOCKED。保留 Profile、登录态及原 Runtime，不启动下一阶段。

## 最重要的设计结论

1. **项目中心**：PCP 保留五种固定职责类型，每个项目自行配置所需 WebGPT 角色会话（不强制配齐五个）；Conversation 按项目和角色显式绑定。
2. **独立动态 HTML 控制/雷达页面**：浏览器单独打开 HTML 页面查看项目、会话、Git 工单、真实状态和可得的 Worker 指标；操作绑定、手动锁定、暂停/恢复和配置。**Chrome 插件仅提供“打开控制台”入口，绝不将面板做进 Side Panel**。HTML 页面经同一 Kernel 的本机回环接口获取真实数据及提交受控操作，不另建第二套后台。
3. **Git/GitHub 作为工程过程交接中心**：正式需求、方案、Workorder 引用、阶段成果、审查和证据留在对应项目 Git/Issue/PR（EO/ES/CB 原有权威保持）；不同角色之间只发送短 `work_ref`，各角色按授权独立读取自己需要的上下文。
4. **可配置，但不能越权**：全局默认→项目→角色会话；人工绑定/派发/页面生命周期锁优先于自动策略。页面观测状态是真实数据，不因手动锁定伪造。
5. **需要时才连接现有 CB**：Charterion 不重复实现 Codex Worker、通用任务队列或第二套 EO/ES。
6. **不复制上下文**：权限按项目/角色/正式工作源执行；无 GitHub/MCP 工具权限则显式阻断或提供已授权最小摘要，不假定所有 WebGPT 都能直接操作 Git。

## 当前文件（从上往下读）

| 文档 | 内容 | 定位 |
| --- | --- | --- |
| **[目标架构 V0.3](PCP_CHARTERION_TARGET_ARCHITECTURE_V0.3.md)** | 项目模型、独立 HTML Radar/Controller、Git 角色上下文、手动锁、配置、接口和架构差异 | **当前权威设计** |
| **[实施/验收 V0.2](PCP_CHARTERION_IMPLEMENTATION_ACCEPTANCE_V0.2.md)** | CH-PCP-00～09、迭代次序、源码候选和实际 E2E Gate | **当前开工入口** |
| **[部署蓝图 V0.2](PCP_CHARTERION_DEPLOYMENT_V0.2.md)** | Windows 独立 HTML 控制台、插件启动入口、单 Kernel 回环 API、专用 Chrome、Git/CB 连接和部署步骤 | 当前部署设计 |
| [部署/回滚规范 V0.1](PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md) | 旧运行环境、Native Host HKCU、备份和回滚保护 | 仍生效 |
| [增强研究 V0.1](PCP_CHARTERION_ENHANCEMENT_BASELINE_V0.1.md) | 原版已验能力和未确证问题 | 历史研究及不冲突边界 |
| [架构 V0.2](PCP_CHARTERION_TARGET_ARCHITECTURE_V0.2.md) | 原先偏“底层 Session Adapter、外部 UI”的方案 | **被 V0.3 修改的旧版** |
| [实施/验收 V0.1](PCP_CHARTERION_IMPLEMENTATION_ACCEPTANCE_V0.1.md) | 旧次序和已研究的局部任务 | 历史参考 |

## 一条最短的真实工作链

```text
用户在 Charterion 管理面板选项目 / 授权
  → 根据 ProjectConfig 找到 RoleSession
  → 向该 WebGPT 对话发送短工作引用
  → 角色按工具权限自行打开对应 Git Issue/文件
  → 在 Git 留下方案/阶段结果/证据
  → 事件通知下一个具权限的角色
  → 必要时 Execution Coordinator 调用 CB/Codex
  → 原始 Git/CB 回执和状态投影返回 Charterion 雷达
  → 人工可随时锁定/接管
```

Git 管正式工程事实与成果；Kernel/SQLite 管项目配置、绑定、锁、浏览器租约、消息投递和状态记录。不要让每次心跳触发 Git commit，不在 Git 保存 token/Cookie/全量聊天文本。

## 真正开始编码

1. **CH-PCP-00**：对齐真实本机运行包与代码/既有 PR #1/#2，源代码只读清点。
2. **CH-PCP-01～03**：项目化绑定、手动锁/策略、**独立 HTML 项目/角色雷达及 Chrome 插件启动入口**；控制台的数据和写操作由 Kernel 提供。
3. **CH-PCP-04**：一次真实正确会话的 ChatGPT 消息/回复闭环。
4. **CH-PCP-05～06**：Git 正式引用/按角色读取，三 WebGPT 交接及项目隔离。
5. **CH-PCP-07～09**：按需 CB、Reviewer、恢复和 Radar/Operations 深化。

不得以文件提交、UI mockup、单元测试通过冒充 WebGPT 真实运行。原有 AgentSlot、历史会话和主机 Host 注册表不能清理/覆盖；本地升级必须遵循部署文档。

## 上游链接

- [PCP 角色 V0.2 FIXED](https://github.com/Su9moon/personal-ai-control-plane/blob/main/governance/baselines/PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md)
- [Charterion Draft PR #1](https://github.com/Su9moon/Charterion/pull/1) / [#2](https://github.com/Su9moon/Charterion/pull/2)
- [Charterion 研究冻结事实](https://github.com/Su9moon/personal-ai-control-plane/blob/research/charterion-facts-20261027/assets/candidates/2026-10-27-charterion-research-facts.md)

**状态**：V0.3 用户需求方向确认；研发和部署 NOT_RUN。
