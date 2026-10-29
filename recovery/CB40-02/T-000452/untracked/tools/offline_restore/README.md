# T-000452 离线审计（未完成 restore 认证）

本工具只读输入，在系统临时目录检查副本，不调用 Kernel/Chrome/IPC，不安装、不写宿主、不复制到 live。Python 3 标准库 sqlite3 为唯一依赖。不得用 ControlDatabase 打开备份：其构造器会建目录、启用 WAL 并迁移。

实际证据：C:、F: 经 /mnt/c、/mnt/f 可读，/proc/mounts 明确为 ro；无写入能力，未做写探针。未安装任何宿主文件。未创建分支/提交/PR（桥接任务明确禁止）。注册仓库 HEAD 66c0c898955d6c9ce92806f922a19256756f41a3，origin Su9moon/Charterion，最高迁移 V27，并非 V29，不能认证 V29 兼容。未修改发布目录或其他项目。

三个备份 SHA 均匹配用户提供值，完整 integrity_check/FK 通过，详见 reports/T-000452-snapshots.json。old 的项目/slot/conversation/attempt/browser operation/event 为 4/2/2/2/2/236，空目标对应为 0。候选仅 agent_slots、leases、browser_runtime 行摘要变化；其余表逐行多重集一致，包含 manager_attempts、conversation 及 generation、历史 pending、操作 idempotency_key。摘要日志不输出消息、token hash 或认证内容。工具不合并表、不生成新 ID、不重新发送 attempt。保留原 PK、unique 索引及 manager mutation generation/sequence；任何未来合并必须另审跨库 attempt/operation 去重，不能按文本去重。

旧根存在，review、projects/CH-PCP-007、projects/CH-PCP-007-final 均不存在。不能简单替换路径前缀；外部 workspace 引用未完成全量解析。根路径和命令依赖须在 V29 源码中逐一确认。运行态分类：tab/content/lease epoch、browser observation、profile runtime 是旧会话观测，不能当可恢复资源；canonical Conversation key/generation、attempt、checkpoint、operation 与事件是历史权威，禁止清理。auth 文件、Chrome Default、扩展 key/ID 从未打开或修改。

阻塞：实际 live 输入有非空 WAL，工具立即拒绝；当前 source-vs-snapshot 漂移未知。候选的保守 runtime guard 仍标记 2 个 slot，需要 V29 字段级审查（不能静默清除）。已提供 changedJournal 行摘要，尚非批准的字段变更白名单。rollbackDryRun 仅验证目标备份可读与完整性、零写入，尚未完成真实离线恢复演练。因此不宣称 restore 成功或满足 cutover 条件。

下一步：在已审核可信 checkout 内以单条 Windows 命令运行 `py -3 tools/offline_restore/task_000452.py`。这只是只读复核；遇 WAL 会退出 2，不停止运行实例、不 checkpoint。须先获得匹配 V29 源码并另行解决一致性快照证据，才能完成字段级验证与隔离恢复演练。任何 live 切换仍需单独明确授权。

测试：`python3 -m unittest discover -s tools/offline_restore -p 'test_*.py'`。退出 2 表示拒绝/阻塞，不能按通过处理。不得将生成报告视为 live readiness 许可。
