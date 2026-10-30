# CH-PCP-007：角色恢复状态最小诊断（2026-10-28）

继续 Draft PR #10；诊断起点源码 `c2b54108ce75c6e2c972b7700312a0fa8808367f`，Trial-006 实例 `1cc2ff54f7742042`。本次只有只读诊断和报告，无源码、Runtime 或登录态变更，沿用既有 Routine/REUSE 边界。[脱敏机器记录](assets/CH-PCP-007-role-recovery-diagnosis-2026-10-28.json)。

**结论：最近一次正式 Slot 的 unknown 来自页面观测本身，Kernel 正确保存了该观测。当前精确 Tab 的实时页面身份和 Content Script 响应仍无法安全核对，恢复 idle 保留 BLOCKED；未确认代码缺陷，不做推测性修复。用户已完成人工验证，本结论不归因为用户未登录或未验证。**

## 正式身份与最后上报

观察区间为北京时间 2026-10-28 10:11:38～10:15:14。

| 字段 | 实际值 |
| --- | --- |
| Project / Chief Engineer Slot | `b00f66ec-f62a-4a6f-a5a7-f1ed67e9c70f` / `d7fa941a-8cbc-4513-939a-939da21934b5` |
| canonical Conversation | `6ae1091c-aac0-83e9-9d2a-759dc68ca792`，generation=1 |
| Kernel 所记 Tab ID | `859946006` |
| Slot leaseEpoch | `3` |
| browserLeaseId / browserLeaseEpoch | `b6dc6c1a-9f48-4fbe-a983-4b37757dc909` / `1`；这是浏览器租约字段，不与 Slot epoch 混用 |
| desiredState / browserState / pageStatus | `active` / `open` / `unknown` |
| Content epoch / Revision | `be890512-27ea-4d4a-be54-607fa88077a0` / `7` |
| 最后接受的页面观测 | seq `173`，`1793152944125`，北京时间 10:02:24.125 |
| 该观测 URL | `https://chatgpt.com/c/6ae1091c-aac0-83e9-9d2a-759dc68ca792`，Conversation key 同 canonical |
| Content Script 观测内容 | `unknown`，signals=`[]`，`No trusted ChatGPT readiness signal is visible` |
| 当前精确 Tab 的 URL / 即时 Content Script 响应 | **BLOCKED**：以上 URL 是最后接受的观测，不冒充当前实时 URL |

## 四条路径的判定

1. **页面未就绪：最后一次接受的观测成立，当前原因未定。** `src/chatgptAdapter.ts:164–194` 在没有检测到可信 composer 等信号时返回 unknown。记录明确没有就绪信号，但不能据此区分尚未加载、选择器不匹配或其他页面异常。
2. **页面身份不匹配：最后接受时不匹配可排除，当前不能排除。** seq 173 的 URL、Conversation key 与正式绑定一致。`src/browserRuntimeReporting.ts:6–22` 和 `src/bindingRegistry.ts:22–33` 会拒绝非当前 Tab、项目/角色不一致及 canonical 已存在时的 provisional 页面。若后来重定向到根页面，可能不再形成正式 Slot 上报；这是代码路径分析，未证实该 Tab 实际发生此事，不能为通过验收放宽身份检查。
3. **扩展上报中断：全局链路持续工作，单 Slot 情况未定。** 最终聚合 runtime observedAt=`1793153711124`（10:15:11.124），authenticated/ready、5 个 Tab；正式 Slot 仍停留在 10:02:24.125。页面观测按语义变化发布，缺少新事件本身不能证明中断；聚合状态也不能证明该角色就绪。查询区间无相关 incident，不能排除未记录异常。browserObservedAt 是占用协调时间，不能代替 browserRuntimeObservedAt。
4. **Kernel 投影未更新：对最后接受的观测已排除。** epoch、Revision、pageStatus、Tab ID 和 observedAt 均与 seq 173 一致；没有查到更新的已接受 idle 被 Kernel 丢失。`control/src/browserAuthority.ts:102–144` 校验所有权和版本后直接保存上报状态。

## 安全边界与阻断证据

仅在既有 Chrome Dev 窗口中选择已打开页面，读取地址栏及白名单状态标签，然后恢复原选择；未导航、刷新、打开 URL 或开启 CDP。观察到两个已有页面显示相同 canonical URL，另外三个显示根 URL。UI Automation 不提供这些页面的 Chrome 数字 Tab ID，因此不能用页面顺序推断哪一个是 `859946006`。

部分 UIA 元素包含浏览器检查标签，一页还包含账户加载失败标签；这些元素可能隐藏或滞留，不能视为当前精确角色页仍在验证，也不能推翻用户已完成验证的确认。未读取聊天内容、Cookie、Token 或 Profile 存储。

此前自动审批已拒绝打开精确会话 URL，返回 `blocked by policy`。本次没有重试，也没有改用其他方式导航；没有修改审批、登录态、Host 注册、原 Runtime、普通 Chrome 或既有数据。没有足够证据定位明确代码缺陷，因此保留 **BLOCKED_NO_ALLOWED_EXACT_MAPPING** 并结束诊断，不继续反复测试。

## 保留核对与测试

- **PASS**：只读 Kernel 连接、正式身份读取、最后观测与投影逐字段比较。
- **PASS**：前后 Attempt 恰为两个，均 `reply-observed`；`a66d7ba3-8fbc-4262-8618-c0277f12bf62` updatedAt=`1793117028320`，`d89552ef-e77a-433f-92e0-3d7df88de84d` updatedAt=`1793132833148`，均未改变。tasks=0、messages=0，没有清空或重发。
- **PASS**：canonical、generation、Slot/浏览器租约、Tab、active/open 及 Fleet controlled/锁定/Revision 1 前后不变；本次未执行暂停/恢复、关闭或重启。
- **BLOCKED**：精确正式 Tab 的即时页面与上报核对、正式角色恢复 idle。
- **NOT_RUN**：本次编译、类型检查、单元回归（仅报告变更）；新消息 E2E、登录及重启测试（本次范围禁止）。历史 509 项测试属于此前修复验收，不计作本次执行。

本次诊断完成后停止，PR #10 保持 Draft，不合并 main，不启动下一阶段。

收尾 Tokdash 只读采样：共享历史会话 `01a17c6a-87b5-7641-8c5e-e7d170079b63` 累计 tokens=84281320、token_events=614，归属 project-history-shared-session；不作为本次独占用量，不建立新任务跟踪文件。
