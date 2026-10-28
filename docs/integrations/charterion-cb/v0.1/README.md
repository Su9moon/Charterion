# Charterion—CB 接入入口 V0.1

状态：契约已固定；R2 最小源码接口已实现，默认关闭；联合验证 WAITING_USER_SCHEDULE。
最初材料发布仅固定契约；本次 R2 按后续开发授权实现下述源码范围，无线上变更。

- 唯一权威：[PCP 接入基线](https://github.com/Su9moon/personal-ai-control-plane/blob/61402b2d2e042f5b950e58bcb230901e3c58fb12/governance/integrations/charterion-cb/v0.1/BASELINE.md)。
- 精确版本与快照字节校验：integration-lock.json；upstream/ 文件为 NON_CANONICAL_AUTHORIZED_SNAPSHOT。
- 本侧实施入口：[工单](../../../../workorders/WO-20261028-CHAR-CB-CHARTERION-01.md)，repo=Su9moon/Charterion，path=workorders/WO-20261028-CHAR-CB-CHARTERION-01.md。
- 对侧仓库：https://github.com/Su9moon/codex-bridge/tree/main/docs/integrations/charterion-cb/v0.1 （导航链接，不作为契约版本来源）。
- 联合验证：[待安排工单](https://github.com/Su9moon/personal-ai-control-plane/blob/61402b2d2e042f5b950e58bcb230901e3c58fb12/workorders/WO-20261028-CHAR-CB-JOINT-01.md)。

开发者先核对 pin/hash，再读 BASELINE/PROTOCOL/ACCEPTANCE。运行产品无需在线访问 PCP Git；这些是开发输入而非新运行依赖。
禁止两仓各自修改共同协议。先更新 canonical 版本及样例，再显式刷新两边 pin。

## R2 最小源码实现（默认关闭，未联合验证）

`RpcRouter` 的可选第五个构造参数为主机专用
`{ enabled: true, clientId, project }`。现有启动入口不传此参数，因此默认禁用。
TODO：由部署主机提供受信配置及管理员凭据隔离；尚未接线，不代表 live integration。
仅管理员 token 可调用 `cb-dispatch.prepare` / `cb-dispatch.lookup`，浏览器 token 和
capability 均不授权；管理员权限绑定主机固定的 clientId/project，禁止请求传 clientId。

prepare 参数为 journal 的 dispatchId/workItemId/project/task/sourceRef/inputRef/options；
lookup 参数为 dispatchId/project。project 必须精确匹配主机 scope。
返回 journal 原始记录（精确 task、原始 UTF-8 intentSha256、dispatchId 和全部输入）；
同 scope 同 dispatchId 重试返回同一记录，修改输入拒绝。lookup 未找到返回 null。
Coordinator 应持久化 prepare 结果后自行通过 CB MCP 提交并以原 dispatchId 对账。
此接口不提交 CB、不创建本地任务或 workspace、不生成 ACK/taskId、不审批；
Organization 内部执行路径不变。规范仍固定于上述 PCP commit；无新增运行时网络依赖。


## R3 host-owned reconciliation (source-only opt-in)

`control/src/charterionCbReconciler.ts` adds a one-shot injectable `TrustedCbReadClient`.
Only a trusted host constructor may bind the authenticated reader, clientId, instanceId,
project and host-verified request_lookup/task_events capability page limit (1..100).
There is no runtime adapter or new browser/admin RPC method. Missing capability must
leave the reader unbound; unavailable reads return blocked/unknown, never success.
The host adapter must verify transport authentication and task project provenance;
the canonical ACK remains unchanged, nested inside the lookup task envelope.

`reconcile(dispatchId)` requires an existing journal intent, queries the original
client/dispatch identity, checks protocol/instance/client/project/work item/digest,
and records the stable task binding transactionally through the existing journal.
Only then does it read one bounded event page. Journal scope, conflict, replay and
contiguous cursor rules remain authoritative; remote cursor metadata cannot skip gaps.
An event read failure retains the durable ACK and returns unknown for later explicit
reconciliation. No submit, timers, scheduler, local execution, lease/workspace creation
or WorkItem completion is provided. `observed` means journal observations only.

Validation uses mock readers only. Real authenticated MCP joint integration: NOT_RUN.
No full browser UAT. Native Node v22.13.0 is below the installed jsdom engine requirement;
no dependency install was needed and these focused Node tests do not exercise jsdom.
