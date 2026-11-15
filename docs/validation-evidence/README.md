# 已执行验证的证据快照

日期：2026-11-15（Asia/Shanghai）。为首轮完整 Git 交付保留的精简 JSON 证据。测试源码和复现命令见 [验证记录](../validation.md)，运行中的双入口见 [本机对照](../local-comparison.md)。这些文件是已执行结果，不是每次提交自动生成的 CI 结论。

- validation-summary.json：49 项 unit、主矩阵 78 项浏览器、额外 3 项新旧 UI 对照、四版 daemon 与归档摘要；保留 DSM 实机待验。
- rpc/controls/download/match/diagnostics-results.json：真实 3.00、4.0.0、4.0.6、4.1.4 的协议、控制、下载、目录匹配和诊断。
- synocommunity-results.json：4.1.4-32 的真实 daemon/上游脚本/BusyBox 本机模拟，不能替代 DSM 实机认证。
- stable-5000-daemon.json、real-5000-browser.json：真实稳定暂停规模及单次浏览器样本。
- soak-1800.json 与 soak-baseline-build.json：完整 30 分钟冻结构建的指标和资产摘要；soak-60.json 是后续最终前端构建的短时复核，不能混为同一构建长测。
- bundle-size.json：全部 JS/CSS gzip 上界。
- live-release-results.json：运行中 daemon 升级/回退。
- comparison-results.json、comparison-containers.json：两个端口共享后端、设置重启保留和当时健康状态；容器实时状态以实际运行结果为准。
- production-audit.json：当时生产依赖审计快照；开发依赖仍有 moderate 告警，范围见验证记录。

完整日志、截图、归档和实验数据保留在本机忽略目录 artifacts/、.lab/；可由已提交脚本重建，不把下载数据或开发依赖纳入 Git。后续优化需要重测时保留测量口径和构建对应关系。
