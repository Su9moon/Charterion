# Charterion—CB Integration Protocol 1.0

状态：FIXED CONTRACT / NOT IMPLEMENTED / NOT LIVE VERIFIED。
下述新增工具和字段是待实现契约，不能当作当前插件工具。协议标识为 `charterion-cb/1.0`。

## 1. MCP 面与响应

沿用认证 MCP；工具输出提供 structuredContent JSON（兼容文本表示可同时保留）。旧 submit_task(project,task)、get_status(id)、get_result(id) 的已有语义不变。接入任务新增 integration 元数据；旧任务不得伪造历史身份。

| 方法 | 参数 | 结构化成功结果 | 要求 |
| --- | --- | --- | --- |
| get_capabilities | {} | protocol_version, instance_id, release_sha, features[], limits | 新增；返回真实启用能力，release_sha 不可观测时 null |
| submit_task | 现有参数 + integration（schema 中 dispatch） | 原 id/status + integration（schema 中 ack） | 原子持久化派发关联与任务，执行前完成 |
| get_task_by_request | client_id, dispatch_id | {found:false} 或 {found:true, task:{id,status,integration:ack}} | 新增；查询与提交相同权限范围；响应不明时恢复关联 |
| get_status | id | 原结果 + integration（schema 中 observation） | 新接入任务必带来源/阶段/观测；不能仅凭 running 宣称存活 |
| get_result | id | 原结果 + integration（schema 中 observation） | execution、tests、delivery、handoff 独立 |
| get_task_events | id, after_seq（初始0）, limit（1..100，默认100） | schema 中 event_page | 新增；持久有序，重复读取无副作用 |
| get_result_package | id | 既有 manifest/digest/size/retrieval 格式 | 沿用 CB 固定源版本的结果包协议 |
| get_result_chunk | id,file,offset（十进制字节字符串） | 既有 base64/next_offset/eof/file_sha256 | 按原始字节重组并独立核对 manifest hash，再解码 |

features 最小接入集合：dispatch_dedup, request_lookup, execution_observation, task_events, result_packages, host_handoff。未具备全部时可做分项开发测试，不得声称完整 V0.1 ready。limits 必须含 result_max_bytes、chunk_max_bytes、event_page_max；值来自实际运行配置。
get_result_package/chunk 既有精确格式以 Su9moon/codex-bridge@96ca5de96c4ef256dbb0fa62487a81268f9ef5fa 的 docs/CB_RESULT_PACKAGE_V1_DRAFT.md、src/codex_bridge/result_package.py 为兼容输入。本接入不改名或发明第二套传输。
host_handoff 引用通过既有 submit_task 的 handoff_source/handoff_package_sha256 传入；不新增任意文件读取 API，也不要求 LLM 搬运 patch 字节。

## 2. 身份、输入与幂等

- instance_id 为配置持久身份，重启不变；独立 Blue/Green/Dev 不得共用；Task ID 只在该实例内唯一。
- client_id 为认证配置绑定的 integration scope，不能信任调用者仅凭字符串自报；各角色只获任务范围内的能力。
- Charterion 调用前持久保存 client_id/dispatch_id/work_item_id 与准确提交参数；同一派发只能有一个提交责任人。
- integration.intent_sha256 = SHA256(UTF-8 task 原始字符串)，不规范化换行。source_ref 是准确 repo+Workorder/Issue 版本引用，input_ref 是准确 Git SHA 或不可变包引用；它们是引用不是执行权限。
- Server 去重键为(instance_id, authenticated client scope, dispatch_id)。同键同完整有效提交返回原任务；同键不同 project/task/integration/执行选项返回 DISPATCH_CONFLICT，绝不新建任务。
- 比较已校验的完整参数结构；对象键顺序无关，字符串按原值；optional 字段缺失与 null 不混用。不仅比较 task hash。
- 去重记录与 Task 原子落盘，进程崩溃后不得出现第二次派发窗口。请求查询与创建使用相同同步域；found:false 后仍只能用原 dispatch_id 重传。
- Task 关联和去重记录在历史保留期间不可删除后复用；删除/归档策略须保留去重 tombstone 或明确拒绝旧 key。
- 新尝试使用新的 dispatch_id 和 CB Task；通过 recover_from/handoff_source 引用原记录，不重写原终态。

## 3. Worker 权限与观测

CB 在领取时持久保存 run_id、worker_id 和不可伪造/不可复用的当前执行权限。权限凭据留在受控 Worker 通道，不暴露 MCP/日志/Result。
Worker 认证与当前任务权限分别校验，覆盖 start、progress、result、package、handoff 及控制确认；重复相同事实幂等，冲突拒绝。撤销/过期/被替代的 Worker 不能改权威状态；迟到产物可保留为明确 non-canonical evidence。
不规定具体 lease/fencing wire 格式；实现需用测试证明同一时刻唯一有效执行权，真实项目锁跨所有会写该项目的 Worker 生效。运行权限不能替代 filesystem sandbox 或发布授权。
领取 != 启动；observation.phase 表示已验证阶段，liveness 为 observed_alive/unknown/stopped；observed_at 是最近可信运行观测的 UTC 时间或 null。陈旧阈值通过 limits.liveness_stale_seconds 公布；超过阈值显示 unknown，不自动重派。
execution_status 保留 pending/running/done/failed；terminal task 的执行事实不可由补传改写。delivery_status 和 handoff_status 可由可信不可变回执更新投影。

## 4. 事件、结果与恢复

每任务 seq 单调递增、持久，首次为1；重启后不归零。事件包含 instance_id/task_id/run_id、来源、UTC received_at 和 evidence_refs。相同 Worker 事件重投不追加新语义事件。服务端需验证事实，不直接接受任意“通过”声明。
最小 types：SUBMITTED, CLAIMED, EXECUTION_STARTED, TESTS_COMPLETED, RESULT_GENERATED, RESULT_PRESERVED, HANDOFF_PRESERVED, EXECUTION_FAILED, DELIVERY_FAILED, LIVENESS_UNKNOWN。
TESTS_COMPLETED 必带 tests_status；RESULT_PRESERVED/HANDOFF_PRESERVED 只能在校验文件和持久回执后产生。缺乏阶段证据不补造历史事件。
event_page.events 按 seq 升序，next_seq 为最后返回 seq（空页等于 after_seq）；has_more 真实反映剩余事件。last_seq 为任务当前持久高水位。删除造成游标缺口须明确 EVENT_CURSOR_EXPIRED；上层重读快照对账，不假装完整。
Charterion 事务性保存事件去重键(instance_id,task_id,seq)、消费游标与待处理动作。重复事件不重复派单或启动审核；浏览器离线仍保留待处理事实。恢复派发/审核动作需要自己的幂等身份，不靠已读标记推断动作执行完成。
补传不重新运行 Codex；Server 已存包但 Task ACK 失败时，重传相同完成回执进行对账，不伪造终态或直接重跑。完整 Result 读取仍须满足 Task 终态与包身份一致性。
源码交接可消费失败任务经宿主验证的有效产物；原 failed 保持不变，manifest 标记 source_execution_status 与 provenance。下游必须验证 base SHA/包哈希/项目/允许消费者，不能仅因 source done 自动启动。

## 5. 失败与兼容

接入错误 structuredContent.error 包含 code、phase、retry_class、message（有界脱敏）、evidence_ref（可空）；MCP isError=true。retry_class：query_only、same_request、delivery_only、reconcile、never。错误不自动授予重试执行权限。
最小新增码：PROTOCOL_UNSUPPORTED、CAPABILITY_UNAVAILABLE、DISPATCH_CONFLICT、STALE_EXECUTION_AUTHORITY、EVENT_CURSOR_EXPIRED；沿用 CB 已有 RESULT_UPLOAD_FAILED、HANDOFF_SOURCE_MISSING、HASH_MISMATCH 等语义，现有码不同则提供明确映射。
暂停上层组织 != 取消 CB 进程。V0.1 不新增取消工具；不支持时明确 unsupported，不能标记远端已停止。未来取消须区分请求与确认。
Reader 忽略兼容新增字段；Writer 只发送已协商字段。破坏性变更需新 major；新增可选能力需明确版本与协商。旧接口客户端无需接入元数据即可继续工作。
任务/证据权限沿项目与来源关联校验；路径、symlink、大小和敏感文件限制保留。不得用字符串 URL 或 manifest 自报 hash 替代可信绑定和认证。
