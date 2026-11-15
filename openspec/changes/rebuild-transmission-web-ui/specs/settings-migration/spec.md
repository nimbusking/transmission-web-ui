# 设置与数据迁移

## Purpose
本地设置和迁移能力保护浏览器中的标签、任务关联、目录字典和界面偏好，区分服务端参数与本地数据，并为历史格式提供备份、校验和可追踪迁移。

## ADDED Requirements

### Requirement: 稳定标签
系统 SHALL 用稳定标签ID与torrent hash保存本地关联。

#### Scenario: 稳定标签的可观察结果
- **WHEN** 删除标签数组中较早的标签
- **THEN** 其他标签关联不改变，界面重置不删除标签和字典。

### Requirement: 迁移备份
系统 SHALL 预览旧localStorage或v1导出，先保存原始备份再提交新数据，保留旧key。

#### Scenario: 迁移备份的可观察结果
- **WHEN** 旧数据含悬空索引、空字典或损坏JSON
- **THEN** 报告异常并保持可恢复原文，不推测历史错位的用户意图。

### Requirement: 分离导入
系统 SHALL 将daemon导入作为独立差异确认操作。

#### Scenario: 分离导入的可观察结果
- **WHEN** 导入仅含dictionary-folders或本地偏好文件
- **THEN** 不发送session-set，空字典能够正确导入。

### Requirement: 多页面保存
系统 SHALL 按字段事务更新并通知同源页面。

#### Scenario: 多页面保存的可观察结果
- **WHEN** 桌面和移动标签页先后修改不同设置
- **THEN** 两次修改均保留，不以整份旧对象覆盖新字段。
