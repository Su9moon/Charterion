# Charterion-PCP｜操作说明与重大版本人工验收规范 / User Guide & Human Acceptance

- 日期 / Date：2026-10-28
- 适用实例 / Instance：`F:\0 codex\Charterion-PCP-Trial-006`，现有已登录 Chrome Dev
- 验收目标 / Goal：在真实用户操作下确认 Charterion 是否可用，而不是用 Codex 的自动 PASS 代替用户结论。
- 版本界限 / Version boundary：本分支含双语 UI 源码草案，尚未部署到 Chrome Dev；使用者实际看到的界面以本机已安装版本为准。
- 本文不授权发消息、切换真实生产项目、修改 Native Host 注册、复制浏览器 Profile/Cookie 或接入 CB。

## 一、启动与进入 / Start & Open

1. 保持日常 Chrome Stable 不受影响；使用已登录、已安装 Charterion 插件的 **Chrome Dev**。
2. 打开 `F:\0 codex\Charterion-PCP-Trial-006`，运行 `PCP-Start.cmd`。从 CH-PCP-007 起它只启动/连接本实例 Kernel，**不再启动 Chrome for Testing**。
3. 已打开 Chrome Dev 时直接使用现有窗口；必要时才使用 `PCP-ChromeDev.cmd`，该脚本使用现有 Dev Default Profile 而不是创建新 Profile。
4. 在 Chrome Dev 扩展界面点击“打开控制台 / Open Console”，打开独立 HTML 页面。确认“已连接 Kernel / Connected”，而不只是显示静态网页。
5. 若页面显示不可用，先运行 `PCP-Diagnose.cmd`；不要用旧安装器覆盖 Host、清除 Profile 或反复登录。

## 二、页面区域 / Areas to Inspect

| 中文 / Chinese | English | 功能 / Purpose |
| --- | --- | --- |
| 项目与角色会话 | Projects & Sessions | 选择项目并查看项目状态、Fleet 模式、生命周期锁 |
| 角色槽位 | AgentSlots | 查看角色、正式 Conversation、页面/浏览器状态、最后观测 |
| 状态详情 | Details | 检查项目 ID、Slot ID、绑定代数、租约、Tab、状态、错误 |
| 最近事件 | Recent Events | 查看 Kernel 记录的真实事件，不用推测的运行状态代替 |
| 项目手动控制 | Project Controls / Fleet | 载入 Revision，使用独立项目授权码配置 controlled/elastic 与锁 |

`open` 只表示标签页已打开；`unknown` 表示缺少可信的当前页面就绪信号，**不能**当作 `idle`、`ready` 或允许发送的证明。CH-PCP-007 中正式角色页重启后 `unknown` 为已记录阻断，Kernel 投影与观测一致，但单页实时原因未确定。

Side Panel 中的 Task DAG、Auto Supervisor、发送和导入操作属于其他操作面；本次人工 MVP 验收默认 **不启用自动主管、不批量发送、不导入状态、不创建或执行任务**。

## 三、人工控制 / Optional Manual Fleet Control

仅对指定测试项目，在得到明确授权后操作：

1. 在雷达展开“项目手动控制 / Project Controls”，选择测试项目，按“载入当前版本 / Load Revision”。
2. 用本机 PowerShell 为精确 projectId 签发该项目专属短期授权（需已持有本机管理权限）：

```powershell
@{projectId='<project-id>'; actor='human UAT'} | ConvertTo-Json -Compress |
  & 'F:\0 codex\Charterion-PCP-Trial-006\PCP-Control.cmd' radar.authorize-control --admin --stdin
```

3. **只复制返回的项目短期能力码**（`fleet_` 开头）到页面，不要填 admin token。有效期约 10 分钟；Kernel 重启即失效。
4. 核对项目、Revision、Fleet 模式、生命周期锁，填写变更原因，勾选人工确认，再点击“确认并应用 / Apply”。
5. 查看成功回读、Revision 与审计事件；冲突或结果不明时先刷新核对，**不自动重复提交**。

`controlled`（受控）或生命周期锁限制自动扩缩容；`elastic`（弹性）并解锁可能恢复自动管理。若不希望改变当前资源策略，本轮只检查控制项和授权说明，不实际提交。

## 四、停止与恢复 / Stop & Recover

- `PCP-Stop.cmd` 只停止本试运行 Kernel，**不会关闭用户管理的 Chrome Dev**。
- 再次执行 `PCP-Start.cmd`，用插件重新打开独立雷达（Kernel 端口和只读授权可随进程变化）。
- 只读核对项目、正式 Conversation、generation、锁 Revision、历史 Attempt 和最近观测；不得因为重启而重发已完成消息。
- 所有状态与原始事件不一致时记为 FAIL/BLOCKED，并保留证据，不自动复位。
- 当前 CH-PCP-007 已验证两次真实发送的 Result 和数据保留，但正式角色恢复 `idle` 仍 BLOCKED；**不能将这项记为通过**。

## 五、每个主要 MVP / 版本必须进行人工验收

**固定门禁 / Release gate**：

1. **工程验收 / Engineering**：构建、测试、真实 E2E、可追溯 SHA、升级/回滚和未完成项表。
2. **提交候选 / Candidate**：冻结版本 SHA 和实际安装包，提供一键启动、清晰的中文操作说明、必要截图/演示与回滚方法。
3. **用户人工验收 / Human UAT**：用户自己在真实 Chrome Dev + 独立 HTML 控制台操作，不由 Codex 自动 E2E 代替；按下表记录。
4. **结论 / Decision**：用户明确回复 **PASS / 有条件通过 / FAIL / BLOCKED**。未收到结论一律记为 **PENDING_HUMAN_UAT**，不可宣布“正式完成”。
5. **升级 / Next Stage**：重大缺陷修复后重新执行受影响场景；重大版本未经验收，不默认进入依赖它的生产接入或功能推广。与本版本无依赖的独立开发可继续。

### 本轮 Charterion-PCP 用户验收表 / Acceptance Checklist

| ID | 人工操作 / Operator action | 预期 / Expected | 当前状态 |
| --- | --- | --- | --- |
| U01 | 在 Chrome Dev 打开扩展及独立控制台 | 真实连接当前 Kernel、显示实例/项目 | PENDING_HUMAN_UAT |
| U02 | 查看项目筛选、AgentSlots 和详情 | 正确显示测试项目、Conversation、锁、状态 | PENDING_HUMAN_UAT |
| U03 | 观察动态状态及断线告警 | unknown/offline/unavailable 不伪装成 ready | PENDING_HUMAN_UAT |
| U04 | 在测试项目载入 Revision 并检查控制流程 | 明确项目、原因、独立授权、冲突处理 | PENDING_HUMAN_UAT |
| U05 | 按授权执行一次控制更改并回读（可选） | Revision、真实状态与审计一致 | NOT_RUN |
| U06 | 停止/恢复本实例 Kernel，Dev 保持运行 | 项目、绑定、锁和 Attempt 保留；失联不冒充在线 | PENDING_HUMAN_UAT |
| U07 | 验证双语 UI（新源码部署后执行） | 主要文本中英清晰、中文优先、关键操作无歧义 | NOT_RUN |
| U08 | 正式测试角色恢复就绪 | 精确 Tab 实时状态可信；不盲发 | BLOCKED（已知） |

## 六、人工验收回执 / Human Sign-off

- 候选源码 SHA / Installed build SHA：
- 实际测试日期、Chrome Dev 版本、Kernel 实例：
- U01–U08 逐项：PASS / FAIL / BLOCKED / NOT_RUN
- 发现的缺陷（界面、权限、状态、恢复、误操作风险）：
- 最终用户结论：**PENDING_HUMAN_UAT**（待用户亲自填写）
- 允许进入下一阶段的范围（如有条件通过）：

> Codex 的单元测试数和“已完成 E2E”只能填在工程证据部分，不能自动给 U01–U08 填 PASS。
