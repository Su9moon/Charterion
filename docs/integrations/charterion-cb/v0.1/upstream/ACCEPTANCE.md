# 双方共同验收与交付

当前：CONTRACT_FIXED；所有 runtime scenario NOT_RUN。JSON 样例结构检查不等于接口实现测试。

## 分别开发

- CB 用统一 cases 验证真实 Server/TaskStore/Worker 实现；Charterion 用同一契约驱动 mock 验证关联、投影、证据消费与审核动作。
- 两边都报告准确源码 SHA、契约 SHA、执行命令、实际 PASS/FAIL/SKIP/NOT_RUN、失败证据；不复用旧 SHA 的通过数量。
- 接口调整先更改唯一契约并更新 pin；不能各自修改本地 snapshot。
- 独立开发结束标记 SIDE_READY_FOR_JOINT，不得标记 JOINT_PASS。无法完成项列具体差距，不伪报能力。
- 每侧提交 joint-readiness.json（字段）：repo、source_sha、contract_commit、protocol_version、implemented_features、test_results[{case_id,status,evidence_ref}]、runtime_version（未知为null）、known_gaps、execution_evidence。不得含凭据。

## 用户下一次安排的联合验证

负责人为被用户指派的联合验证执行者；CB/Charterion 各提供 readiness 和可用受控环境。禁止无主联调。
先选用户授权的隔离 fixture 项目，记录双方实际运行 SHA、实例身份、插件真实 tools/list 与配置能力；不得为测试重启线上实例。
先跑 C14 最小闭环，再覆盖 cases.json 的 C01-C18。若能力分期就只报告相应子集，不宣称 V0.1 全部完成。
两种 transport 要分别证明：确定性 MCP 客户端通过 != 真实 WebGPT 插件调用通过；事件采集通过 != 浏览器自动唤醒通过。
记录请求身份、任务身份、run 身份、任务启动次数、manifest 与实际字节 hash、事件消费记录、Reviewer 结论和 WorkItem 最终状态。证据使用脱敏 locator，保留原始材料于授权存储。
失败后优先查询/对账/补传，不删除现场、不修改历史终态、不自动重新执行。非授权真实项目/部署/凭据操作停止。
五角色长期无人值守、真实取消和自动升级不在本次必需验收范围；未测明确 NOT_RUN。

## 通过标准

同一固定契约下两边实际接口兼容，C01-C18 的适用集有真实证据，且 C14 包括真实 WebGPT MCP 派单、完整 Result 字节校验、可用源码交接与独立审核。源码无变更用例不能替代源码交接用例。
必要环境不可用时记录 BLOCKED/NOT_RUN，不以 mock 替代。用户尚未安排联合验证，因此此刻不产生任何 JOINT_PASS。
