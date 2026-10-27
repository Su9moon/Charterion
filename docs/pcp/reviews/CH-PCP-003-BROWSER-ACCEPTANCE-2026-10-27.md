# CH-PCP-003：真实浏览器机制验收

- 日期：2026-10-27（Asia/Shanghai）。
- 输入：[Draft PR #5](https://github.com/Su9moon/Charterion/pull/5)，`c5ac470bce713ebe7bfb525588a840d512839f51`。
- 范围：Native/.NET 构建、独立 Kernel 通信、真实 Chrome 扩展/ChatGPT 会话及机制缺陷最小修复。未部署原 Runtime，未合并 main。
- `architecture_gate: { required: false, reason: routine_verification_and_bugfix }`：沿用既有协议、角色、权限和持久化模型。
- 治理参考：PCP 主仓检出 `67fdf81a50fdd90f9c67d90d2f08706c3b669abc` 的 Architecture Governance Gate、Session Bootstrap、Execution Profile Resolution。

## 隔离环境

系统 `dotnet --list-sdks` 无输出。本工单仅在 `.build-cache/CH-PCP-003/sdk` 解压 SDK **9.0.320**；压缩包 SHA512 与微软 release metadata 一致。未安装系统 SDK，也未持久修改 PATH。使用 Chrome for Testing **156.0.8078.47**，未替换系统 Chrome。

测试根目录 `.build-cache/CH-PCP-003/browser-CVfM5L` 独立保存 `home`、`profile`、`extension`、`native`。Kernel 实例 `210cdf1f2ccd7258`，CDP 仅监听 loopback。扩展 ID `kheifdlffdfcgmapmbbahdgkpccckmbn` 来自仓库 manifest key。

测试扩展从本轮 `dist/` 复制，**仅在测试副本中**把 Native Host 名称替换为随机独立名称 `com.charterion.ch_pcp_003_e3e0670ceb134615993e3ad475925646`，增加该随机注册项。生产 Host 名称、协议及已有注册项未改。其余扩展代码来自构建产物，最终恢复/隔离/锁测试使用指纹 **`26bc9028b16f7ca7`**。

未复制原 Profile、cookie 或凭据。最初 headless 会话遇到 Cloudflare；用户明确选择在这个新 Profile 的可见窗口中手动验证和登录，随后执行真实 ChatGPT 测试。

## 实际结果

| 验证项 | 结果 | 证据及边界 |
| --- | --- | --- |
| `npm run build:native` | PASS | 缓存 SDK 9.0.320；net9.0；0 警告、0 错误 |
| 独立 Native 发布 | PASS | framework-dependent `dotnet publish --self-contained false`；未运行正式安装脚本 |
| .NET Host → Windows 命名管道 → Kernel | PASS | 真实二进制、独立数据库，无 transport mock |
| Chrome 扩展 → .NET Host → Kernel | PASS | 实际 `chrome.runtime.sendNativeMessage`、health/control.snapshot |
| 真实首条消息 → canonical → 项目角色持久绑定 | PASS | 项目 C，单次发送，generation=1，唯一回复及 Kernel `reply-observed` |
| 整个浏览器及 Kernel 退出后恢复 | PASS | A/C 原 canonical、角色和回复恢复，generation=1；C 保持 `reply-observed` |
| 跨项目绑定更新 | PASS | C Tab 请求 A 的同名角色被拒；持久投影前后一致 |
| 跨项目误导航 | PASS | C Tab 打开测试会话 A 后无角色；Kernel C 身份不变；返回 C 后恢复 |
| 真实关 Tab / Fleet 重开 | PASS | C Tab `415205730` → `415205733`，canonical 不变、generation=1，无重发 |
| 手动生命周期锁 | PASS | elastic、minSlots=0，实际空闲 173,994 ms 后经真实扩展/Native 触发 reconcile，仍 active/open；不伪造 observedAt |
| Native 锁正/反例 | PASS | 合成 130 秒前 idle 观察；锁定保留，显式解锁后 suspend；不是 Chrome E2E |
| Native 授权与越权拒绝 | PASS | 授权首绑、无授权/换绑/跨项目/自动 rollover/admin 方法/错误 origin 拒绝；浏览器观察为合成数据 |
| 全量回归 | PASS | `npm test -- --exclude '**/.build-cache/**'`：82 文件，470 测试；新增 8 项 |
| 类型检查 | PASS | `npm run check`、`npm run check:control` |
| 架构、构建和产物 | PASS | `check:architecture`、`build`、`build:control`、`check:dist` |
| 正式 Runtime 安装/系统 Chrome Profile 验收 | NOT_RUN | 本工单禁止覆盖现有环境 |
| self-contained 发布、安装/启动器冒烟 | NOT_RUN | 本轮使用隔离 framework-dependent Host |
| Hosted CI | NOT_RUN | GitHub Actions workflows 查询 total_count=0；不把本地 PASS 当作托管 CI |

回归命令排除 `.build-cache`，避免此前工单缓存内的旧测试被重复收集。

## 缺陷及最小修复

1. **输入框 DOM 已变化。** 真实登录页面使用 `form[data-chatgpt-composer]` 中的 markdown contenteditable，旧适配器报 unknown。增加 form 范围内的 selector，保留旧 selector；回归覆盖可发送、无关/禁用编辑器。修复前测试实际为红，修复后真实页面为 idle/composer-ready。
2. **回复 DOM 已变化。** 真实回复可见，旧代码 assistant count=0。增加 `data-markdown-text-style="assistant-message"`，按稳定 `data-chatgpt-selection-message-id` 容器去重并提取 ID，兼容旧结构及 DOM 顺序。回归覆盖混合结构、多 markdown 块和无容器预览；先红后绿，真实回复最终进入 Kernel reply-observed。
3. **临时 URL 被错误持久化。** B 首次发送期间出现 `/c/local-chatgpt:<uuid>`，旧代码当作 canonical 写入，随后正式 URL 的绑定丢失。适配器维持 provisional，现有 Kernel/Organization continuity 校验拒绝 raw/encoded local ID，Fleet 不将其恢复成历史 URL。测试证明拒绝不消耗首次授权，随后正式 ID 仍正常绑定。4 个相关测试分别实际复现失败，修复后通过。
4. **Native 冒烟与 PR #5 授权流程不符，且会改写源配置。** 旧脚本已实际失败。现在配置临时复制的 Host，按 admin bootstrap + provisional dispatch 验证；退出时等待本次 daemon 停止，再清理经校验的测试路径。增加授权、跨项目和锁正/反例。源配置 sentinel SHA256 前后一致（SOURCE_HOST_CONFIG_PRESERVATION_PASS）；缺失产物失败分支无本次 Kernel 泄漏（MISSING_NATIVE_FAILURE_CLEANUP_PASS）。

未放宽授权、Kernel lease 或 no-auto-retry 约束。架构检查原有 WEB 防线源码断言保留，新增 local ID 防线有语义回归。

## 真实会话及失败保留

| 项目 | 首次结果 | 最终处理 |
| --- | --- | --- |
| A | canonical 已建立；旧回复 selector 导致观察超时 | 未重发；最终适配器恢复后读到唯一回复和原角色。旧 attempt 恢复后为 uncertain，未宣称历史派发闭环通过 |
| B | 回复可观察，Kernel 错误接受 local-chatgpt ID，正式绑定断言失败 | 保留失败记录，在隔离 Kernel 显式 suspend；未自动改写坏绑定或重发 |
| C | 修复后首条消息/正式绑定/唯一回复/派发闭环通过 | 用于最终构建的重启、跨项目、关页和锁验收 |

C 项目：`8cfc08ac-4434-453e-93e9-4745e29e4a9e`，角色 chief_engineer，slot `1704bd15-8dc5-4f44-b139-e58a7f454899`。canonical：`conversation:6ae07fdd-2c84-83ea-899b-48d439983f76`；attempt：`8147b2ca-2a88-4dac-a3fa-8587e9f7b796`；回复 marker：`CH_PCP_003_4ea9af7f4254`。

C 首次流程使用指纹 `2b105071bab7c409`（local ID 已修复）；随后保留 WEB 源码断言写法、增加 Fleet local ID 防线并加载最终指纹，完成恢复和隔离验收。

本地证据位于 `.build-cache/CH-PCP-003/`：`actual-first-conversation-c.log`、`actual-recovery-guards.log`、`native-smoke-final-head.log`、`unit-final-stable.log`、`native-build-final.log` 及各缺陷的 red/green 日志。登录 Profile、数据库、工具下载和本地 CDP 驱动均不提交。

Native DLL SHA256：`68FE2D061E1034B0C79CA3CAE62C4A28DF467AABE1EE64470297FEDD6A848DB5`。

## 收尾及剩余风险

隔离 Chrome、Kernel 和 Native 子进程已退出，随机 Native 注册项已移除，HKCU NativeMessagingHosts 列表及默认值与起始快照一致。原 Runtime PID 5980、普通 Chrome PID 36800 仍在运行；原历史数据库长度 397312、修改时间 2026-10-24T20:34:13.200451+08:00 与起始记录相同（按时间值比较，不依赖小数位格式）。系统 SDK 列表仍为空。未覆盖原 GAM_HOME、Profile、Host 配置或数据库；登录后的测试 Profile 仍保存在忽略目录。

原 lab Chrome PID 31240 起始存在，后续不再存在，退出原因 UNKNOWN；本工单未对该 PID 执行关闭/停止，也不宣称其全程存活。

浏览器驱动第一次用 admin CLI 调用 browser-only 的 fleet.reconcile 被正确拒绝；按协议改为真实扩展 → Native Host 路径后通过，无产品权限放宽。初次数据库元数据字符串比较因小数秒显示位数不同失败，按时间值复核一致。保留失败日志，不改写为无失败运行。

ChatGPT DOM、登录态及服务行为会继续变化；本轮只证明上述版本和当前页面。未覆盖全部模型、流式长回复、附件/工具、网络中断、多 Profile 并发。首次 Cloudflare 阻塞由用户在新 Profile 手动完成后解除，不代表可自动绕过验证。

修复阻止新增坏绑定，不自动重写此前已持久化的 local-chatgpt ID；若现有环境已有此类记录，需另行授权修复。本次只在独立数据库保留 B 的失败证据。没有把 transport/单测扩展为完整 PCP 角色执行或 Codex 调度验收。

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
    reason: workorder omits execution_profile; Tokdash exposes model but not actual effort or selection provenance
  requested_by: user CH-PCP-003
  resolved_by: Codex desktop runtime
  actor: Codex
```

Tokdash session `01a17c6a-87b5-7641-8c5e-e7d170079b63` 同时包含 CH-PCP-001/002/003，标记 project-history-shared-session，不把整段会话用量归为本工单独占。

参考：[微软隔离安装说明](https://learn.microsoft.com/en-us/dotnet/core/tools/dotnet-install-script)、[Chrome Native Messaging 注册规则](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)。
