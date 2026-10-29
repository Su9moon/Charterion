# WO-20261028-CHAR-CB-CHARTERION-01｜CHARTERION 接入实施

Status: READY_FOR_SEPARATE_DEVELOPMENT / NOT_STARTED。
本次仅固定工单；不自动启动本工单。下次进入本仓执行时使用本入口，无需重建上下文。
repo: Su9moon/Charterion

## 精确依据

- Su9moon/personal-ai-control-plane@61402b2d2e042f5b950e58bcb230901e3c58fb12:governance/integrations/charterion-cb/v0.1/BASELINE.md
- 同 repo@commit 的 governance/integrations/charterion-cb/v0.1/PROTOCOL.md、contract.schema.json、cases.json、ACCEPTANCE.md。
- 本仓 docs/integrations/charterion-cb/v0.1/integration-lock.json 绑定上述来源；docs/integrations/charterion-cb/v0.1/upstream/ 是授权非权威快照，禁止本地独立修订协议。
- Su9moon/personal-ai-control-plane@63d15bdfbd3cb9e4c1ae2457fd0b3679d807df3e:governance/PCP_EXECUTION_PROFILE_RESOLUTION_BASELINE.md；processes/architecture-governance-gate.md；governance/PCP_ENGINEERING_AGILITY_PRINCIPLE.md。
- 联合验证入口：Su9moon/personal-ai-control-plane@61402b2d2e042f5b950e58bcb230901e3c58fb12:workorders/WO-20261028-CHAR-CB-JOINT-01.md。

```yaml
architecture_gate:
  required: true
  status: complete
  real_use_evidence: verified
  decision: INTEGRATE
  pcp_specific_remainder: "跨产品派发关联、执行事实投影与可信产物验证"
  minimum_formalization: "版本化接口契约、样例及现有产品内的薄适配；不增加独立运行服务"
execution_profile:
  recommended:
    model: TERRA
    reasoning_effort: High
  resolution:
    human_override_allowed: true
    runtime_fallback_allowed: true
    strict_execution: false
  audit:
    required: true
```

## 动作

1. 在现有 Kernel 内实现薄 CB 适配，保留角色/组织模型；不新增独立调度服务或 Codex CLI provider。
2. 派单前持久化稳定 dispatch/输入，供 Coordinator 经 MCP 提交；用认证只读 MCP 查询找回关联，不从自然语言提取权威任务号。
3. 建立只读状态/事件投影、持久游标与待处理动作去重；浏览器离线保留状态，恢复后推进；后台不另派第二单。
4. 为 CB 外部执行建立显式证据验证映射；不得伪造现有 WorkClaim 的本地 workspace/lease。执行工作区仍由 CB 管理。
5. 消费完整 Result/交接引用，映射待验证/待审核/返工；CB done 不直接完成 WorkItem。用共同 mock/cases 验证，真实 WebGPT/联调保持 NOT_RUN。

## 交付与边界

- 使用现有代码及合理定向测试；不强制分支名/文件数量/全历史测试。需要修改的产品文件由实现者按实际依赖选择。
- 输出 reports/integration/charterion-cb/joint-readiness.json 与简短说明，字段与证据按 ACCEPTANCE.md；记录源码 SHA、共同 pin、真实测试、差距与 execution_evidence。
- 单侧完成最多声明 SIDE_READY_FOR_JOINT。本次不执行跨产品真实联合验证、生产部署、Blue/Green 停启、账号/凭据更改。
- 联合验证由用户下次安排；无需等待对端所有功能才能编写本侧测试。不得把 mock PASS 当真实连接证明。
- 发现契约歧义/需要破坏兼容时先在 canonical 契约提出具体变更，不自行改快照或静默适配；继续不受影响的独立工作。
- 缺失运行时模型/思考等级记录 NOT_EXPOSED_BY_RUNTIME，resolution=runtime_unobservable；不推断实际值、不增加人工审批。
