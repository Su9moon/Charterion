# Charterion × PCP｜首轮机制核查与改造记录（2026-10-27）

- **归属**：Charterion fork 代码分支 `feat/pcp-project-fleet-control-20261027`；Draft PR #4（base：PCP 设计分支）
- **状态**：源码静态核查完成 + 首轮 Kernel 改造及测试源码提交；**构建 / 测试实际执行 NOT_RUN；部署 / WebGPT E2E NOT_RUN**。
- **适用架构**：`docs/pcp/PCP_CHARTERION_TARGET_ARCHITECTURE_V0.3.md`。独立动态 HTML 雷达尚未实现；Chrome 插件只是未来启动入口。
- **实施边界**：不触碰 Windows 既有 `GAM_HOME`、Chrome Profile/Native Host、AgentSlot、历史 Conversation；不改变 PCP 正式五种 Role 类型、Git/EO/ES/CB 任务权威。

## 发现的原始事实（SOURCE）

1. `control/src/controlPlane.ts::createProject()` 对重复仓库根路径复用既有 ProjectCell，并将 `minSlots` 使用 `Math.min` 合并。**重复 createProject 不是改变常驻目标的可靠配置接口**。
2. `control/src/elasticFleet.ts::planElasticFleet()` 使用 `project.minSlots` 及页面 Idle、Lease、Task demand 等事实决策；`minSlots=0` 的项目可在超过约 120s 的空闲阈值后自动 suspend。
3. `control/src/controlPlane.ts::reconcileElasticFleet()` 对每个项目的 suspend/resume/spawn 决策执行实际改变，浏览器扩展再根据 `desiredState` 关/开 Tab。这解释了本轮实测 466–471 的 Auto Suspend 事件。
4. `src/bindingStore.ts::resolve()` 当前有一个**额外潜在机制冲突**：当临时 Tab 绑定对应页面出现 canonical Conversation ID 时，它会自动把临时绑定迁移至持久映射。这可能违反 PCP 要求的显式 RoleBinding 授权，**但并不证明已有 DB 被非法改写**。下一轮必须结合 UI/Kernel/Native Host 真实路由进一步验证并修复。
5. `native-host/scripts/install.ps1` 在 Windows 用户级 HKCU 写同名 Native Host 注册，不能靠两个 `GAM_HOME` 宣称同用户双实例隔离。
6. 原版 `control/src/database.ts` 用递增 `migrateVn()` 自动升级数据库；未经 DB/回滚验证，不得直接让新 Kernel 打开当前用户生产或测试 Runtime DB。

## 此次真正修改了什么（CODE）

| 目标 | 修改文件 | 已实现的静态行为 |
| --- | --- | --- |
| 项目 Fleet 管理模式 | `control/src/contracts.ts` | 类型 `elastic / controlled`，生命周期锁、revision、actor/reason |
| 持久化 | `control/src/database.ts` | 新增 **V28**、`pcp_project_fleet_controls` 表。对旧项目无配置行默认 elastic；不清空旧表 |
| 权威与审计 | `control/src/controlPlane.ts` | 读取 / CAS 更新项目控制配置，幂等无变更、revision 冲突拒绝；审计 `PCP_PROJECT_FLEET_CONTROL_CHANGED` |
| 自动生命周期开关 | `control/src/controlPlane.ts` | 对 `controlled` 或 `lifecycleLocked` 项目，Kernel 不执行原版 Elastic 的自动 suspend/resume/spawn |
| 可调用的受控接口 | `control/src/rpcLegacy.ts` | 管理员 `project.fleet-control-set`，授权读 `project.fleet-control-get`；普通 scoped fleet capability 无权在受控/已锁定项目创建、暂停、恢复和退休 Slot |
| 机制测试源码 | `control/tests/pcpProjectFleetControl.test.ts` | 6 个测试：旧项目兼容、项目隔离与 revision、禁止 Auto Suspend、RPC 管理员权限、fleet capability 拒绝、SQLite 重开保持 |

**本次只实现项目 Fleet 受控模式/生命周期锁，不宣称完整项目角色会话绑定、页面 pin、消息 dispatch lock、Git 上下文权限或动态 HTML。** 旧项目默认仍走弹性规则，PCP 项目需由主控**显式设为 controlled**，不能拿不存在的配置当作已启用。

## 已复核的不变量与尚未完成部分

- [x] 代码路径：自动缩容必须经新项目受控策略检查；不能靠 `minSlots=1` 假装控制权被修改。
- [x] 设计：项目级模式和人工锁落 Kernel SQLite，不只在扩展本地 storage 中存。
- [x] 设计：写入要求管理员权限和乐观 revision；审计记录人工原因；非管理员能力不得绕过已锁项目进行相同 lifecycle RPC。
- [x] 设计：旧项目没有新记录时维持作者原版 Elastic 行为，不会静默修改既有运行配置。
- [ ] 真实编译、Vitest、现有全量 `check:control` / 测试回归。
- [ ] Native Host / Extension 对新 RPC 的暴露与新 HTML 授权访问；尚未实现 dashboard。
- [ ] 不同 Organization 运行路径是否存在**绕开此项目 Fleet 策略**的 AgentSlot 操作；需核查并统一。
- [ ] 新项目创建时自动设为受控的单一事务入口；当前必须管理员显式设置两步。
- [ ] 独立 `ProjectRoleSession` 与首次 Conversation ID 的正式绑定/授权；目前仍是原版 AgentSlot 与 Browser 临时绑定机制。
- [ ] 浏览器实例/Chrome Profile 抢租约、`unknown` DOM、真实消息回复和 CB 工单闭环。
- [ ] 当前用户 Windows Runtime 的受控升级、Schema V28 一致备份/回滚以及真正 E2E。

## 需要在隔离工作树执行的最短验证（尚未执行）

```powershell
npm ci
npm run check:control
npx vitest run control/tests/pcpProjectFleetControl.test.ts
npm run test:control
npm run check:architecture
```

在真实 `GAM_HOME` 测试新 Schema **前**，需先以隔离 DB 模拟 V27 → V28 升级并验证原项目/会话/任务不丢。真实浏览器、Native Host、CLI 只有在构建精确 SHA 与维护窗口明确后才切换。

## 下一次改动：先解决角色绑定权威

下一轮 **CH-PCP-01** 重点查清并修复 Browser `bindingStore.resolve()` 的临时绑定自动持久化、Kernel `bindAgentConversation()` 的权威和多项目 `project_id + role_id + conversation_ref` 如何统一。让页面 Tab 即使被关闭也保留正确的角色和会话，同时不能让其他项目、角色凭页面 URL 抢占会话绑定。

之后才做 Kernel 同进程 `127.0.0.1` 状态接口和**独立动态 HTML 控制台**；插件只负责“打开控制台”。每完成一个实际可运行切片立刻复核证据，然后继续下一个，不进行大规模架构重写。

**本报告分离了已观察的源码事实、已提交的代码以及尚未运行的验收，后续不允许因 PR 创建就把运行状态写为 PASS。**
