# 连接与版本能力

## Purpose
连接管理为所有用户操作提供一致、可恢复的服务边界，明确认证、协商、连接状态和错误语义，保证失败不会遗留无法结束的界面状态。

## ADDED Requirements

### Requirement: RPC结算
系统 SHALL 对每个请求仅结算一次，并区分网络、HTTP、认证、协议、业务、超时与取消。

#### Scenario: RPC结算的可观察结果
- **WHEN** 服务返回HTTP 500或业务failure
- **THEN** 操作结束loading并显示可理解错误，已有有效缓存保留。

### Requirement: 会话与认证
系统 SHALL 协商409会话并限制重发次数，认证凭据仅在当前会话保存。

#### Scenario: 会话与认证的可观察结果
- **WHEN** 会话标识失效或认证失败
- **THEN** 成功协商后重发原请求；重复失败结束请求，401提供重新认证入口。

### Requirement: 版本兼容
系统 SHALL 支持Transmission 3.00、4.0.x与4.1.4，并依据能力规范化字段和命令。

#### Scenario: 版本兼容的可观察结果
- **WHEN** 连接3.00、4.0.0、4.0.6或4.1.4
- **THEN** 展示真实版本，文件添加使用metainfo，wanted数值和布尔响应均正确解释。

#### Scenario: 4.1.4兼容协议
- **WHEN** 连接用户指定的SynoCommunity 4.1.4-32对应daemon
- **THEN** 通过其保留的旧RPC协议执行握手、认证、读写、添加和文件/Tracker操作，并将JSON-RPC 2.0与未来移除旧协议的边界明确记录，不宣称支持未经验证的未来版本。
