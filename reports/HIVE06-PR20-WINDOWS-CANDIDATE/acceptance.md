# Acceptance evidence

状态：**BLOCKED**（诊断与指南已准备；不是升级获准或 Windows E2E DONE）。

| 项目 | 当前证据 / 结论 |
| --- | --- |
| 业务基线 | 本地只读 git rev-parse HEAD = 0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a |
| Windows 原源码验收 | 用户提供 npm ci/verify=0；98 files/541 tests、34 fault PASS；本机未执行 |
| 源码审查 | trial/package/runtime/native config、schema 自动迁移与备份机制已读，风险见 readme |
| 本包校验 | 见最终报告的实际命令结果；SHA256SUMS 覆盖四项交付，独立清单不自哈希 |
| PowerShell 解析及 Windows 只读运行 | NOT_RUN：本环境无 powershell.exe/pwsh，不能验证 Registry/CIM/路径/实际加载状态 |
| 原位安装/回滚演练 | NOT_RUN：本单禁止，且身份/备份/迁移/Chrome 可逆切换证据未齐 |
| 发布证据 | 本单不 commit/add/推送/PR；bridge 后续生成工具提交及 evidence branch，将最终提交 SHA 与本清单绑定 |

预检的 BLOCKED 不是 test pass，也不能以本地静态审查代替 Windows 执行。补齐后由操作员在受限位置保存脱敏输出、时间、操作者与完整清单；含消息正文/凭据的日志不得提交。预检始终阻塞涉及人工证据的门，必须由逐项签署的维护审查解除，不修改脚本强行返回 0。

## 后续 Chrome Dev 人工 UAT（需另行明确授权；本单未发送）

先核对只有既有 Default Profile、相同 extension ID、相同 data/host/pipe 和注册对象；保存 snapshot 的 ID/lease/Attempt 基线。用户编辑消息时暂停测试，不强制刷新。

1. 两个既有 Developer 的受管 lease-owner Tab：逐个确认 project/slot/conversation/tabId/leaseEpoch 对应正确。明确授权测试消息后，每个 Tab 独立发送一个唯一标记并各收一条回复，验证只到对应 Conversation/Attempt、无串路/重复。不要创建真实 Project/Slot 或使用普通 Tab 代发。
2. 普通 Tab 选择隔离：在同一 Default 的既有普通页选择/查看，不应接管受管 lease、改变绑定或把普通页消息送到受管 Conversation。核对前后 snapshot；不以跨页聚合 authenticated 代表角色页 ready。
3. Select Idle：只展示当前精确 lease-owner Tab、有新鲜可信 idle 证据的目标；busy/unknown/stale/待人工验证不应入选。仅观察实际状态，不通过伪造 runtime 或改库制造 idle。
4. 受控重启恢复：另行授权、保存编辑、暂停派单和核对所有 Attempt 后，经宿主仅重启 Kernel；核对同一绑定/Conversation 和已完成、进行中 Attempt 的恢复语义，不能自动重复发送或生成替代 Attempt。遇到不确定投递保持阻塞并人工处理，不 retry 探测。

每项记录时间、前后 snapshot revision、脱敏 ID/leaseEpoch/Attempt、结果与操作者确认；任一映射不明、来源不明或重复即 FAIL/BLOCKED，保持暂停按回滚门处理。UAT 不修改 PCP FIXED/CB Blue-Green/Role Charter，不等于获准 merge main 或安装第二套浏览器。
