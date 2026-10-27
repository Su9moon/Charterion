# PCP × Charterion｜独立动态 HTML 控制台部署蓝图 V0.2

- **状态**：部署方案已确定，**并未部署、启动或验收**。
- **日期**：2026-10-27。以 `PCP_CHARTERION_TARGET_ARCHITECTURE_V0.3.md` 为产品目标；继承 `PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md` 对本机旧数据/备份/Native Host/回滚的保护规定。

## 1. 第一套部署不增加额外基础设施

```text
Windows 11 当前 PC
 ├─ 独立动态 HTML PCP Controller / Radar（普通 Chrome 标签页）
 │   项目树 / 角色会话 / 手动锁定 / Git 工单 / 状态雷达
 │   ↕ 本机 HTTP(S) / API（本阶段回环 127.0.0.1）
 ├─ Node gamd Kernel（现有进程；新增可选 HTML/API 本地入口）
 │   项目/角色/锁/投递/审计权威与真实状态投影
 ├─ Chrome 专用 Profile（ChatGPT 登录由用户维护）
 │   ├─ Chrome Extension background + content script
 │   ├─ 插件工具栏：仅提供“打开独立控制台”入口
 │   └─ 按 project×role 绑定的 ChatGPT Conversation
 ├─ Native Messaging Host（当前用户 HKCU 注册入口，单活）
 │   └─ SQLite（运行数据 + 绑定/锁/项目配置；迁移需回滚）
 └─ GitHub/现有 Git 工具（用户现有已授权连接）
     ├─ PCP Git：Role Charter/Policy
     ├─ 每个项目 Git Repo/Issue/PR：工作中间成果/正式引用
     └─ 可选现有 CB MCP → Codex Worker → Git SHA/Test/证据
```

**无需默认部署远程服务器、Docker、OpenHands、第二个 Scheduler、独立雷达后端或新 CB。** 控制台由 Charterion 随包交付的**独立 HTML/CSS/JS 页面**承载，插件的责任只有启动页面。第一版在现有 gamd Kernel 进程中提供仅回环的页面资源和受控 JSON/API；网页自行动态刷新/订阅状态与提交手动控制操作。不将雷达画在 Side Panel 里，不部署第二套 Kernel 或项目/任务数据库。

## 2. 项目与上下文隔离

- ProjectConfig 按项目记录 Git 仓库/Issue/PR、默认角色启用、权限、锁、可选 CB；按项目将会话实例分别命名/绑定，非每项目自动创建五个新网页。
- **权限靠连接和执行层**：允许读取哪些 Git 文件/Issue 由 GitHub/工具/宿主权限实际执行；UI 过滤/提示词不能替代访问控制。
- WebGPT 当前角色能自主调用已授权 GitHub/MCP 时，收到短 work_ref 后自主读取。不具备访问工具时，运行层只能依据同等真实授权返回允许的小片段或阻断，不能偷偷用全局管理员授权把其他项目资料塞给它。
- Git 保存可审计工程过程；SQLite 保留 Browser Tab/Lease/Attempt/锁定等运行状态。敏感 token/cookie/password 永不提交 Git，UI 不打印可复用凭据。

## 3. 运行及人为控制

- 所有 `RoleBinding`、项目配置、人工锁定与审计写入 Kernel SQLite；Chrome `storage.session` 仅为运行映射缓存。
- `manual_lock` 是阻止自动管理动作，不会篡改浏览器真实观测事实；派发被锁定时明确显示 `HELD` / 原因。
- 同一 Windows 用户的 `com.charterion.control` Native Host 是同一注册入口；第二次运行 setup/install 即使有 `-NoStart` 也可能覆盖 HKCU。因此仅单实例升级，或先完成独立 Host identity 支持/换 Windows 用户。
- 不要求五个 Tab 永远打开；调试 pinned，常规运行 on-demand，并能明确识别 OFFLINE/UNKNOWN/UNAUTHORIZED。

## 4. 执行顺序（保留现有运行环境）

1. 源码工作树检查实际版本，更新分支并在独立 worktree 运行静态检查、单测、可复现构建，不触碰运行 Host。
2. 实现 ProjectConfig、ProjectRoleSession 和人工锁；增加**独立动态 HTML 控制台**及 Kernel 回环页面/API，使绑定、锁和项目配置真实可操作并与 Kernel 状态一致。插件增加打开该页面的入口，而不是内嵌 UI。
3. 修 DOM & Conversation bootstrap，完成专用 Chrome 的一条无害消息闭环，状态可在该 UI 看到。
4. 实现项目 Git 引用/角色允许范围，三 WebGPT 在同一项目按短引用交接，另一项目隔离验证。
5. 按项目可选连接现有 CB；记录真实工单/模型可得信息/执行证据，Reviewer 独立审核。
6. 丰富雷达与 Operations，不因为看板未画完阻断基础单消息验收。
7. 每次涉及运行时更换，先冻结新派发、识别精确进程/Native Host/DB、创建一致性备份和回滚预案；完成后核对版本/项目配置/锁/绑定/回执，失败按兼容迁移和证据执行回退。

## 5. 配置与面板对外暴露

- **界面独立**：HTML/CSS/JS 作为独立浏览器页面加载。Chrome 扩展的菜单/工具栏按钮仅打开配置过的本机 Dashboard URL（例如 `http://127.0.0.1:<port>/pcp/`）；扩展 Side Panel 不包含新雷达 UI，也不成为 HTML 页的数据代理。
- **运行数据**：独立 HTML 要取得动态状态，使用同一 gamd Kernel 的受控 HTTP API；包括项目、角色绑定、锁、投递、Git/CB 状态投影。监听只绑定 `127.0.0.1`，端口可配置；不默认部署独立服务进程。
- **写操作安全**：仅 localhost 不是认证；须有专门的受限 UI 会话鉴权、Origin/CSRF 校验、变更授权和审计；绝不在 Dashboard URL 或 HTML JS 内嵌长期管理员 Token。对跨站页面、未经授权的扩展/普通网站请求拒绝写入；状态缓存要显示观测时间和离线状态。
- **外部访问**：此阶段禁用公网/局域网监听；以后确需远程访问再单独制定鉴权/传输方案。
- UI 的状态与告警数据来自同一个 Kernel 事件/配置投影，Git 任务/CB 状态来自对应真实权威；无法查询的数据显示 unavailable，不假装完成。
- 参数按 Global→Project→RoleSession 分层并持久化；权限上限不可由下层配置绕开。

## 6. 首次验收和限制

- **第一运行验收**：一个项目、一个实际 ChatGPT Conversation、真实 RoleBinding + 手动锁 + 显式状态、单个短 work_ref 测试探针送达并观察回复。
- **第二验收**：同一个项目的三个 WebGPT 角色，各自从 Git 提取自己的任务信息并留阶段成果；另一个项目的跨项目混读必须阻断。
- **第三验收**：可选 CB/Review/恢复及扩充雷达。
- 所有阶段状态当前 `NOT_RUN`。不能将该文档标为已部署，也不能通过下载静态 HTML 宣称“雷达系统已完成”。

继承保护清单与回滚参考：[`PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md`](PCP_CHARTERION_DEPLOYMENT_ROLLBACK_V0.1.md)。
