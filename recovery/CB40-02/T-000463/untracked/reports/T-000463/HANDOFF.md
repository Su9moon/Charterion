# T-000463 源码候选交接 / Source candidate handoff

交付物：`candidate.patch`、`manifest.json`、`SHA256SUMS`、`logs/`、`provenance/`、`windows-receipt.json`。精确 parent 为 PR #13 `0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659`。注册仓库实际 HEAD 为 `94552b547aecf6a6c1f96bf7beeb6457a0c09293`，不是 PR13；本仓库只增加交接材料，业务源码位于本工单 `.build-cache/T-000463-source`，不覆盖旧根源码。最终由 host 在 PR13 隔离源码上应用补丁；bridge 对本工单产生的提交只能代表交接包，不能冒称 PR13 后继源码提交。

## 追溯

只读历史来源：同登记项目的 `T-000459-workspace/reports/T-000459/`。其 SHA256SUMS 全部校验通过；原补丁 SHA256 `2b6ce3618dd929fdc6c83bc36da85d1f6f069ab25b7c4c0edb1a274a0d7346e3`。327 个留存基线文件逐一匹配 `pr13-tree.json` 的 Git blob SHA；原补丁再次回放，29 个文件逐一匹配旧清单。最终补丁回放 50 个变更路径全部匹配新 SHA256。清单逐文件记录旧 blob、新 hash、来源；补丁删除八种根 README 并将其原候选内容归档，未翻译或重写历史文本。

保留 Group/Radar/V30 安全绑定实现，重建用户提供的 Windows 修复：门面 import、完整 V30 方法移到 V29 后、冲突/历史不可用/授权过期重新打开/错误/无快照/版本 30 六项断言更新。auth/offline/conflict/failure 行为断言保留。仅 en/zh-CN 活跃；导航、翻译状态、词汇表、品牌检查和根 README 版本扫描收敛到两种，新增活跃语言测试。人工复核中文 overview/status 与英文语义后更新中文 digest，严格 release 检查通过，没有忽略 stale。

`windows-receipt.json` 索引用户提供的有效外部证据：旧补丁加 Windows 修复后 targeted 29/29、verify 516/516、faults 34/34、构建和 named-pipe 4/4 通过。没有提供原始 Windows 日志或最终源码 hash；不能当作本次新双语候选完整通过。原有兼容标识、Native Host ID、扩展 key、数据库历史均保留。

## 本次测试与状态

Node Linux 22.23.4 / npm 10.9.9；复用登记项目已有 node_modules，未安装新依赖或更改锁文件依赖。详见 `checks.json` 与 logs。

- task execution：源码恢复、修复、双语收敛及补丁交接已形成；整体结果因完整 verify 环境失败返回 success=false。
- business acceptance：源码可审查、可回放；本候选尚未得到完整 host 源码验证。环境失败不是 CB 传输错误。
- tests：完整 verify 静态部分通过，套件 497/517 通过；20 项监听 EPERM（IPC 4，RadarControl 10，RadarHttp 6），未 mock/修改/跳过并宣称通过。完整 verify 失败后单独运行构建和 faults；排除上述三个监听相关文件的可执行子集为 488/488，通过不代表被排除项目通过。Windows 旧候选凭证单列。
- result package：精确 parent patch + 文件清单 + 校验和 + 证据已提供。
- git commit/PR：本代理未 add/commit/switch/checkout/push/创建 PR；仅 CB host 可提交发布。PR13/main 未改动。
- Windows deploy/registration：未执行；不属于本次源码必要测试。下一任务仍需用户在 Windows 侧执行已审查流程；不得直接将新版安装到现有 Hive。

## Windows 最后步骤：独立源码验证

只在已有的、干净的 PR13 隔离源码副本上应用；不要再对旧 T459 已打补丁的临时目录叠加。先传送整个交接包并核对 SHA256SUMS。以下仅源码操作：

```powershell
$ErrorActionPreference = 'Stop'
$Source = Read-Host '干净 PR13 隔离源码绝对路径'
$Package = Read-Host 'T-000463 交接包绝对路径'
$Patch = Join-Path $Package 'candidate.patch'
$Manifest = Get-Content -Raw (Join-Path $Package 'manifest.json') | ConvertFrom-Json
if ((Get-FileHash $Patch -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Manifest.patch_sha256) { throw 'Patch hash mismatch' }
if ((git -C $Source rev-parse HEAD).Trim() -ne $Manifest.parent) { throw 'Wrong parent' }
if (git -C $Source status --porcelain) { throw 'Use a clean isolated source copy' }
git -C $Source apply --check -- $Patch
if ($LASTEXITCODE) { throw 'Patch check failed' }
git -C $Source apply -- $Patch
if ($LASTEXITCODE) { throw 'Patch apply failed' }
foreach ($f in $Manifest.files) {
  $p = Join-Path $Source $f.path
  if ($null -eq $f.new_sha256) { if (Test-Path $p) { throw "Unexpected file $p" }; continue }
  if ((Get-FileHash $p -Algorithm SHA256).Hash.ToLowerInvariant() -ne $f.new_sha256) { throw "File hash mismatch $p" }
}
Set-Location $Source
node --version
npm --version
npm ci
if ($LASTEXITCODE) { throw 'npm ci failed' }
npm run verify
if ($LASTEXITCODE) { throw 'verify failed' }
npm run check:readme-i18n:release
if ($LASTEXITCODE) { throw 'locale release check failed' }
# 保存 Windows 日志、补丁 hash、最终 517 项测试与构建结果；不安装/启动运行时。
```

## 仅供 CB host 的 Draft PR 发布命令（本代理未执行）

先完成上面新候选验证，review patch/manifest；仅对该隔离源码副本操作。检查 PR13 仍固定同一 HEAD，若漂移则停止评审，不强推/覆盖。以下 host 命令不得用于注册旧根或用户工作树：

```powershell
$Pr13 = gh pr view 13 --repo Su9moon/Charterion --json headRefName,headRefOid | ConvertFrom-Json
if ($LASTEXITCODE -or $Pr13.headRefOid -ne '0f3957deb25cb2aa2a8b198e2d4b5f0ec1265659') { throw 'PR13 moved; review required' }
# 当前目录必须是上述已验证的隔离源码 $Source
if ((git rev-parse --show-toplevel).Trim().Replace('/', '\') -ne $Source.TrimEnd('\')) { throw 'Wrong source root' }
git switch -c handoff/t000463-hive-v051
if ($LASTEXITCODE) { throw 'Branch creation failed' }
git diff --check
if ($LASTEXITCODE) { throw 'Whitespace check failed' }
git add --all
if ($LASTEXITCODE) { throw 'Stage failed' }
git commit -m 'Complete Hive 0.5.1 group Radar candidate and en/zh-CN scope'
if ($LASTEXITCODE) { throw 'Commit failed' }
git push -u origin handoff/t000463-hive-v051
if ($LASTEXITCODE) { throw 'Push failed' }
# 将本交接包、最终 Windows 日志与 commit SHA 附入 host 编写的正文文件
$Body = Join-Path $Package 'PR-BODY.md'
# 发布前补充本候选实际 Windows 日志与最终源码 commit SHA，并审查正文
gh pr create --repo Su9moon/Charterion --draft --base $Pr13.headRefName --head handoff/t000463-hive-v051 --title 'Hive 0.5.1 source candidate: group Radar and en/zh-CN' --body-file $Body
if ($LASTEXITCODE) { throw 'Draft PR failed' }
```

## 下一任务的 Windows 运行阶段

使用已有 `PCP-Control.cmd`，仅先做只读盘点；下列不是升级命令：

```powershell
$Install = 'F:\0 codex\Hive-PCP-Dev-Trial-001'
$Ctl = Join-Path $Install 'PCP-Control.cmd'
Get-Item -LiteralPath $Ctl
Get-Content -LiteralPath (Join-Path $Install 'trial.json')
& $Ctl health
if ($LASTEXITCODE) { throw 'Installed Kernel unavailable' }
& $Ctl project.list --admin
if ($LASTEXITCODE) { throw 'Project read failed' }
& $Ctl agent.list --admin
if ($LASTEXITCODE) { throw 'Agent read failed' }
```

没有审查通过的 in-place 更新命令，故不提供替换文件/重新安装指令。现有安装、Chrome Dev Default、CB Blue/Green、原 Trial 均未触碰。后续 host packaging/native validation、授权升级与真实浏览器验收属于独立阶段。

升级后真实 Windows RPC 必须读回 1 个 rootless `CB×Hive` group、2 个独立真实项目；chief_engineer 为 group 元数据，不增加第三个 ProjectCell。会话固定：

- group chief_engineer：`conversation:6ae23bab-209c-83ea-b5d0-0bf543e64500`
- Hive developer：`conversation:6ae37f99-31e4-83ea-9c50-10f89657dfbe`
- CB developer：`conversation:6ae37fdf-f4ac-83ea-9630-e7ad0159b595`

每个 ProjectCell 默认一个 developer；未来 `+Developer` 须另行用户授权。由真实 host RPC 返回 project/slot IDs，不虚构、不重绑冲突已有记录。用已有包装器的 `project-group.get` / `control.snapshot` 读回并在 Kernel 重启后再次核对；管理命令参数和完整注册流程见补丁内原 `docs/T-000459-CLOSEOUT.md`，仅在下一任务重新审查实际 host 身份、源码 pin 与现有绑定后执行。此次没有创建、绑定、派发任何会话。
