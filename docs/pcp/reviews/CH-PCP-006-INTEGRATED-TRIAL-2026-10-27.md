# CH-PCP-006：Charterion-PCP 集成试运行

输入：用户 CH-PCP-006，基于 Draft PR #8 `178529a291e2156795ad3db9fde2694b84f59e8d`。只建立独立 Windows 试运行实例，不改现有 Runtime、Profile、Host 注册或历史数据库；不接 CB、不扩展角色/任务、不合并 main。

## Architecture Gate（实现前完成）

沿用 PCP 主仓 `67fdf81a50fdd90f9c67d90d2f08706c3b669abc` 的 architecture-governance-gate、experience-reuse-gate、PCP-01 V0.2 FIXED、执行 profile 基线；本仓部署 V0.2 明确指出同名 Host 会被覆盖，要求独立身份后才能并行。本工单是该隔离约束的明确实施授权。

```yaml
architecture_gate:
  required: true
  status: complete
  real_use_evidence: verified
  decision: INTEGRATE
  pcp_specific_remainder: versioned isolated Windows trial installation and owned-process lifecycle
  minimum_formalization: narrow installer and lifecycle script around existing gam launcher/Kernel/Native protocol; no new service, authority or database
```

真实证据：CH-PCP-004/005 已实际验证雷达及管理链路，但仅有临时测试脚本；现有 installer 固定注册名并覆盖，不适用于用户要求的并行试运行。结构问题是可追溯交付与生命周期所有权，不是再造应用 Runtime。

Cross-Domain Scan: COMPLETE。

- 直接类比：[Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging) 的命名注册与 allowed_origins；保留协议，安装副本显式使用实例唯一 Host。
- 相邻领域：[.NET 部署](https://learn.microsoft.com/en-us/dotnet/core/deploying/) 的 self-contained 发布；复用现有 publish 脚本，不修改系统 SDK/Runtime。
- 结构类比：[Chrome 专用调试 Profile](https://developer.chrome.com/blog/remote-debugging-port) 隔离实际用户数据；使用专用 Chrome for Testing、独立 Profile 和仅回环的随机端口，不使用固定 9222 或宽泛 remote-allow-origins。

经验分类 PROJECT_LOCAL，复用已有安装/launcher 身份推导、Kernel、数据库和 Native 契约。Core-boundary impact: none。新脚本仅安装/启动/停止/诊断此工单实例，不引入服务、调度、任务或角色机制。

最小约束：安装目标必须不存在，拒绝覆盖；版本来自干净 Git SHA，记录复制后逐文件 SHA256 和显式 Host 替换；启动验证清单与注册；停止前核对精确进程路径/创建时间/实例，拒绝 PID 复用或外来进程。数据、Profile、凭据与版本产物分开；用户显式 start 才运行；测试结束停止，保留安装供一键重启。

## PR 依赖（当前远端核对）

| PR | base | head SHA |
| --- | --- | --- |
| #3 | main | f1ede68b9a9ea573bcbb7b81df30a8e6476c7344 |
| #4 | #3 分支 | 304c9dc4851e12201dbe11fe31d45dd8fbe07ca5 |
| #5 | #4 分支 | c5ac470bce713ebe7bfb525588a840d512839f51 |
| #6 | #5 分支 | bea8fc14b813169d5487b42228598935edb30fc8 |
| #7 | #6 分支 | 1c40e9b1282bd9bb7c4fdd6c65a5cb35742de493 |
| #8 | #7 分支 | 178529a291e2156795ad3db9fde2694b84f59e8d |

全部 OPEN/Draft，未合并。祖先关系、构建与真实运行结果待执行后填写。
