# 关于入口与项目资料

## Context
2026-11-16用户确认本轮计划，并明确授权验收通过后直接更新19081、无需备份。新版顶栏仅有布局/主题，关于翻译键没有展示入口；旧版dialog-about包含原上游版本、作者、主页/Wiki/releases、PT助手、捐赠及感谢行。本轮恢复必要信息并适配当前项目，不复制旧实现。

## Goals / Non-Goals
新增主题右侧关于按钮及居中弹窗，使用当前双向环流Logo、UI/Transmission/RPC版本、作者nimbusk、项目链接与博客。仅展示已有连接状态，不新增RPC、后台外部查询、持久化设置或依赖。任务、daemon、安装器及第30节待实施兼容性修复不在本轮范围。

## Design
- Workspace持有临时open状态和独立按钮，AboutDialog按需加载，沿用Naive UI浮层皮肤、焦点陷阱/关闭/焦点返回；窄屏复用appearance-trigger图标模式。
- 复用BrandMark静态版本，UI版本读取package.json，会话版本复用store.session。缺失显示未连接/RPC未知，已有会话但连接未就绪/过期/重连时说明缓存；不将历史缓存标作实时连接。
- 内容和四个按钮居中、可换行；提供中英文字和历史语言英文回退。移除旧PT助手、捐赠及感谢行，许可证仅为文字链接。
- 用户视觉验收补充：简介、Transmission/RPC标签和值、作者、缓存说明、版本标记、按钮及许可证统一15px主体字号；标题保留24px层级。简介/字段/许可证使用正常正文色，避免当作淡灰辅助信息，版本标记保留皮肤强调色。仅作用于关于内容，不调整全局字号。
- src/project.ts集中维护项目主页、README使用帮助、implementation-progress更新记录、https://nimbusk.cc及LICENSE。当前不声称自动检查或已有正式发布；后续发布再调整链接。外链仅用户点击时新标签打开，noopener noreferrer。

## Acceptance and Validation
三浏览器核对内容/链接/关闭及焦点、无新增请求/写入、勾选和详情保持；受控3.00/4.0.0/4.0.6/4.1.4会话字段、未连接和缓存提示；四布局四皮肤深浅、390px及强制桌面入口可达、弹窗无横溢出。相关语言unit、lint/format/type/build、OpenSpec strict、old816和800KiB资源预算检查。复用已有RPC字段，不把受控版本显示测试冒充四版daemon完整业务实测；DSM及13.12既有性能限制保持。

## Delivery and Rollback
先冻结生产构建并验收，再从同一dist生成完整预编译候选归档和摘要。按本轮用户授权直接更新19081，不新增备份；逐文件资源先行/入口最后原子替换、保留旧hash，更新deployment.json，前后只读核对任务关键字段，实页验证关于。不能运行compare:up/down/reset或操作容器生命周期。

没有本轮精确上一版快照。已有较早备份可核验后恢复资源及deployment.json，但会撤销多轮优化，不可称精确上一版；也可从本轮前源码构建候选并独立验收后另行切换。静态回退无需清理浏览器数据或修改daemon；Release沿用既有安装回退机制。本轮不提交、推送或对外发布。
