# Charterion / PCP 专项增强：设计与开工入口

> **当前状态**：架构/部署/实施计划已形成设计基线；尚未完成本增强方案的编译、真实 WebGPT 自动投递及部署验收。  
> **分支**：`pcp/role-session-enhancement-v0.1`。**不能以文档提交声明代码已上线。**

## 从这里开始读

| 文档 | 作用 | 状态 |
| --- | --- | --- |
| [PCP_CHARTERION_ENHANCEMENT_BASELINE_V0.1.md](PCP_CHARTERION_ENHANCEMENT_BASELINE_V0.1.md) | 2026-10-27 原版研究结果与 PCP 适配范围、既定前提、未解问题 | 研究/目标基线 |
| [PCP_CHARTERION_TARGET_ARCHITECTURE_V0.2.md](PCP_CHARTERION_TARGET_ARCHITECTURE_V0.2.md) | 角色身份、绑定、会话、事件、权限和责任边界；模块改动图 | 目标架构 |
| [PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md](PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md) | Windows 本地开发/单实例受控部署/双实例隔离/备份和回滚 | 部署规范 |
| [PCP_CHARTERION_IMPLEMENTATION_ACCEPTANCE_V0.1.md](PCP_CHARTERION_IMPLEMENTATION_ACCEPTANCE_V0.1.md) | CH-PCP-00～08 工单、P0～P4 阶段 Gate、验收矩阵 | **下一步执行入口** |

## 已确定的三条不可突破的边界

1. PCP Controller 是控制面板，不是第六个 WebGPT Agent；五个 WebGPT 核心逻辑角色的定义来自 [PCP V0.2 固定基线](https://github.com/Su9moon/personal-ai-control-plane/blob/main/governance/baselines/PCP_WEBGPT_ROLE_ORGANIZATION_V0.2_FIXED.md)，不由 Charterion 创建或重定义。
2. Charterion 是**会话/角色/投递运行适配器**，正式工程工单与证据以 GitHub/Engineering Operations/Execution Server 语义/现有 Codex Bridge 为准，不再建设同类工作流调度器。
3. 角色与 Conversation 的长期绑定不等于 Tab ID；测试策略允许 pin 页，但最终支持断线保留、按授权恢复；拒绝未授权改绑、错误会话发送、盲重发真实工具动作。

## 实施者第一条指令

**先完成 CH-PCP-00：只读确定源码/已安装 Extension/Native Host/Kernel 的精确版本与两个既有 Draft PR 的代码差异，输出 REUSE/MODIFY/SUPPRESS/DO-NOT-DUPLICATE 映射。** 然后从 CH-PCP-01/02 开始独立小补丁，逐项通过单测及原生 Chrome E2E。不要再次绕回“把原版 Elastic Fleet 整套跑通”。

## 部署保护

- 现有 `GAM_HOME`、Chrome Profile、AgentSlot、历史 Conversation 和 Git 工作目录不做重置。
- 新工作树做源码开发，不通过 `setup-windows.ps1 -NoStart` 安装平行 Host：该操作仍会改当前用户注册表。
- 新代码在真实 Windows 单活环境应用前，须完成受控快照、准确归属检查、迁移与回滚评估。
- 双实例同时工作先解决 Host 命名空间/来源冲突，**不是只建第二个 Chrome Profile 就能解决**。
- 任何验收状态以真实回执写明 `PASS / FAIL / BLOCKED / NOT_RUN`，Git 文档不等于运行成功。

## 既有代码和证据

- [Charterion fork](https://github.com/Su9moon/Charterion)
- [Draft PR #1：ChatGPT DOM](https://github.com/Su9moon/Charterion/pull/1)
- [Draft PR #2：conversation-fenced routing](https://github.com/Su9moon/Charterion/pull/2)
- [PCP 仓研究记录](https://github.com/Su9moon/personal-ai-control-plane/blob/research/charterion-facts-20261027/assets/candidates/2026-10-27-charterion-research-facts.md)

**完成代码与实测前，本文所有实施状态均 NOT_RUN。**
