# CH-PCP-007：最终修复验收（2026-10-28）

继续 Draft PR #10，未开启新功能阶段。用户明确授权更新现有 Dev、独立新 Conversation 一次发送、Kernel-only 启动及重启回归。治理沿用 CH-PCP-007 的 Routine/REUSE Gate：仅使用已有 Kernel、授权、绑定和启动器，不增加角色、调度或管理权威；不合并 main。执行推荐未指定，实际 effort 为 NOT_EXPOSED_BY_RUNTIME，runtime_unobservable；未据此阻断工作。

结论：**修复已安装，真实首次回复直接确认通过；重启后绑定、锁和唯一 Attempt 保留，但恢复角色页被 Cloudflare 阻断，需要人工验证，不能将完整重启就绪记为 PASS。** [机器回执](assets/CH-PCP-007-final-acceptance-2026-10-28.json)。此前报告中的“修复未安装”状态由本报告覆盖。

## 已安装的最小更新

- 沿用现有 Trial 根目录、实例 `1cc2ff54f7742042`、扩展 ID、唯一 Host 和 Dev Default Profile。用户授权后，在 Dev/Kernel 未运行时，只替换现有版本目录内的 content.js/map、启动驱动及构建/发布元数据；没有复制 Profile、Cookie、Token 或数据库。
- 基础安装 SHA 仍为 `2a7988e41348e30b3d0bedd1bc7b6c6bbae8b590`；release.json 的 patches 明确记录回复修复 `53240ae5e960ba8b254cf709f8adce147afdff2e` 和启动器提交 `7b1434d`，逐文件重算校验哈希。不是把混合补丁包冒充全量重建。background、Side Panel、Kernel 和 Native 二进制未替换。
- 变更前原始产物、release manifest 及 CMD 备份在 Git 忽略目录 `.build-cache/CH-PCP-007/final/rollback/`，更新哈希在 `update.json`。回滚仅限这些程序文件、元数据和 CMD，不能回滚/删除数据或 Profile；本轮未执行回滚。
- 其他 4 项 Native Host 注册、原历史数据库大小与精确 mtime 不变；普通 Chrome PID 31588 仍在，未控制它。没有新 CDP、安装新 Profile 或自动登录。

## 新 Conversation 的首次回复

另建测试项目 `CH-PCP-007 · Revision 最终修复验收`，project=`b00f66ec-f62a-4a6f-a5a7-f1ed67e9c70f`，Chief Engineer Slot=`d7fa941a-8cbc-4513-939a-939da21934b5`。Fleet=controlled，生命周期锁=true，Revision=1；原项目、Conversation 和历史 Attempt 完整保留。

页面初次出现“无法加载你的账户”，随后自行恢复 authenticated/ready；在其恢复前没有授权发送，也没有自动登录、验证或点击重试。使用现有 bootstrap 授权，约束精确 project/Slot/leaseEpoch/Profile/Tab/contentEpoch，记录 actor 与一次 marker 验收原因。

- **PASS：一次发送**。新 Attempt=`d89552ef-e77a-433f-92e0-3d7df88de84d`，新 canonical Conversation=`6ae1091c-aac0-83e9-9d2a-759dc68ca792`；真实回复与唯一 marker 完全匹配，8.541 秒进入 reply-observed。没有第二次发送或手改账本。
- **PASS：首条回复直接确认**。发送后不再切页、刷新或点击管理页，只通过 Kernel 只读轮询观察。第一次回复状态上报为 Revision 11，回复通知为 Revision 12，二者 observedAt 都是 `1793132833122`；replyObservedAt=`1793132833148`，26 毫秒后持久确认。无后续页面变化补救。对应事件 seq 144→145→146→147 见脱敏回执。
- **PASS：唯一性和历史保留**。新 Slot 只有一个 prompt.send，settled/reply-observed。实例总 Attempt=2：旧 `a66d7ba3-8fbc-4262-8618-c0277f12bf62` 和本次各一个；旧 Attempt 的 state/updatedAt 未变。tasks=0、语义 messages=0，并未清空任何队列。

## 启动、停止和诊断入口

以下入口均位于 `F:\0 codex\Charterion-PCP-Trial-006`：

| 入口 | 行为与实测 |
| --- | --- |
| `PCP-Kernel-Start.cmd` | **PASS**：只启动/连接既有 Kernel，不启动浏览器；原数据目录、Host、实例身份及产物完整性均校验 |
| `PCP-Start.cmd` | **PASS**：同样只启动 Kernel；不再启动 CFT；带旧 `--headless` 参数明确拒绝，不隐式回退 |
| `PCP-ChromeDev.cmd` | **PASS**：先确保 Kernel 就绪，再以现有 Chrome Dev `--profile-directory=Default --restore-last-session` 接入；无新 user-data-dir/CDP，找不到 Dev 时失败，不选择普通 Chrome |
| `PCP-Stop.cmd` | **PASS**：external-chrome-dev 模式只停自有 Kernel，Dev 保持运行；仍保留旧 CFT 模式下的所有权校验与正常关闭保护 |
| `PCP-Diagnose.cmd` | **PASS**：integrity=PASS、kernel=ready，明确浏览器是外部 Dev，并给出真实 runtime 的 auth/pageHealth/时间；不把 Dev 当停止入口所有的进程 |
| `PCP-Control.cmd` | 保留既有管理 CLI、GAM_HOME 和身份校验；没有新增写入接口 |

启动器提交 `3ebc1c3` 增加 Kernel-only/Dev 入口及 PowerShell 时间格式兼容；后续 `7b1434d` 明确外部浏览器停止边界。真实停止测试第一次被旧 CFT PID 失效/复用保护拒绝，没有关闭该进程。修复后状态明确记录 external-chrome-dev，不再拿旧 CFT PID 代表当前 Dev；如果原 CFT 确实仍由本实例运行，切换入口拒绝，要求先安全停止原浏览器。PID、可执行路径、命令行和创建时间校验保留。

## 重启与 HTML 状态

- **PASS：Kernel 停止/重启**。实际运行新 Stop、Start、Diagnose；Kernel PID 更换，Dev PID 不变，没有启动 CFT。两个项目的 canonical ID、generation、生命周期锁和两个已完成 Attempt 均保留。
- **PASS：Dev 正常关闭/重开及持久绑定**。对专用 Dev 使用 CloseMainWindow 并等待退出，无强杀；新入口将 PID 52376→48424，命令行为同一 Default Profile，无 CDP；新角色 Tab 859945846→859945997，绑定的 canonical ID 与 generation=1 不变，Attempt 数仍为 2。
- **PASS：真实 HTML**。插件“打开控制台”入口打开真实页面，已连接 Kernel；页面同时显示原、新项目及各自 canonical Conversation 和生命周期锁。不是模拟数据。
- **BLOCKED_HUMAN_VERIFICATION：重启后的正式角色页就绪**。Kernel 中该页 browserPageStatus=unknown；只读聚合 runtime 的 authenticated/ready 来自其他已加载页，不能据此宣布该 Slot 恢复 idle。核对精确角色恢复页显示“无法加载你的账户”“浏览器检查未能完成。请重新加载此页面重试”“Please pass Cloudflare check”。已停止该页自动操作，未点击验证/重试或更改浏览器标识，已请求用户人工完成。不能以历史会话页可见代替当前租约页就绪。
- 浏览器恢复保留的临时历史 Tab 未清理、未自动认领或换绑；没有为完成验收清空登录态/历史。仅在首次回复确认完成以后才开始重启及页面核对。

## 当前源码验证与断点

- **PASS**：88 个文件、509 项测试；最终完整回归 99.89 秒。驱动时间身份新增 1 项测试；回复通知的原两项回归保留。最后纯校验/诊断整理后专项 8 项再次通过。
- **PASS**：check、check:control、build、build:control、check:dist、check:architecture、check:deployment-docs、node --check、git diff --check。扩展 fingerprint=`776c0d5a5619b688…`，已安装 content 文件与该构建逐字节哈希一致。
- **NOT_RUN**：本轮 Native Host 重新编译（源码及安装二进制未变）；Windows 整机重启；Cloudflare 人工完成后的角色 idle 最终复核。此前 508 项/旧版 E2E 不替代本轮计数。
- 断点 `.build-cache/CH-PCP-007/final/checkpoint.json`，sendStarted=true，stage=`final-reply-pass-awaiting-human-restart-verification`。以后恢复只能读取这一个新 Attempt，不得再次点击发送或再次创建测试项目。
- 本轮保持 PR #10 为 Draft，不合并 main；不接入 CB、Git 交接或下一阶段。待人工验证只做只读状态复核，不再发送。
- Tokdash 历史共享会话 `01a17c6a-87b5-7641-8c5e-e7d170079b63` 收尾采样 tokens=77729915、token_events=578，归属 project-history-shared-session，不计作本轮独占用量；未建立额外任务跟踪体系。
