# 真实录制器生成的合成故障包

schema v1；源构建 `2.1.0-872b77e62abb-6939e681ba4b61bd32e8`。所有任务、服务和凭据均来自隔离测试，原始名称/hash/路径已经替换。pause-timeout.v1.json为写入超时后查询确认的完整录制；production-pause.v1.json为生产界面点击录制、暂停、停止和下载生成的完整包。

默认重放要求源/目标buildId一致。匹配资源和source map归档位于`artifacts/diagnostic-builds/2.1.0-872b77e62abb-6939e681ba4b61bd32e8/`；新构建应重新通过真实记录器产生fixture，不能手工改buildId绕过校验。必要修复验证使用CLI的--candidate和显式正确性断言。
