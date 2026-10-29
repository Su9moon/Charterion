# Hive 产品更名迁移基线

状态：用户批准全面更名（2026-10-29）。候选分支为 `feature/hive-rename-20261029`，**本文件不是完成验收证明**。

## 命名决定

- **正式产品名：Hive**。旧产品名 **Charterion** 不再用于新的产品 UI、安装包和对外展示。
- GitHub 目标仓：`Su9moon/Hive`（当前物理仓库仍为 `Su9moon/Charterion`，必须经仓库管理员重命名并验收）。
- 新的默认本地源码/安装目录可采用 `F:\0 codex\Hive-PCP` 和 `F:\0 codex\Hive-PCP-Trial-006`，但这两个路径**不是已执行迁移的事实**。具体位置必须在现场审计、备份与验证后落地。
- CLI、Native Messaging host、Chrome 扩展 key、SQLite schema、跨仓库固定版本 SHA 和已经签发的能力标识属于兼容敏感项目。界面可先改品牌名称，这些内部标识必须通过显式兼容/迁移流程才能换，绝不全局替换。
- CB 项目 Registry 当前使用 `charterion` ID；GitHub 改名不会自动修改 Registry。未来以 `hive` 为新项目名称，由受信管理入口迁移，旧 ID 只作兼容。禁止 Codex 沙箱直接编辑运行中 Registry。
- 保留原始上游仓库、许可证及历史证据中的 `Charterion`，不能篡改来源、Git 历史和哈希。

## 分阶段交付

1. **清单与基线**：核验 Git HEAD/分支/脏工作区、PR、Dev 安装路径/锁、Native Host、Chrome Extension ID、Kernel/DB；记录可回滚备份。
2. **源码重命名（本候选分支）**：manifest 和 dashboard/sidepanel 显示、文档/README、package 名及构建产物名称，在不破坏现有资源与旧格式兼容的前提下逐步修改。旧键名仍存在的地方加 legacy 说明和兼容测试。
3. **候选构建和隔离验证**：编译、TypeScript、Chrome Dev 插件安装、点击图标显示 Hive、雷达、侧栏、Native Messaging、持久 ProjectCell/AgentSlot、任务派发、故障恢复、版本及回滚。Stable Chrome 不动。
4. **本地迁移**：核实目录不存在冲突，将旧运行实例停机保全、备份，按可审计步骤安装 Hive 并校验 Native Host/快捷方式/注册表/日志/旧数据。保留可还原的原目录，直到人工验收通过。
5. **GitHub 仓库管理员改名**：候选验证后将 `Su9moon/Charterion` 改为 `Su9moon/Hive`，核验原有 PR/Issue/分支/Release/权限/重定向，更新所有可编辑的本地 origin、PCP/CB 引用、CI、文档；保留历史不变。管理权限不等于当前连接具备 rename 动作。
6. **最终验收**：Git、新安装目录、Chrome Dev 扩展名/按钮、雷达与侧栏、Native Host、管理命令、项目及角色数据、CB 对接均通过后，才宣称 `HIVE_RENAME_COMPLETE`。

## 禁止操作

- 不因改名重置 Git、合并未通过测试的 Draft PR、重写 Git 历史。
- 不更改 Chrome Stable、Blue、现有 Green 服务/Worker、其他项目。
- 不直接替换已安装的 Chrome extension key 或 Native Host ID，导致旧 profile 失去数据/注册关系。
- 不把产品显示更名与 MCP/CB 联合验收混成同一条 PASS。

## 记录规范

每个迁移步骤记录旧/新路径、受检 SHA、是否已经真正改名、验证结果、回滚入口和仍待操作事项。GitHub PR 改名不等于仓库实际改名；源码变更不等于 Dev 已安装版本更新。
