# PCP × Charterion｜Windows 部署、切换与回滚执行规范 V0.1

- **状态**：DESIGN FIXED / DEPLOYMENT NOT_RUN（本规范是实施与部署计划，不表示已重装或升级本机）
- **日期**：2026-10-27
- **适用范围**：Windows + 原生 Chrome（MV3 Extension）+ Charterion Native Messaging Host + Node Kernel；当前仅限已授权的隔离测试环境。
- **依据**：本 fork `docs/DEPLOYMENT.md`、`scripts/setup-windows.ps1`、`scripts/install-runtime-windows.ps1`、`native-host/scripts/install.ps1`、`control/src/config.ts`，及本目录目标架构。

## 1. 部署决策

1. **先代码、后部署**：在独立工作树开发，纯构建/单测不用触碰正在测试的 Native Host、注册表或已登录 Chrome。
2. **单活 Host 基线**：首次 E2E 只保留专用 Chrome + 一个 Native Host 注册入口 + 一个 Kernel；普通 Chrome 中的 Charterion 扩展保持关闭。当前不声称“多 Chrome 争用”根因已经排他性确认。
3. **禁止假隔离**：`GAM_HOME` 分离不同 SQLite/pipe/token，但相同 Windows 用户的 Native Messaging Host 注册键 `com.charterion.control` 属于同一 HKCU 配置；两次 install 可能后装覆盖先装，不得当作真正 Blue/Green 并行。
4. **双实例验收路径**：优先使用独立 Windows 用户/VM（各自 HKCU）完成并行回归；如要求同 Windows 账户并行，先开发并验收不同 host name/extension origin/注册表/pipe/identity 的显式命名空间方案，之后才能双运行时安装。
5. **受控绑定**：`RoleBinding` 保留不代表 Chrome 永远打开，测试 `pinned_tab` 不得被原版 `minSlots=0` 计时器自动回收。升级脚本不可静默修改角色绑定。
6. **无无据交付**：本地检测、Playwright/DOM 测试、真实浏览器 E2E 三种证据分别记录；GitHub Actions 额度不是本地验收的必要前提。

## 2. 当前机器的既有资源（保护清单）

| 对象 | 当前已知值 | 操作要求 |
| --- | --- | --- |
| 现有 Git 工作目录 | `E:\0 codex\PCP项目\webgpt-lab\Charterion` | 不重置 main、不覆盖用户未提交的工作 |
| Runtime / `GAM_HOME` | `%LOCALAPPDATA%\PCP-WebGPT-Lab\Charterion` | **不得删除/重置**；运行数据和令牌独立保护 |
| Kernel CLI（当前已使用） | `E:\0 codex\PCP项目\webgpt-lab\Charterion\runtime\dist-control\gamctl.cjs` | 先验证路径存在；不可假设工作树的新包已经投入运行 |
| 专用 Chrome profile | `%LOCALAPPDATA%\PCP-WebGPT-Lab\Charterion\chrome-profile` | 用户自行登录；**不复制 Cookie/登录密钥到 Git 或其他 Profile** |
| 测试项目 | `Charterion-Official-E2E` / `2aaa4e8e-df72-437d-928d-57126697ea13` | 保留 |
| 测试 Slot | `E2E-Worker` / `a65940ce-0545-46d4-b1f7-47dde02f3a7b` | 最后观察 `suspended/absent`，不视为永久当前状态 |
| 其他历史会话/Slot | 旧项目、暂停 Supervisor/Chief Engineer、旧 test 会话 | 无权自动清理、迁移、重新绑定 |
| Chrome Native Host 注册键 | `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.charterion.control` | 注册表**当前值需只读核对**后方可触碰 |
| Edge Native Host 注册键 | `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.charterion.control` | 同上，不影响普通 Edge |

这些是**上次实验记录**，执行部署前必须读取新的现场事实，不能按旧 Tab ID、PID、Lease ID 精确操作。

## 3. 各类目录、权限与隔离设计

```text
E:\0 codex\PCP项目\webgpt-lab\Charterion\          # 现有 fork checkout，不在这里盲目构建覆盖
<new isolated worktree path>\                        # 开发/测试源码；不自动注册 Native Host
%LOCALAPPDATA%\PCP-WebGPT-Lab\Charterion\            # 当前单活 E2E runtime，原样保留
   ├─ global.db (+ SQLite WAL/SHM 如存在)           # Kernel 运行/控制事实
   ├─ runtime.json                                 # 本实例元信息
   ├─ native-host\                                # 安装的 EXE / host manifest / config
   ├─ chrome-profile\                             # 专用 Chrome 会话
   ├─ admin.token / browser.token                  # 只在用户主机保存，不展示、不上传
   └─ GAM.cmd / GAMCTL.cmd                         # 安装脚本生成的 wrapper（按实际存在核对）
<protected backup location>\                       # 受限访问、版本化备份，不放 Git
<local evidence location>\                         # 去敏日志、命令输出/测试回执；无 token/cookie
```

***不要***复制正在运行中的 SQLite 主数据库来声称一致性备份。进入维护窗口后停止**已确认归属的** Kernel，使用 SQLite 正确备份机制或在停止进程及确认 WAL 状态后一并保护数据库文件；必须验证可恢复性。保存 Host manifest/注册键**路径和值的摘要**、启动脚本/Runtime 版本、当前 Git SHA 和必要数据。不备份/发布 Chrome 个人登录凭据到仓库；涉及 Profile 的机器级受限备份必须经单独授权并遵守适用安全规则。

## 4. 实施工序：从独立工作树到 E2E

### Lane A — Source-only（立即可做，无宿主状态变更）

在现有仓库**只读**检查 `git status`、分支和 SHA；新建独立工作树进入本设计分支（切不可重用正在运行的 `dist`）。示例（路径需按实际机器选取）：

```powershell
git -C "E:\0 codex\PCP项目\webgpt-lab\Charterion" fetch origin pcp/role-session-enhancement-v0.1
git -C "E:\0 codex\PCP项目\webgpt-lab\Charterion" worktree add --detach "E:\0 codex\PCP项目\webgpt-lab\Charterion-PCP-work" origin/pcp/role-session-enhancement-v0.1
Set-Location "E:\0 codex\PCP项目\webgpt-lab\Charterion-PCP-work"
npm ci
npm run check
npm run check:control
npm test
npm run build
npm run build:control
```

注：这里只是**计划命令**，未在用户 Windows 上执行。Node 22+；Native Host 源码构建还需 .NET 9；按每项变更选择 `npm run test:faults`、`npm run verify`、`npm run verify:full`。测试应在**实际目标平台本地运行**并记录结果，不能虚报。提交单独 feature commit/PR；不直接覆盖原版的 Draft PR #1/#2。

### Lane B — 单活集成测试（需要真实操作、证据、可回滚维护窗口）

A 通过并且有可审查的确切构建 SHA 后：

1. **Preflight 只读**：确认专用 Chrome PID/配置、扩展 ID/目录、Host 注册值和 manifest 指向、Kernel PID/pipe、当前 `GAM_HOME`、进程 owner、`agent.list` / `browser.status` / 最新事件。
2. 核实实际 `runtime/dist` 与源码构建文件的 SHA；禁止只改源码却声称浏览器已加载新版本。
3. 受控暂停工作、保存待执行记录和变更前快照；关闭指定测试浏览器与 Kernel **前核对确切归属**，不批量结束 `chrome.exe`、`node.exe`。
4. 生成**一致且可恢复**的受限备份及一份去敏的变更清单；保留历史 AgentSlot/绑定和数据库。
5. 仅对确认归属的单活实例应用候选扩展/Host/Kernel；若迁移 schema，要求明确版本及向前/向后兼容策略，不使用临时 SQL 改动线上状态。
6. 启动此一套实例，核对 Native Host registry、instanceId/pipe、extension build hash、storage/schema 版本；验证真实 `role → conversation → tab` 投影。
7. 跑本目录 P0/P1 E2E，观察超空闲阈值、后台页/关闭恢复以及错误页拒发；所有提交都是明确授权的一条无害测试消息。
8. 记录 `buildSha`、`gitSha`、`runtimeId`、测试事件号/回执、`PASS/FAIL/NOT_RUN`；满足 Gate 方可进入下一阶段。

**禁止直接调用** `setup-windows.ps1` / `install-runtime-windows.ps1 -NoStart` 来假装“只是构建、不影响旧环境”：这些脚本即使 `-NoStart` 也会写入 Host manifest/当前用户注册表。计划中的安装动作必须在快照/维护窗口/恢复预案之后单独批准和执行。

### Lane C — 双实例 / E2E 扩展（P1 以后）

独立 VM/Windows 用户优先，或完成 host 命名空间隔离后再同用户并装；为每一实例分配不同 `GAM_HOME`、Chrome Profile、SQLite/token、Kernel ID/pipe、Host manifest 注册项和可验证的扩展来源。未达到完整身份隔离前，第二个实例不得同时向 `gam-default` 上报。

分两步：先在专用单实例验证正常投递与回复；再故意启用第二个受控实例，证明它**只能**观察/控制自己拥有的 Slot，或明确拒绝，不再交替释放同一租约。

## 5. 只读预检命令参考（需在 Windows PowerShell 运行）

```powershell
$env:GAM_HOME = Join-Path $env:LOCALAPPDATA "PCP-WebGPT-Lab\Charterion"
$ctl = "E:\0 codex\PCP项目\webgpt-lab\Charterion\runtime\dist-control\gamctl.cjs"
Test-Path $ctl
Test-Path (Join-Path $env:GAM_HOME 'runtime.json')
if (Test-Path (Join-Path $env:GAM_HOME 'runtime.json')) {
  Get-Content (Join-Path $env:GAM_HOME 'runtime.json') | ConvertFrom-Json |
    Select-Object gamHome,instanceId,pipeName,extensionId
}
foreach ($p in @(
 "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.charterion.control",
 "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.charterion.control")) {
  if (Test-Path $p) { Get-Item $p | Select-Object Name,Property }
}
if (Test-Path $ctl) {
  (node $ctl agent.list --admin | ConvertFrom-Json).result |
    Select-Object id,role,desiredState,browserState,browserTabId
  (node $ctl browser.status --admin | ConvertFrom-Json).result |
    Select-Object profileId,authStatus,pageHealth,openTabs,observedAt
}
```

以上输出只能用于本机排查，**不能把令牌、完整路径中的敏感个人数据、Chrome Profile 内容或凭据直接提交至 GitHub**。如果运行态的 `browser.status` 或 AgentList 不可达，直接标为不可用，不推断空闲即安全。

## 6. 回滚策略与失败闸门

**回滚的可回退单元**：代码 SHA + 扩展构建包 hash + Native Host 版本/manifest/注册路径 + Kernel 包 + **一致的** SQLite 状态与版本。回滚时需考虑变更期间新产生的工作事件，不能无条件恢复旧 DB 使正式执行记录丢失；先冻结新操作并进行事件对账，必要时只回滚兼容的代码并按迁移脚本修复数据。

回滚触发（任一项）：
- 旧 RoleBinding 被无授权改变、丢失或被错误 Conversation 接管；
- Chrome 多实例发生互相夺取/释放另一实例租约；
- 存在错误会话物理发送、重复真实 CB 派工、来源无法证明；
- Native Host 指错 Kernel/实例，或迁移/恢复无法验证一致性；
- 目标页面 `unknown` 仍错误地被标为可发送、或失败后系统静默自称成功。

回退步骤：
1. 停止新消息派发及受控测试任务，保留审计、事件和 Error/uncertain。
2. 识别 exact PID + instanceId、由维护窗口受控停进程。
3. 恢复已核验版本的扩展/Kernel/Host 安装引用；**不能将新数据丢弃后直接回滚数据库**，先决定兼容迁移或受控恢复。
4. 重新读取角色绑定、工单引用、Native Host 注册值及目标浏览器观测状态，并证明恢复原有工作链。
5. 形成带时间戳的失败/恢复回执，保持旧 Slot/历史会话不清理。

## 7. 运行观察与证据规范

每次 E2E 观察至少记录：时间（含时区）、源码 SHA、runtime/build hash、`GAM_HOME` 的**代号**而不是敏感路径、`instanceId`、`profileId`、目标 role/binding revision、canonical conversation ID（必要时可去敏）、短期 `tabId`、leaseEpoch、最新事件 seq、attempt_id、真实是否发送、是否观察到新回复、正式 result_ref/Review 是否存在。

证据目录按 `evidence/<date>/<test-id>/` 或工程记录保存，**不要**提交 Chrome 用户数据、令牌、Cookie、全量会话文本。将 `pageHealth=ready`（浏览器汇总）与**目标页面 `status=idle`**严格区分，避免原有误判。

首个上线候选 Gate：`P0+P1` 的各项真实浏览器测试通过、无错误投递/未经授权解绑、可逆变更证据齐全。完整 PCP 首阶段交付 Gate：还需 P2 三 WebGPT 实测，不能因 `npm run verify` 全绿就宣布产品可用。

## 8. 实际尚未执行的事项

- 未动本机旧 `GAM_HOME`、Chrome Profile、Native Host 注册表和 Kernel；未关闭任何进程。
- 未执行 A/B/C 的 Windows 命令；单活升级/回滚是否可用未验证。
- 未确认旧环境是否存在 WAL、正在运行的 Host PID、当前 extension active SHA。
- 未验证 Host 命名空间方案、跨实例拒绝和迁移恢复：状态 `NOT_RUN`。

该执行规范意在支持下一步真实实施，而不是取代 `docs/DEPLOYMENT.md` 的原版安装说明，也不是授权任何未确认的本机破坏性操作。
