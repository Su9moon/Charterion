# PR20 Windows candidate — BLOCKED / diagnostic package prepared

业务二进制唯一来源：`0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a`。本工具包是独立交付，不改变候选业务版本；桥接器提交工具后产生的新 SHA 不得冒充候选源码 SHA。当前仓库 HEAD 只读核对为上述 SHA，未改生产 TS。没有安装、切换、重启、发送消息、创建 Profile/Project/Slot，也没有改注册表、数据库、任务店或用户配置。

## Windows 操作员单命令

将交付目录放在候选 worktree **之外**（保持已验证 worktree 干净）。在 Windows PowerShell 中运行；有不同现场路径时只改参数，不要先安装任何东西：

```powershell
powershell.exe -NoProfile -NonInteractive -File 'F:\0 codex\PR20-candidate-tools\preflight.ps1' -TrialRoot 'F:\0 codex\Hive-PCP-Dev-Trial-001' -CandidateRoot 'F:\0 codex\Hive-V06-PR20-Final'
```

只向 stdout 输出 JSON，退出码 **2 = BLOCKED**。本脚本刻意不产生“可安装”自动结论；任何读取异常仅输出脱敏阻塞，不把异常原文或原始配置写出。不会读取 token/cookie 值、Chrome Profile 内容，不打开 SQLite、不调用 RPC、不执行候选二进制、不写报告文件、不结束进程。Git 仅 rev-parse/status；脚本使用 `git --no-optional-locks` 禁用可选索引刷新。普通权限无法读取 CIM/注册表时阻塞，不能提升权限伪造通过。

## 审查证据与风险

- `scripts/pcp-trial.mjs:168` install 拒绝已有 root，身份由 data 绝对路径导出，生成独立 host/pipe；复制 dist、改写 background host，生成 NativeHost 配置、release 哈希、CMD 后最后注册。严禁重跑 install 或旧 NativeHost/runtime installer。
- `configAt/verify` 检查 root/source、release 文件、注册路径、Node 哈希；`ownedProcess` 使用 PID、创建时间、完整命令和 executable 防止误杀。doctor 不足以证明版本/加载路径/绑定全部一致。本包不运行 start、stop、chrome-dev 或 doctor。
- `scripts/package-release.mjs` 是扩展 ZIP，会删除 release 输出目录；`package-runtime.mjs` 打包 dist/dist-control/EXE/安装入口，但没有 trial 绑定身份、完整安装清单或原位事务。二者不能直接充当升级器。
- `native-host/GamNativeHost/Program.cs` 从 EXE 同目录加载 `gam-native-host.json`，校验 allowedOrigin，经 browserTokenPath 和 pipe 转发 instanceId。必须保持旧 host、pipe、data、token 路径、extension ID；不能只替换 EXE。
- `scripts/fingerprint.mjs` 仅覆盖 src TS/HTML/CSS、manifest 和 package；dist 元数据覆盖五个扩展文件，**不证明控制层/EXE来源**。需另核 Windows 构建日志、完整文件清单和产物来源。trial 的 host 替换会使原始 background 哈希失效，必须分别记录改写前后及唯一替换证明，不能改写原 build-meta 来冒充原始构建。
- `control/src/config.ts` data 为 GAM_HOME/global.db，身份/pipe 由 home 导出；不能改变路径。`database.ts` 构造会建目录、WAL、自动 migrate，当前迁移 1..30，无降级事务。backupTo 会 checkpoint/VACUUM INTO，且打开备份也会 migrate，**不是只读预检工具**。禁止用候选 ControlDatabase 打开 live DB 试探兼容性。
- 历史 trial 结构参见 `docs/pcp/reviews/CH-PCP-006-INTEGRATED-TRIAL-2026-10-27.md`；历史补丁包已出现混合源码，故必须验证现场 release 和所有哈希。记忆旧 SHA `d2e8d1bf2d6cc9f20d9076e3cdb380fae6fc6e43`、根路径仅是定位线索，不作为断言。

## 当前阻塞

WSL 无 Windows NativeHost admin、现场 Registry/CIM/Chrome/data，且无 PowerShell，未执行 Windows 脚本。未获得完整候选控制层/EXE来源清单、不可变 trial-bound 包、当前 schema/可恢复备份和迁移演练。脚本检查候选原始文件及哈希，但不会声称已构建不可变版本或验证全部来源。live DB/WAL 哈希只是瞬时观察，不能证明一致备份或 SQLite 健康。

预检将 Project/Fleet、Chrome 实际加载路径、schema/备份判为 BLOCKED 并要求人工只读证据。现场 UI 不可访问或身份映射不清时继续 BLOCKED，不用缓存/历史数字填空。最小可靠方案是先补齐这些证据，再单独授权维护窗口和编写已审核的宿主事务工具；本单不交付带猜测的自动破坏脚本。

用户提供的 Windows `F:\0 codex\Hive-V06-PR20-Final\verify.log`：npm ci=0、verify=0、98 files/541 tests、34 fault、dist `9c2e266d39c80e3b`、控制层及 extension build PASS，属于用户既有证据，本机未复跑，也不是本包 Windows E2E DONE。PR #20 draft 为用户提供状态，未联网或修改 PR。证据发布/提交只由 bridge 处理。
