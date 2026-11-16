# Proposal

> 2026-11-16实施状态补充：用户已明确授权按第30节开始实施，解除本文历史“仅设计/暂不执行”限制。D1–D9/C1–C11继续有效；实际实现及验证见[本轮实施记录](../../../docs/shared-compatibility-implementation-2026-11-16.md)，G4已按用户单独授权发布19081，见实施记录最新发布结果。
本轮设置优化按用户指定恢复旧版七分类，补齐标签批量管理、独立标签交换和分类配置交换；旧版额外设置中的新增偏好按最新指令暂缓。复用已有session白名单/版本边界及v2本地设置，不引入后端或Release运行工具依赖，验收后按已授权方式无新增备份切换19081静态资源。

## Why
现有静态 WebUI 的业务、DOM、缓存和安装逻辑混合，无法为持续刷新和长期维护提供清晰边界。以旧工程观察结果为证据，建立可验证的新应用，同时迁移用户本地数据。

## What Changes
- 名称搜索增量：去掉文本搜索的hash/目录匹配，保留任务名称并支持部分名称、NFKC/大小写兼容和空格分隔的AND关键词，排序与导航保持，详见[name-search.md](name-search.md)，任务第33节。用户已确认实施及本轮无备份更新19081。
- 关于增量：主题右侧新增关于入口，显示当前Logo、版本/连接缓存提示、作者nimbusk和当前仓库文档/个人博客，详见[about-dialog.md](about-dialog.md)，任务第31节。用户已授权验收后直接更新19081、无需备份。
- 封板前共用问题修复（2026-11-16，仅规划）：统一勾选hash身份、当前持有数据口径、未知/0与Tracker报告合计语义；限速改为真实基线/方向独立的最小修改，Tracker保存增加完整冲突检查与回读，并明确3.00分组编辑限制；按D9对差异过大的非核心子能力采用挡板，不强制模拟实现，不降低4.x已有能力。详细设计见[shared-compatibility-fixes.md](shared-compatibility-fixes.md)，tasks第30节；用户尚未指示开始实施，不恢复已取消任务配置tab。
- 使用 Vue 3、Naive UI、Pinia 和 TypeScript 建立独立静态应用，旧目录只读。
- 桌面完整业务、移动常用功能，单实例同源连接，5,000 任务性能上限。
- 统一 RPC 错误、身份、同步、批量结果和设置迁移。
- **BREAKING** 不支持 Transmission 3.00 之前版本、旧 upload 通道、执行式 config.js 和旧主题 CSS；提供 JSON 配置与历史数据导入。
- 新发布包和安装事务；保留官方 UI 和版本回退能力。
- 导航增量：将平铺分类和目录/Tracker下拉框改为可展开多级导航，补齐服务器分布、路径树、累计/当前会话统计和警告，按用户确认移除私有任务节点；引入按需打包的开源SVG图标。
- 任务列表增量：按旧版20列恢复完整默认列表与顺序，补独立行号、必要单元格提示/编辑及已有布局兼容迁移；详见table-list-parity.md，尚待确认实施。
- 详情增量：用户确认点击列表空白收起详情，保护其他交互并提供明确收起按钮；新增独立64MiB/4096块/50%预览样例。详见detail-collapse-pieces.md，按实际改动运行相关回归。
- 分块展示增量：按用户截图改为详情底部全宽自适应方格、增大间距，提供逐格实际大小×完成率及原始块范围提示；保留512格上限，详见responsive-piece-map.md。
- 任务列表进度条增量：按用户截图改为列内全宽矩形、百分比居中，保持真实进度/校验语义、状态配色及现有行布局。

- 工具栏增量：Logo下方新建全宽紧凑图标横排，合并任务操作、刷新、设置和列设置；复用现有操作/刷新偏好，详见workspace-toolbar.md。

- 重新校验增量：三个直接入口先确认冻结目标，再提交hash校验；补磁盘/耗时与接受请求含义，核对四版隔离真实校验。详见verification-confirmation.md。

- 更多/刷新增量：更多仅全局暂停、全局启动、勾选Tracker替换；全局动作明确确认范围；自动刷新关闭时禁用间隔并核对调度与销毁，详见bulk-toolbar-refresh.md。

- 布局主题增量：右上四套结构布局，左下独立明暗切换与持久化，兼容既有v2，完整扩展规范docs/theme-design.md，详见theme-layouts.md。

- 视觉皮肤纠正：四套结构归入独立布局入口；主题改为Modern/Metro/Material/Cupertino四视觉家族，明暗独立，全部本地持久化，详见visual-themes.md及重写的theme-design.md。

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

导航增量影响 Workspace、领域聚合、统计类型/连接状态、本地偏好、文案、图标依赖和对应测试；详细实施依据见 [sidebar-navigation.md](sidebar-navigation.md)，任务为第11节。复用已有RPC轮询，不扫描磁盘、不修改种子的private属性、不调整任务操作或安装器，不改动已完成的Logo。计划文件不表示实现或验收完成，也不授权切换运行中的对照快照。

底部信息集中增量：真实全daemon速度及默认下载目录空间进入全宽末行，连接/版本移至右侧，复用既有刷新，详见workspace-statusbar.md。

文件列表增量：补本地分页/独立条数/文件计数与底部刷新、下载选择、优先级及模板筛选，补已下载列/全量排序，保留原始index及页内虚拟滚动，详见file-list-controls.md。

任务配置增量改为移除：3.00隔离实测发现空闲时限0返回成功但回读保留旧值，按用户“有问题则取消并移除tab”的追加条件终止候选改造，不交付通用配置表单，保留概览/文件/服务器/Peer及其他既有任务操作。

共用问题修复计划影响torrent-synchronization、torrent-browser、torrent-operations、torrent-details、batch-workflows的目标行为，沿用当前未归档能力规格，不新增主规格依赖或持久化schema迁移。3.00与4.0使用共用业务规则，版本差异集中在Tracker保存能力与经核实的数值边界，禁止以3.00限制降低4.x已有能力；验证按用户可观察行为组织，不讨论接口覆盖率。当前只编写和校验OpenSpec文档，不改业务代码/运行中快照或既有任务。
