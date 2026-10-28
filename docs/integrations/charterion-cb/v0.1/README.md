# Charterion—CB 接入入口 V0.1

状态：契约已固定；产品实现 NOT_STARTED；联合验证 WAITING_USER_SCHEDULE。
用户于 2026-10-28 要求将本次讨论材料上传两仓固定，下一次安排联合验证。本次发布不执行代码开发或线上变更。

- 唯一权威：[PCP 接入基线](https://github.com/Su9moon/personal-ai-control-plane/blob/61402b2d2e042f5b950e58bcb230901e3c58fb12/governance/integrations/charterion-cb/v0.1/BASELINE.md)。
- 精确版本与快照字节校验：integration-lock.json；upstream/ 文件为 NON_CANONICAL_AUTHORIZED_SNAPSHOT。
- 本侧实施入口：[工单](../../../../workorders/WO-20261028-CHAR-CB-CHARTERION-01.md)，repo=Su9moon/Charterion，path=workorders/WO-20261028-CHAR-CB-CHARTERION-01.md。
- 对侧仓库：https://github.com/Su9moon/codex-bridge/tree/main/docs/integrations/charterion-cb/v0.1 （导航链接，不作为契约版本来源）。
- 联合验证：[待安排工单](https://github.com/Su9moon/personal-ai-control-plane/blob/61402b2d2e042f5b950e58bcb230901e3c58fb12/workorders/WO-20261028-CHAR-CB-JOINT-01.md)。

开发者先核对 pin/hash，再读 BASELINE/PROTOCOL/ACCEPTANCE。运行产品无需在线访问 PCP Git；这些是开发输入而非新运行依赖。
禁止两仓各自修改共同协议。先更新 canonical 版本及样例，再显式刷新两边 pin。
