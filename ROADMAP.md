# Hive Roadmap｜CB × Hive 联合开发集成线

> 状态：**已批准产品目标与实施顺序；开发/部署/联合验收需要真实证据，文档不等于运行完成。** 本文件仅维护 Hive 在 CB × Hive 联合项目中的分期与边界，不替代上游 Charterion/Hive 的通用产品设计，也不修改 PCP 全局组织。Repo 当前 GitHub 路径仍为 `Su9moon/Charterion`；产品显示名 Hive，仓库重命名不得先行假定完成。

## 0. 设计归属与职责（固定）

- **联合管理对话**：`CB × Hive｜联合开发项目主控`，项目级 `chief_engineer`；负责跨项目 Roadmap、CB/Hive 接口和权限边界、需求范围变更、共同验收、版本安排。**不是 PCP 全局 Controller**。
- **两个独立开发对话**：`CB V0.4｜Development` 和 `Hive V0.5–V0.6｜Development` 的正式项目角色均为 **`developer`**；默认每个真实技术项目一个 Developer。一个 Chief Engineer 可管理多个 Developer；不预配额外对话和 Worker。
- **开发权限**：Hive Developer 可独立决定已批准目标内的模块实现、测试、缺陷修复与 Git PR 协调；若出现跨仓协议改动、另建服务/调度器、角色架构变化、额外 Developer、扩大 Roadmap、授权范围变化，先提简短设计影响给联合项目主控定夺，**不得在开发对话中自行转成必做需求**。普通返工无需反复升级批准。
- **组织映射**：雷达顶层一个逻辑 `CB × Hive 联合开发` 管理组，关联两个真正各有 Git root 的 ProjectCell（CB、Hive）与三个真实 ChatGPT 对话；不能虚构第三个联合项目 Git root。正式运行绑定以 Kernel 只读回执为准，失败任务不能计已注册。
- **执行权威**：WebGPT/Hive 管角色、会话和上层决策，CB Server/Worker 管任务执行、状态、产物/结果和受信宿主交接，Git/GitHub 管源码与 PR。Hive 不在自身数据库复制第二套 CB TaskStore/Worker/源码交付权威。沿 PCP 固定角色治理，不创建额外项目级监管角色。

## 1. 版本与先后顺序

| 阶段 | 主要任务 | 当前可核查状态 / 验收 |
| --- | --- | --- |
| **Hive V0.5.0 已安装基线** | Chrome Dev（仅现有 Default profile）、Native Host、独立 Kernel/SQLite、Radar，Hive 品牌 | 运行实例与 Git 源码分开核查，不能因 main/PR 改动宣称现场已升级；中英文两语言是当前维护范围 |
| **Hive V0.5.1** | 稳定安装/启动、项目和会话持久化、一个逻辑联合组+两个 ProjectCell+三会话角色绑定，Kernel 重启后读回一致 | `T-000458/459` 仍 failed：隔离补丁虽存在，但未可信发布 Git、完整测试未验或被环境限制、未完成 Windows 安装/角色注册。禁止将 SOURCE/INSTALL/REGISTERED 混为一谈 |
| **Hive V0.6 × CB V0.4 基础真实闭环 P0** | CB 能力与身份协商、准确项目作用域、Hive 发送关联意图→单一 CB 任务→Codex→Git/Result Package/Handoff→Hive 收证与必要的人工/独立 Reviewer 交接，任务/事件幂等、失败/重启恢复 | Hive PR #12 和 CB PR #113 目前 Draft；必须一次真实 Browser→Kernel→CB→Codex→Git→Hive E2E；只验证源码/合成测试不能计联合验收 |
| **紧接 P0：自动升级 MVP（P1A）** | **复用现有版本目录和 CB 发布通道**，通过 Windows 非常驻受信 launcher/update 脚本按获准 release manifest/SHA 校验、备份、切换 Kernel/Native Host/现有 Chrome Dev 扩展、验证、失败程序回退；CB 经受信入口远程修复/查询结果 | 一次真实升级 + 一次故障回退、保留项目/角色/数据、现有扩展身份、实际组件版本握手；无经许可 Windows 宿主入口时不能声称 CB 沙箱能直接部署 |
| **紧接 P0：人工介入 MVP（P1B，可与 P1A 并行）** | WebGPT 遇 Cloudflare 正常人工验证、登录失效或其他真人必需行为→暂停受影响会话并持久记录→Hive Kernel **不经过 ChatGPT 对话或 ChatGPT 邮件插件**，以已配置 SMTP/邮件 HTTPS API 独立通知指定责任人（幂等、邮件失败留存）→人工正常处理→核对页面/CB Task 事实后恢复 | 用可控模拟故障验收停止、通知、人工恢复且不重复 WebGPT/CB 派单；不绕过人机验证；未配置的邮箱和收件人不得臆造 |
| **后续 Hive V0.7–V1.0** | 既定角色/审查/多 Agent/稳定可观察工程工作台按既有 PCP #34 分期；不因 P1A/P1B 增设新调度中心 | 按后续正式验收 |
| **Post-V1.0 候选** | 跨主机 / Linux / 云端迁移 Worker、Kernel、Browser Adapter 的分离部署；远程看板/跨设备按实际需求再选 | 仅保留可分离设计方向，当前不实现云集群或 Windows 托盘服务 |

**版本标识说明**：P0 后两个 MVP 必须尽早交付，不推迟至 V0.9/V1.0；准确 Hive patch/minor Tag 按真实发行决定，不在此虚构 `V0.6.1` 已发布。PR approved、merged、Release published、Windows installed、Chrome extension reloaded、E2E PASS 是六种不同事实。

## 2. 三种浏览器运行模式（最小验收，不增加常驻服务）

| 模式 | 运行方式 | 可保证与不能保证的事 |
| --- | --- | --- |
| Kernel-only | `gamd` 独立进程，不打开 Chrome | 可持续保存 Hive 已有事实并查询 CB 已持久任务；**不能在已关闭的 ChatGPT 页面上继续 WebGPT DOM 操作** |
| Chrome Dev 最小化/按需打开 | 在用户当前已登录且授权的 Chrome Dev Default 中保留真实网页 | 需要实际验证后台节流、页面 frozen/discarded、聊天任务完成/恢复；未实测前不称无人值守稳定 |
| 人工接管 | 正常可见 Chrome Dev 页面 | 处理登录/Cloudflare 等网站合法验证或人工授权；不伪装真人、不自动绕过挑战 |

浏览器最小化验证可与闭环联调安排，但不把 Headless Chrome、第二 Profile、新 Worker、Cloud VM 或独立 Windows 服务作为 P0/P1 前置条件。

## 3. 实施前优先复用、避免重复开发

- 现有 `control/src/gamd.ts` 的独立 Kernel、IPC、SQLite、Radar；`scripts/pcp-trial.mjs` 的 `versions/<SHA>` 安装雏形、启动和 doctor；Native Host 和扩展的固定身份；CB 的 Green Result/Handoff/发布和 Blue/Green 宿主更新已开发能力。**短脚本只处理版本切换/回退**，不要增加一个长期 Host Agent 或另一套自动升级 Server。
- 当前 Chrome Dev 真实扩展路径需先核实，固定 extension key/ID 和 Native Host ID；不能只改 `current.json` 却指望加载在旧路径的 unpacked extension 自动更新，也不能强制刷新正在编辑的 ChatGPT 标签页。
- CB `T-000454` 曾因 `HOST_RPC_UNAVAILABLE` 失败；隔离 Codex/WSL 不拥有 Windows Hive 本机 admin RPC。CB 可远程制作修复候选、传送可信 release 引用，Windows 由本地授权入口执行，失败则保留可独立触发的恢复脚本。
- 邮件通知必须有**脱离 ChatGPT Web 的独立发信通道**：Cloudflare 阻断时不能借被阻断的 ChatGPT 对话调用 Gmail 插件。只做一封故障通知、事件去重、发信回执和未发告警；无须自建邮件服务器/平台。
- 从旧 Charterion-PCP-Trial-006 迁移旧测试数据与 ChatCMD 开发路线已取消。只做中文和英文，其余语言暂不新增/维护。
- 为避免重复设计，Dev 遇技术问题先检查既有 Git/PR/CB 证据：`T-000458/459` 保留 Hive 补丁未发布，CB `T-000462` 保留失败证据尚未合格发布；应优先回收已有成果，不能重做同一结构或虚报 completed。开发对话只报告问题、选项和局部实现；架构变化由联合项目主控决定。

## 4. 共同验收与权威引用

- [PCP 联合项目 Roadmap #34](https://github.com/Su9moon/personal-ai-control-plane/issues/34)；[职责/角色 #35](https://github.com/Su9moon/personal-ai-control-plane/issues/35)；[分组与实际绑定 #36](https://github.com/Su9moon/personal-ai-control-plane/issues/36)。
- [PCP Charterion–CB 集成 V0.1 基线](https://github.com/Su9moon/personal-ai-control-plane/tree/main/governance/integrations/charterion-cb/v0.1) 是当前协议唯一来源；禁止两仓自行改共同协议。
- [CB `ROADMAP.md`](https://github.com/Su9moon/codex-bridge/blob/main/ROADMAP.md)、[Hive Draft PR #12](https://github.com/Su9moon/Charterion/pull/12)、[CB Draft PR #113](https://github.com/Su9moon/codex-bridge/pull/113)。

**本 Roadmap 仅变更文档，未安装、未升级、未运行邮件测试、未派 CB Task、未完成角色绑定，也未合并源代码。**
