# 2.1.1 诊断需求回归证据

本目录针对登录恢复修复后的2.1.1独立验收，不复用2.1.0的通过数字。最终机器可读结果见summary.json，文件完整性见SHA256.json。

| 范围 | 证据 |
| --- | --- |
| 完整三浏览器故障矩阵，每场景三次，共243次 | browsers-three-runs.log |
| 生产界面实际采集、下载、独立上下文离线重放与登录，共15项 | production-ui-and-login.log |
| 四个daemon：3.00、4.0.0、4.0.6、4.1.4，三引擎 | live-版本-引擎.json |
| 独立CLI生产包、超时包及candidate修复断言 | cli-production.json、cli-timeout.json、cli-candidate.json |
| 原故障重现与正确状态修复 | candidate-before-after.json |
| 旧2.1.0包在原构建仍可重放、误用2.1.1构建明确拒绝 | cli-old-build.json、cli-old-rejected.json |
| 5000任务，固定CPU16–19，5轮，每种模式200样本 | performance.json、performance.log |
| 147单测、lint、typecheck、生产构建与包大小 | repository-check.log |
| 原始完整脱敏录制样例 | production-capture.json、timeout-capture.json |
| 源/目标构建身份 | production-manifest.json、replay-manifest.json |

首次矩阵并行运行时，另一Playwright进程清理了共享test-results目录，造成4次trace文件ENOENT错误；239项通过。initial-output-collision.log保留全部失败信息。之后使用独立输出目录重跑完整243项，全部通过。性能测试在浏览器矩阵结束后单独运行，未放宽门槛。

构建归档 artifacts/diagnostic-builds/2.1.1-872b77e62abb-284ed676e176cf2c92be 的297个文件摘要已逐个核对。没有修改NAS环境。大型响应超512KiB时增强包仍按设计标记ineligible；CPU采样只是当前环境观测，不保证所有机器无调度停顿。

最终性能：刷新p95 188.9→183.7ms（比值0.9725），交互280.2→277.5ms（0.9904）；普通额外3,627,280字节，增强再增加1,577,408字节；诊断CPU连续采样最大9.774ms。均满足原定门槛，不将本轮负回退解释为普遍加速。
