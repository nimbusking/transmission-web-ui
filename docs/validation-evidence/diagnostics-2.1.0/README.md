# 2.1.0 验收证据

构建与最终结果见summary.json；逐文件摘要见SHA256.json。所有录制数据来自合成任务和隔离服务，未保存用户真实下载或凭据。

|验收|证据|
|---|---|
|R01 409协商/耗尽；R02超时协调；R03鉴权/网络；R04非法JSON/缺字段/tag|browsers-three-runs.log中的diagnostics-replay用例；cli-timeout.json及完整fixture|
|R05代次与旧结果丢弃；R06详情取消；R07部分成功|同日志中的diagnostics-concurrency；仓库unit另覆盖无视AbortSignal的迟到响应|
|R08原缺陷复现与修复验证|candidate-before-after.json、cli-candidate.json|
|R09超限拒绝；R10导入资格与引用；R11启动/语言/Vue；R12降级/清理/跨标签；R13金丝雀|同日志中的import/resilience/tabs/diagnostics，及repository-check.log中的145项unit|
|四真实daemon版本|live-3.00/4.0.0/4.0.6/4.1.4.json；完整三浏览器重复记录在browser日志|
|实际生产界面下载再重放|production-ui-and-login.log、cli-production.json、tests/fixtures/diagnostics/production-pause.v1.json|
|最终性能|performance-final-200.json/log：固定CPU16–19、5轮、每种模式200样本，原5%门槛|
|失败与改进历史|performance-history.json及unpinned/pinned失败文件；没有删除失败结果|

性能CPU归属使用source map和1ms采样。它是该受控环境的观测，不是对所有机器或操作系统停顿的保证。早期100样本p95不稳定，最终正式用例增加为200样本，仍保留全部历史结果和相同阈值。

完整合成包位于tests/fixtures/diagnostics/。本机不可覆盖的构建归档位于artifacts/diagnostic-builds/<buildId>/，包含生产/开发重放资源、source map、源码白名单及archive.json摘要。后续源码变动应重新录制或使用显式candidate断言，不可手改buildId绕过匹配。
