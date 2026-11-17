## ADDED Requirements

### Requirement: 有限范围真实业务重放
开发工具 SHALL 对合格包恢复检查点，运行真实store操作和RpcClient处理路径，支持列表刷新、概览选择、批量开始/暂停和协调，不以展示日志终态代替执行。

#### Scenario: 写入超时后查询确认
- **WHEN** 录制包包含暂停超时和后续查询确认已暂停
- **THEN** 重放产生同类超时和未知结果，使用录制查询恢复状态，不擅自重试写入。

#### Scenario: 并发响应乱序
- **WHEN** 包包含多个并发请求和旧代次迟到响应
- **THEN** 按上下文及序号匹配并按记录顺序完成，真实业务逻辑丢弃旧响应，最终状态符合断言。

### Requirement: 严格资格与离线隔离
工具 SHALL 校验schema、引用、完整性、buildId及范围，所有非静态外部请求被阻断，真实RPC请求数必须为零。

#### Scenario: 包缺失或请求不匹配
- **WHEN** 缺少检查点、事件、必要字段或运行产生未匹配请求
- **THEN** 返回ineligible或diverged及具体原因，禁止空成功响应和真实网络回退。

#### Scenario: 修复构建验证
- **WHEN** 使用不同buildId运行录制包
- **THEN** 默认拒绝，只有显式candidate模式可执行且报告两个buildId及修复正确性断言。

### Requirement: 可核验的重放报告
工具 SHALL 输出实际事件消费、状态差异、网络隔离统计和matched/diverged/ineligible结果，不能将缺失证据视为成功。

#### Scenario: 原故障与修复对照
- **WHEN** 对受控状态缺陷分别运行原构建和修复构建
- **THEN** 原构建重现故障，修复构建以相同输入通过领域正确性断言，并保留两次证据。

### Requirement: 发行前闭环验证
2.1.0 SHALL 完成verification.md强制矩阵，以真实录制器导出的包在全新离线上下文重放，三浏览器R01–R08各连续三次通过，覆盖四daemon版本，关键事件消费率100%。

#### Scenario: 只有格式校验成功
- **WHEN** OpenSpec校验通过但重放用例未执行或失败
- **THEN** 重放能力保持未验收，任务不勾选，不以设计文档或日志查看成功替代证据。
