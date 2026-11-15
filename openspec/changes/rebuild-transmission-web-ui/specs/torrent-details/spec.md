# 任务详情

## Purpose
任务详情为单个任务提供属性、文件、Tracker、Peer与配置，保证大型详情按需加载、显示安全、数据索引不被排序筛选和界面行位置改变。

## ADDED Requirements

### Requirement: 文件索引
系统 SHALL 使用原始文件index提交下载选择与优先级。

#### Scenario: 文件索引的可观察结果
- **WHEN** 文件列表过滤排序后修改可见文件
- **THEN** RPC目标仍为原始index，零字节文件显示有效进度。

### Requirement: Tracker身份
系统 SHALL 按目标版本处理Tracker编辑并保留tier和真实身份。

#### Scenario: Tracker身份的可观察结果
- **WHEN** 编辑 Tracker 并同时删除其他 Tracker
- **THEN** 3.00 按已核对的当前列表位置发送扁平 trackerReplace 参数，先替换再删除和新增，避免删除后的重新编号；4.x 保存完整 tier；取消不发送修改。

### Requirement: 详情生命周期
系统 SHALL 只轮询当前详情，并安全显示名称和错误。

#### Scenario: 详情生命周期的可观察结果
- **WHEN** 关闭详情或返回含HTML的任务与错误
- **THEN** 停止轮询并释放大型数据，文本不会创建额外DOM或事件。

### Requirement: 配置草稿
系统 SHALL 将配置草稿与服务端确认状态分离。

#### Scenario: 配置草稿的可观察结果
- **WHEN** 服务拒绝保存或返回晚到配置
- **THEN** 草稿保留供修正，其他任务缓存不改变。
