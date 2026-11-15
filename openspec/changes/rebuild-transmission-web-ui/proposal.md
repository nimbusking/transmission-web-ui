# Proposal

## Why
现有静态 WebUI 的业务、DOM、缓存和安装逻辑混合，无法为持续刷新和长期维护提供清晰边界。以旧工程观察结果为证据，建立可验证的新应用，同时迁移用户本地数据。

## What Changes
- 使用 Vue 3、Naive UI、Pinia 和 TypeScript 建立独立静态应用，旧目录只读。
- 桌面完整业务、移动常用功能，单实例同源连接，5,000 任务性能上限。
- 统一 RPC 错误、身份、同步、批量结果和设置迁移。
- **BREAKING** 不支持 Transmission 3.00 之前版本、旧 upload 通道、执行式 config.js 和旧主题 CSS；提供 JSON 配置与历史数据导入。
- 新发布包和安装事务；保留官方 UI 和版本回退能力。

## Capabilities
### New Capabilities
- `rpc-connection`: 连接、认证、版本能力、错误和恢复。
- `torrent-synchronization`: 快照、增量、基础补齐、身份、刷新。
- `torrent-browser`: 导航、搜索、排序、列配置、选择与菜单。
- `torrent-operations`: 添加、控制、删除、移动、重命名、队列与限制。
- `torrent-details`: 属性、文件、Tracker、Peer 与任务配置。
- `batch-workflows`: 批量结果、Tracker 替换、目录自动匹配。
- `settings-migration`: 设置、标签、字典、导入导出和旧数据迁移。
- `responsive-interface`: 桌面、移动布局和可访问交互。
- `localization-theme`: 多语言、回退、格式化和主题。
- `release-installation`: 构建、部署、安装、升级与回退。

### Modified Capabilities
无现有 OpenSpec 主规格。

## Impact
新应用不依赖 old/，不增加常驻应用后端。RPC 版本矩阵为 3.00、4.0.0、4.0.6、4.1.4。IndexedDB 为新持久化存储，旧 localStorage 保留。发布和容器测试使用独立管理目录；用户指定SynoCommunity 4.1.4-32采用真实进程核对后的可撤销XDG接入，实机证据单列。
