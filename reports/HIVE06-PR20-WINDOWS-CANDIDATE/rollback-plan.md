# 原位候选安装与逐步回滚执行指南（未授权、未执行）

**本单只能诊断。以下是维护窗口执行手册，不是可直接执行的安装脚本。** 必须用户明确授权备份、暂停派单、停止受控 Kernel、改必要路径、手动扩展路径切换/重载、恢复及失败回滚；授权前保持 BLOCKED。无安全原位事务工具，任何未知条件都停止，不使用 install 补救。不要执行 ChromeDev 启动器、创建第二套实例/host/pipe/Profile。PCP FIXED、CB Blue/Green、PR21 Role Charter 均不在本手册修改范围。

## 0. 只读证据门

运行 preflight，逐项处理 BLOCKED：

1. 在既有控制面板只读观察当前 health/instanceId、Fleet/registered Project。记录精确 Group、2 Project、2 Developer、3 Conversation 的 ID、关系、Slot、lease owner Tab、epoch、Attempt ID/state/更新时间和 snapshot revision；名称包含 `1group2projects2developer3conv` 的注册目标必须与操作员确认一致，不以数字凑数。核对没有待确认的投递或正在发送；不调用 fleet.reconcile、bootstrap、绑定或发送。无法读到即阻塞。
2. 在现有 Chrome Dev 打开 chrome://version，核对 Profile Path 的 Default 与现有用户数据目录；不得用新 Profile。chrome://extensions 核对同一个 key 导出 ID，详情/检查 service worker 的实际文件源目录确实为 trial 当前 versions/<现场 SHA>；仅看到 ID/版本号不充分。只查看，不点 reload/update/remove。若界面不能确认路径，需既有允许的只读诊断证据；不要擅读 Profile 的凭据或用新调试实例。
3. 将 trial.json、release.json、processes.json、所有 PCP CMD 的哈希、HKCU 默认值与其 manifest/config、Node EXE 哈希纳入受限本地维护记录。配置含路径但任何 token 文件、Cookie、消息正文不进入 Git。确认当前所有文件与 release.files 相符（包含已声明补丁），找出所有指向旧 SHA 的启动入口。不要把 sourceSha 单字段当实际来源。
4. 独立审核 Windows 构建记录和产物。候选 git HEAD 必须精确 0afa065，工作区干净。原始 dist 验证完整 sourceFingerprint 与五文件哈希；控制层和 NativeHost EXE 需可追溯构建命令/工具版本/完整 SHA256。不能用新工具提交 SHA 替换业务源标签，也不能拿短 dist 指纹证明 EXE。
5. 通过已存在且确认无写入的宿主只读数据库诊断获取 schema_meta/schema_version、SQLite quick_check/foreign_key_check、WAL 状态；禁止用 ControlDatabase 构造器或候选 Kernel 获取。若只读 WAL 打开可能创建 SHM、工具行为未知，则不打开 live DB，留待授权备份后对副本检查。旧源码/旧 schema 的兼容证据缺失即 BLOCKED。

## 1. 授权后准备不可变版本（尚未实施）

仅在已有 trial root 下准备新的 `versions/0afa0654799e18d1d0b5c3b8c8fb1cdd03c5187a`，目标已存在则停止、审核，绝不覆盖。可以先在该版本的独占临时目录完整准备、审核后同卷改名封存；不新建 trial root/data/Profile。

复用 install 的**文件格式**，不调用 install：从已验证候选复制 dist/dist-control、manifest、同源 pcp-trial.mjs、完整 NativeHost 产物。NativeHost 子目录名称仍为 native-host。保留 manifest.key 原字节及 ID；记录原始 background SHA256、protocol originalHost，将 background 中确切 originalHost 替换为**当前旧 host**。必须验证替换次数和除此之外无字节差异，记录新 SHA256；不任意全文替换不相关字符串。原 build-meta 作为原始来源证据保留，另外记录安装变换，不能宣称转换后仍通过原始 dist hash 检查。

生成 NativeHost `gam-native-host.json`，逐字段等于现场旧 pipeName、instanceId、browserTokenPath、allowedOrigin；host registration JSON 的 name/allowed_origins 保持不变，path 只指向新版本 EXE。生成 `release.json` 的 sourceSha/instanceId/host/extensionId/originalHost/sourceBackgroundSha256/files，兼容 verify()；files 覆盖目录每一个实际文件（release 自身除外），拒绝链接/越界路径。另生成完整 SHA256 外部清单，包含 release 本身，并检查实际文件集无多余/缺失。对比完整原始清单与安装清单。封存后不再修改新目录，不覆盖旧目录。身份或完整文件校验任一不符即停止。

## 2. 授权维护窗口与备份

1. 用户保存编辑中的消息并确认可以重载；尚在编辑时不能强制 reload/refresh。记录维护起点的只读 snapshot、绑定/leases/Attempt 清单和暂停前派单状态。使用经审核的现有宿主暂停机制暂停派单并等待 in-flight 明确终态；没有确认机制就停止，不猜 RPC 名称。暂停不是创建/重绑 Slot。
2. 通过宿主已支持且已审核的备份入口执行一致 SQLite 备份（backupTo 需要授权 root、会 checkpoint），在受限本地目录保留时间戳备份及校验。不能对运行的 WAL DB 只 Copy global.db。还需备份所有会变动的安装元数据/CMD、HKCU 原默认值和 manifest，保留原目录。token 只在受限备份需要时保持原文件，不打印/提交。
3. 对备份副本的副本演练 schema 迁移至 30、健康/外键检查和绑定/Attempt 不变。不要在唯一回滚备份上调用会迁移的 ControlDatabase。旧 Kernel 是否可读新 schema 未证实则按**不能降级读取**处理；必须恢复升级前备份。未演练恢复、备份不可读或 schema 高于候选支持值即停止。
4. 用 PID+CreationDate+ExecutablePath+CommandLine 四项重新验证受控 Kernel 归属，经宿主入口只停止此 Kernel并确认退出/pipe释放。不直接 Stop-Process 猜 PID；旧 stop 可能关闭 legacy trial browser，不能盲用。Chrome Dev Default 保持现有实例，不关闭用户浏览器。备份与实际切换间必须无新写入，否则重新做一致备份并建立最终恢复点。

## 3. 经审核事务切换

停止受控 Kernel后，持久化逐步 journal（受限本地、无凭据）。只将必要的 trial.json sourceSha、PCP 启动 CMD 的版本路径、HKCU 同一个 host 的默认 manifest 路径切换到封存新目录；root/instanceId/host/extensionId/node/data 不变，安装时间等无关字段不改。更新所有经现场确认的入口，防止旧 Kernel 被旧启动器拉起。每步读回核验，部分成功即进入回滚。未知入口/NativeHost仍占用且无法安全处理即停止，不能扩大到杀浏览器。

Chrome 无通用安全自动“改变 unpacked path”事务。必须先证明现有 Chrome Dev 对**同 ID**路径替换的可逆人工方法能够保留 extension storage/绑定；若必须 remove/reinstall 或无法保留状态，则 BLOCKED，先另行验证方案，不能拿用户真实绑定试验。仅在用户已保存编辑并确认维护窗口后，按该审核方法指向新版本 manifest 根目录并重载一次；不能误选仅 dist 子目录。不能新建 Profile。

由宿主入口以相同 GAM_HOME/pipe 启动单一受控 Kernel，不使用候选程序自动启动浏览器。校验 health instanceId、实际 PID/创建时间/命令源码路径、注册表/EXE配置、Chrome 扩展实际路径和完整哈希。只读 snapshot 核对所有 Group/Project/Slot/Conversation、lease owner、Attempt 状态；重启不应重复派发既有 Attempt。恢复原派单状态须单独经过核对，失败保持暂停并回滚。普通标签页不得被接管，验收前不真实发送。

## 4. 回滚顺序（每步失败则停在暂停状态、人工诊断）

1. 暂停新派单，记下失败后的 snapshot 与新增业务事实；若升级后发生真实任务写入，恢复旧 DB 会丢失新事实，**不得自动覆盖**，先由用户决定恢复点与事实保全。
2. 再验证候选 Kernel 四项归属，经宿主仅停止受控 Kernel并确认释放；不杀 Chrome/NativeHost 或任意 node。
3. 按 journal 逆序恢复旧 trial.json、旧 CMD、同一 HKCU host 默认路径和原 manifest/config，逐项读回/hash 验证。旧不可变版本目录一直保留；不改 host/pipe/key/token/Profile。
4. 所有数据库连接关闭后，保全失败 DB 及其 WAL/SHM 作为一个隔离集合；用已验证升级前一致备份恢复 global.db。不得把旧备份 DB 与候选 WAL/SHM 混用，不在连接未确认关闭时删日志文件。使用已演练的宿主恢复步骤，不提供未知环境下的删除命令。恢复其他确知发生变更的 data 状态需同一恢复点；不恢复/重建浏览器 Profile、不旋转 token。
5. 用户确认无编辑后，使用审核过的同 ID 可逆步骤将扩展指回旧版本，核对 storage/绑定仍在。无法保留时保持阻塞，禁止 remove/reinstall。
6. 由旧宿主入口启动旧 Kernel，核对旧 PID/source/host/pipe、DB 健康及原 snapshot IDs/leases/Attempt。确认无重复 Attempt，最后恢复原派单状态。旧健康失败时不要循环重启或再迁移；记录阻塞并保留两个版本及所有备份。回滚成功也不删除候选目录。
