# CH-PCP-007：Trial-006 真实 WebGPT 角色验收

输入：用户 CH-PCP-007；基线 Draft PR #9 `dd8f44a2fc3828d67b66051b66f0546ba401b355`；既有 Trial-006 运行版本 `fa42f6146ddff9d75a9271ab235d1bef5e6b8ed7`，实例 `1cc2ff54f7742042`。

范围：只操作 `F:\0 codex\Charterion-PCP-Trial-006`，新建一个测试项目及 chief_engineer Slot，使用现有显式授权建立真实 Conversation，发送一次无害 marker 消息，观察回复、HTML 状态、空闲锁定、关页与重启后不重发。保留原 Runtime/Profile/注册/数据库；不扩展角色架构、Git 交接或 CB。

```yaml
architecture_gate:
  required: false
  status: complete
  classification: Routine
  decision: REUSE
  reason: existing approved role, bootstrap authorization, Conversation persistence and Fleet lifecycle verification with scoped bug fixes only
```

治理依据：PCP 主仓 `67fdf81a50fdd90f9c67d90d2f08706c3b669abc` 的 Session Bootstrap、Architecture Governance Gate、Execution Profile Resolution；本仓 V0.3 目标架构和 CH-PCP-003/006 真实结果。复用既有 `agent.spawn`、`agent.conversation-bootstrap-authorize`、浏览器 manager:send 和 Native 协议，不新增绑定权威或任务机制。

登录边界：若 Trial-006 新 Profile 需要 ChatGPT 登录或验证，暂停浏览器自动操作，等待人工完成；不使用旧 Profile/cookie、不自动填写凭据、不绕过验证。发送前持久记录唯一 attempt/marker 断点；任何发送不明均先检查实际 Conversation、Attempt 和回复，不自动重发。

当前状态：Profile 检查及停止机制修复已完成，人工登录后的复用和角色消息验收仍暂停。原始断点保留于 Git 忽略目录 `.build-cache/CH-PCP-007/`。尚未执行的项目不计为 PASS。

## 初始断点：等待人工登录（历史记录）

- 测试项目：`e3b56b16-0c28-4782-bea6-919fd9e646d2`，名称 `CH-PCP-007 · Chief Engineer 真实会话验收`。
- Chief Engineer Slot：`e2ac5204-5086-496f-a4b6-1c2448ead83d`；desiredState=active，browserState=open，conversationGeneration=0。
- 项目 Fleet 为 elastic，lifecycleLocked=true，Revision 1，避免人工登录期间空闲回收。
- 真实登录检查：ChatGPT 登录按钮可见，未见 composer；已将 Trial-006 的 ChatGPT 页面置于前台。专用 Profile 为 `F:\0 codex\Charterion-PCP-Trial-006\chrome-profile`。
- 尚未签发首次 Conversation bootstrap 授权，sendStarted=false，无本轮消息发送。首次 DOM 探针在页面尚无 body 时失败；仅修正本地探针的空值处理，随后识别登录页，不属于产品修复。
- **PAUSED_FOR_HUMAN_LOGIN**：按用户工单要求暂停浏览器自动操作，等待用户在此专用 Profile 完成人工登录。实例及可见窗口保留，方便登录；不停止窗口、不复用其他 Profile 或 cookie。
- NOT_RUN：本轮 Conversation 绑定、无害消息/回复、HTML 角色状态、实际空闲锁/关页/重启/不重发 E2E，以及本轮回归测试；未使用 CH-PCP-003/006 旧结果代替。
- Git 分支 `codex/ch-pcp-007-webgpt-acceptance`；尚未 Commit/Push/创建 PR，待人工登录后完成实际验收。

恢复时先核对 `.build-cache/CH-PCP-007/checkpoint.json` 和实际 Slot/Conversation/Attempt，再继续；不得重复创建项目或盲目重发。

## 2026-10-27 用户补充：暂停登录，检查 Profile 持久化

本段覆盖此前“保留可见窗口等待登录”的状态。收到本轮指令时，Trial-006 已无 Chrome/Kernel 进程；退出原因 UNKNOWN，未推断为脚本或用户动作。只核对配置、进程/文件元数据，不读取/导出/复制 Cookie、Token、Local State 内容或浏览器存储值。正常应用启动仍由现有入口处理内部认证，本轮不提取认证内容。

### 配置与持久存储

- 启动和停止 CMD 均从 `%~dp0` 固定定位同一 Trial-006 根目录；运行脚本的 configAt 固定 `root/chrome-profile`，不按时间/随机值生成 Profile。原安装版本的脚本与仓库源脚本字节一致（修复前核对）。
- `chrome://version` 的实际 Profile Path 为 `F:\0 codex\Charterion-PCP-Trial-006\chrome-profile\Default`，命令行使用同一 user-data-dir，无 guest/incognito 参数。只读取该配置页中的 Profile Path、命令行和版本，不检查 ChatGPT 页面内容。
- 安装仅在不存在的根目录创建 Profile；对已有根目录直接拒绝。start 唯一删除的 Profile 内文件是 DevToolsActivePort（调试发现文件），不删除 Cookies/存储。stop 不删除目录。调用原 gam launcher 时使用 --no-browser，未走其默认 Profile 路径。
- 源码未发现自动清理 Chrome Cookie/站点存储的调用，也未发现 Trial 路径上的清理/重建分支。扩展的任务/Tab 绑定迁移以及雷达断连时内存授权清理，与 ChatGPT Cookie/站点存储不是同一范围。
- Cookie DB 仍为初始安装创建的文件：`Default/Network/Cookies`，创建于 2026-10-27 21:07:31 +08，32768 bytes；未打开数据库、查询行/域名/到期时间，未计算其内容哈希。Profile 根目录、Default、Cookie DB 的文件身份均有 lstat 元数据基线。
- 传统 Default/Local Storage 和 Session Storage 目录本次未见；IndexedDB 目录存在但为空，WebStorage 下有 QuotaManager 文件。仅枚举路径/大小/时间，不据此断言站点存储数据丢失或登录态有效。Session Storage 本来不能作为跨浏览器进程保留的承诺。
- 检查的 Preferences 配置未见显式 cookie 清理/会话专用例外；所查 HKCU/HKLM Chrome policy 未配置临时 Profile 或退出清 Cookie 规则。未修改 Preferences、Local State、策略或 Cookie。

### 发现的停机风险与最小修复

旧 stop 使用 Stop-Process 强制终止 Chrome，不等待正常 Profile 落盘。这是明确的持久化风险；**尚未证明发生了 Cookie/登录态丢失**。修复为：

1. 保留原 PID、创建时间、完整命令行、可执行文件及 Profile 所有权检查。
2. 仅连接已记录的 127.0.0.1 CDP 端口，校验 browser WebSocket 路径；用 SystemInfo.getProcessInfo 的进程元数据再次核对真实 browser PID。
3. 请求 Browser.close，等待精确 Chrome PID 退出，再停止本实例 Kernel。
4. CDP 不可用、PID 不符或超时时失败，不回退强杀 Chrome、不继续停止 Kernel；保留进程供诊断/手动退出后重试。

核对来源：[Chrome DevTools 协议](https://chromedevtools.github.io/devtools-protocol/tot/Browser/#method-close)、[Chromium ExitTypeService](https://chromium.googlesource.com/experimental/chromium/src/+/refs/heads/main/chrome/browser/sessions/exit_type_service.h)。退出标记 Crashed 可跨正常退出保留到崩溃恢复状态被确认，因此早期用 exit_type 单一判据的两次 FAIL 日志不能证明新的退出发生崩溃。没有手动改写该标记。实际打开 chrome://version 配置窗口核对同一 Profile 后，正常退出记录为 Normal；关闭命令响应、进程退出和存储元数据共同验证。

当前源码专项测试 5 项通过，含新增 CDP loopback/端口/路径/凭据拒绝保护；调试端口人为置为不可达后 stop 拒绝，Chrome/Kernel PID 均仍存活，恢复原进程状态文件后正常 stop 通过。所有操作只复用现有 Trial-006 Profile。

上述检查时完整当前源码回归、同根目录版本化安装修复、重启后存储身份复核尚待完成；最终结果见下段。**人工登录后的停止/重启复用及消息 E2E 仍 NOT_RUN**，尚未收到用户登录完成确认；不以 Cookie DB 文件存在代替登录验收。

### Profile 检查最终结果及恢复断点

- 修复 Commit/实际安装版本：`2a7988e41348e30b3d0bedd1bc7b6c6bbae8b590`。只在原 Trial-006 根目录新增版本文件，更新其 CMD、trial.json 和自身 Host 指向；原版本保留。Extension/Kernel/Native 产物按原安装清单复制未改，本轮只改变 lifecycle driver，未重新宣称它们是新构建的二进制。
- `data`、`chrome-profile`、实例 ID、Host 名和扩展 ID 均沿用；未运行 install、未建立另一个登录 Profile，也未复制/导出已有 Profile、Cookie、Token 或站点存储。版本复制源仅为无凭据的版本产物，旧 CMD/config 备份在本轮忽略目录。
- **PASS：87 个当前源码测试文件、506 项测试**，`npx vitest run --exclude '**/.build-cache/**' --pool=forks --fileParallelism=false`，111.17 秒；专项 5 项通过。`node --check`、架构及部署文档检查通过。Driver 修改不要求重新编译未改动的 Extension/Kernel/Native。
- **PASS：实际安装入口停止/重启、固定 Profile 路径**。经更新后的 PCP-Start.cmd/PCP-Stop.cmd，Chrome 和 Kernel PID 均更换，命令行仍为同一 user-data-dir。存储元数据核对 Profile 根目录、Default、Cookies、IndexedDB 和扩展本地存储目录，文件号、设备号及创建时间保持；Cookie DB 大小仍为 32768 bytes。仅证明路径/文件保留，不证明具体 Cookie 记录、有效期或登录状态。
- `Local State` 配置文件的文件号发生变化，创建时间保持、大小有更新；未读取其内容，不能据此断言内容一致或整个 Profile 被重建。将该配置文件的文件号也当作必须永久不变，是初始探针过强断言；保留失败记录，与真正 Profile/存储身份断言分开。
- 安装后一次配置页核对再关闭记录为 Normal；后续停止/重启又记录 Crashed。退出标记不能单独判定落盘成功或 Cookie 丢失；未修改或隐藏该值，最后一次 `Crashed` 原样记录。实际请求 Browser.close 并等待自有进程退出，调试端口失效时拒绝强杀。未把不成立的“必须一直为 Normal”探针当作产品失败或登录态通过。
- 原四项 Native Host 值逐项不变；Trial 自身 Host 指向新版本。原历史数据库长度和精确 mtime 与 CH-PCP-007 起始元数据一致。收尾时未发现之前的原 Runtime 进程（早前 PID 5980），退出原因 **UNKNOWN**；本轮未对其执行停止、重启、安装或配置修改，不宣称其全程存活。
- [脱敏检查回执](assets/CH-PCP-007-profile-check.json)；原始日志：`profile-unit-final.log`、`profile-fail-closed.log`、`apply-profile-fix.log`、`profile-installed-exit.json`、`profile-reuse-final.json`、`profile-preservation-final.json`。退出标记和 Local State 断言失败的日志亦保留，不改写成无失败执行。

**恢复断点**：`checkpoint.json` 的 stage=`profile-check-complete-awaiting-human-login`，sendStarted=false；project/slot/marker 保持不变。Trial-006 用现有 Profile 保持可见运行以供用户手动登录。收到人工登录完成确认后，先只核对是否仍处于登录状态，再实际停止/重启一次并复核登录保留；消息发送仍按用户暂停要求单独等待恢复，不自动执行。人工登录、登录态复用、真实消息/回复和角色 E2E 均 **NOT_RUN**，CH-PCP-007 整体未完成。

```yaml
execution_evidence:
  workorder_profile:
    recommended_model: null
    recommended_reasoning_effort: null
  selected_execution:
    actual_model: gpt-6.1-sol
    actual_reasoning_effort: NOT_EXPOSED_BY_RUNTIME
  resolution:
    type: runtime_unobservable
    reason: workorder omits execution_profile; runtime exposes model but not effort or selection provenance
  requested_by: user CH-PCP-007 profile persistence inspection
  resolved_by: Codex desktop runtime
  actor: Codex
```

Tokdash 共用会话 `01a17c6a-87b5-7641-8c5e-e7d170079b63`，project-history-shared-session；采样 tokens=51762843、token_events=377，last_seen_at=2026-10-27T22:38:48.356+08:00，不归为本轮独占用量。未新建任务跟踪体系。该 Draft PR 交付 Profile 修复和部分验收证据，不代表角色登录/消息 E2E 完成。

### 人工登录结果：Google 安全拒绝

用户随后报告当前登录页提示“此浏览器或应用可能不安全，请尝试使用其他浏览器”，附 Google 帮助页面。该结果来自用户人工登录，不是脚本登录测试；未自动重试登录、点击验证、读取账号信息或提取凭据。

[Google 官方说明](https://support.google.com/accounts/answer/7675428?hl=en) 指出 JavaScript、扩展、自动化控制或内嵌客户端等都可能导致拒绝。当前实际进程仍是 Chrome for Testing 156.0.8078.47，携带原 Trial-006 user-data-dir、回环 CDP 和扩展加载参数；这些是待排查因素，**具体触发原因 UNKNOWN**，不能仅凭提示断定某一参数或扩展是根因，也不能把它归因为 Profile/Cookie 被清空。

当前 stage=`blocked-google-manual-sign-in`。人工登录后的重启复用记为 **BLOCKED_GOOGLE_MANUAL_SIGN_IN**；消息/回复/角色 E2E 为 **NOT_RUN_LOGIN_BLOCKED**。Profile 机制与元数据已测结果保持，不改写为登录成功。不更换或新建 Profile、不复制 Cookie/Token、不改 UA/自动化识别、不降低账号安全设置、不自动更换浏览器二进制或关闭当前登录窗口。原 Runtime 未操作。

后续若评估同 Profile 的纯人工、无调试登录入口，须先确认浏览器版本/Profile 兼容及实例停止边界；那是尚未执行的方案，不能保证 Google 接受。当前维持用户要求的登录/消息暂停，PR #10 为修复与部分验收 Draft，CH-PCP-007 整体未完成。

## 用户改用现有 Chrome Dev：只读连接预检

最新授权替代 Chrome for Testing 登录方案：现有 Chrome Dev 为 PCP 专用，用户确认 ChatGPT 已登录。不得再启动 CFT、不新开 CDP、不重装插件/重建 Profile/复制 Cookie，不控制普通 Chrome；变更插件或 Host 配置前先给出最小方案及影响范围。本轮截至本段只有只读检查，尚未实施插件变更，也未恢复发送。

| 检查项 | 实测结果 |
| --- | --- |
| Chrome Dev 安装 | `C:\Program Files\Google\Chrome Dev\Application\chrome.exe`，158.0.8117.2 |
| 既有 Dev Profile | `C:\Users\jjyyz\AppData\Local\Google\Chrome Dev\User Data\Default`，创建时间 2026-10-23 04:05:37 +08；没有创建 Profile |
| Dev 正在运行 | 检查当时未见该可执行文件的进程；普通 Chrome 为另一路径/PID，只读枚举后未操作。用户已登录的陈述保留为用户事实，未读取 Cookie 或网页账号信息来验证 |
| 既有 Charterion 插件 | Secure Preferences 配置记录 ID `kheifdlffdfcgmapmbbahdgkpccckmbn`，unpacked path=`E:\0 codex\PCP项目\webgpt-lab\Charterion\runtime`；磁盘 manifest 0.5.0。不能仅从离线配置断言当前已启用/加载 |
| 旧插件 Host | background.js 静态代码请求 `com.gpt_agent_manager.control`，不是 Trial Host；无 radar.open / manager:open-console 字符串。旧包与 Trial 同报 0.5.0，但 background SHA256 不同，不能以版本字符串当相同代码 |
| 旧 Host 映射 | HKCU 指向 `%LOCALAPPDATA%\PCP-WebGPT-Lab\Charterion\native-host\com.gpt_agent_manager.control.json`；配置实例 `def1fbcbb4dcd29c`，管道 `gpt-agent-manager-def1fbcbb4dcd29c`；该管道检查时不存在。注册/配置未修改 |
| Trial Host 映射 | 独立 `com.charterion.pcp_trial_1cc2ff54f7742042`，实例 `1cc2ff54f7742042`，管道 `charterion-1cc2ff54f7742042`；注册和 allowlisted extension ID 正确，管道存在 |
| Trial Kernel 真实读取 | 现有 gamctl 只读 health=ok、protocolVersion=2、instanceId 正确；3 项目；work revision=0，tasks/attempts/messages 均 0 |
| 测试项目/Slot | 原测试 project/slot 保持；chief_engineer、active、generation=0、conversationKey 未绑定；elastic+生命周期锁 Revision 1 保持。browserState=open 是历史投影，观察距检查已 681896ms，不能把它当实时在线或 Chrome Dev 连接证据 |
| Chrome Dev → Native → Trial 实时通信 | **BLOCKED：现有插件与 Host/实例映射不一致**；Dev 未运行，未伪造为浏览器端通过 |
| 发送与回复 | **NOT_RUN**，sendStarted=false。未将真实 Kernel 的 CLI 读取冒充 Chrome Dev E2E |

本轮读取范围：Dev 的插件配置 allowlist 字段（ID/path/manifest/permissions/disable metadata）、旧插件静态文件、已登记 Host manifest/config 的实例/管道/凭据路径、只读 Kernel 投影。没有读取凭据文件内容、Cookie、Token、Local State、站点存储值；没有修改 Dev Preferences/Secure Preferences、Native 注册、旧 Runtime、Chrome 启动参数或登录态。普通 Chrome 未关闭/重启/控制；CFT 未启动，CDP 未开启。Windows Host 名称按注册表映射而非 Profile 私有别名，核对依据：[Chrome Native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。

### 最小待实施方案与影响范围

1. 保留现有 Dev Profile 和插件 ID；只在 Chrome Dev 的扩展管理中对同 ID 插件原位更新/切换加载目录到 `F:\0 codex\Charterion-PCP-Trial-006\versions\2a7988e41348e30b3d0bedd1bc7b6c6bbae8b590`。不卸载清数据、不改 key；若 UI 要求卸载重装，停止并报告，不自行执行。
2. 复用已存在的 Trial 唯一 Host 注册，不改 `com.gpt_agent_manager.control` 或其 manifest/config。不要编辑旧 `E:\...\runtime` 包，因为它属于其他 Runtime，不能把 Chrome Dev 的切换扩散为共享运行代码替换。
3. 已核对新旧 manifest key、extension ID、permissions 及 ChatGPT content matches 一致。影响为 Dev 内该扩展的 worker/content script 版本及目标 Kernel 改变；不更改账号 Cookie、Profile 或普通 Chrome 的插件加载配置。新内容脚本生效可能需要刷新所选测试 Tab，必须限于 Dev 中的测试会话，不做全浏览器刷新。
4. **启用前阻断条件**：当前包的 migrateLegacyWorkStateOnce 会在目标 Kernel work revision=0 且扩展遗留 tasks/attempts/messages 非空时迁移旧工作状态，之后移除旧键。Trial 当前恰为 revision=0；Dev 旧扩展的工作队列、Supervisor 开关和绑定尚未读取，不能保证为空。因此不能盲目换载。先只读核对旧插件任务/绑定的计数、所有权及开关；有遗留则停止，不自动迁入 Trial、不清空它们、不伪造 work revision 绕过。该步骤只检查既有机制，不修改角色/任务架构。
5. 条件满足后，只验证 Dev 插件真实 health/instance、HTML 状态读取及 Kernel 确认绑定。确认没有旧会话/队列冲突后，才另行恢复 CH-PCP-007 一次无害发送；不得靠 CLI/人工构造 Native 调用替代浏览器链路验收。
6. 回退方案为仅在 Chrome Dev 将同 ID 插件路径恢复到原 unpacked 目录；不回滚/删除 Profile 或 Cookie，不改旧 Host。因尚未切换，当前无需回退。

此方案涉及用户要求预先说明的插件配置变更，且迁移冲突检查尚不完整，故本轮停在方案审阅与旧扩展只读检查边界。尚未实施上述变更，未启动任何浏览器。原始证据在 `.build-cache/CH-PCP-007/chrome-dev/`；[脱敏预检回执](assets/CH-PCP-007-chrome-dev-preflight.json)。本轮只新增记录，未改代码，既有 506 项测试不重复计作本轮新执行；新编译/测试及 Dev 实际 E2E 均 NOT_RUN。

已请求用户在现有 Chrome Dev 的 Charterion 面板只读核对任务/消息数量、Auto supervisor 开关和既有项目/角色绑定是否存在，不提供聊天内容或凭据、不发送或授权绑定。当前没有可直接读取该浏览器扩展运行状态的工具，不能为取得这些状态开启用户禁止的新 CDP 控制；也不离线解析扩展数据库中的任意值。收到上述运行状态后继续评估迁移冲突，不能将未回复视为空队列或批准换载。收尾只读复核：普通 Chrome 原 PID 31588 和 Trial Kernel PID 39976 仍存在，未见 Chrome Dev 进程；JSON 回执解析及保护标志校验、git diff --check 通过。
