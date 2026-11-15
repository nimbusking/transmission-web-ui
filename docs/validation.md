# 重构验证记录

## 2026-11-16 Transmission 3.00 封板前行为评估

按用户最新要求，只评估3.00在当前UI的实际显示/保存/操作表现，不讨论接口覆盖率。结论及复现条件见[3.00 UI评估](transmission-3-ui-review-2026-11-16.md)。本轮唯一离线3.00自建32KB样例确认选择性下载下completeSize公式高估；存续限速字段100可读回，弹框固定默认值问题属于前端语义。另6项受控诊断复现边界，A05为RPC17分支不计3.00实测。92unit、已启动的162项三浏览器受控回归通过不能抵消新发现；37dist摘要未变，无业务修复/部署/对照写入/压力长测。证据ui3-native-audit.json、ui3-audit-diagnostics.json、ui3-review-summary.json。任务配置已移除，不把其历史seedIdleLimit=0问题当作当前tab阻断。

## 2026-11-16 按用户条件取消任务配置改造并移除tab

用户追加条件为“如果存在兼容性问题，或者其他问题，就取消实现。并移除这个tab页”。原两栏/类型校验/差异与回读候选实现未部署；隔离3.00镜像测试在将已存seedIdleLimit=17设置为0时，torrent-set虽success，torrent-get仍17（该次seedIdleMode=0，完整回读及请求见torrent-config-cancellation.json），因此按条件停止候选工作并移除任务配置。此观察只证明该输入边界未按提交值改变，不证明所有任务配置不支持或四目标版均不兼容；4.0.0/4.0.6/4.1.4与后续做种规则阶段未继续执行，不能标为通过。唯一twui-config-8f890720-7070-46a4-a4a2-89d32e0175ef容器在finally/--rm清理，docker ps -a按完整名字确认不存在；无共享卷/宿主端口/网络，无对照RPC写入。

已交付：DetailPane仅概览/文件/服务器/Peer；移除任务配置tab、通用字段表单、草稿/保存路径和store的config详情字段路由/DetailSection枚举值；本轮候选校验/保存模块和候选专用用例一并撤回。其他任务操作/全局设置保留，特别保留SettingsDialog共用config-grid公共样式；原任务配置错误/晚到草稿用例因功能取消而替换成四tab/无配置读取提交回归，不把已删除候选98项unit当最终结果。

最终验证：92unit（11文件）通过。最终冻结构建三浏览器48项全部通过（`.lab/remove-task-config-verified-report`，details/file-pagination/detail-dismiss/toolbar/settings）：四标签、无配置页读写、万文件/分页/原始索引、工具栏/详情关闭、全局设置网格样式、跨页导入值/daemon差异确认/手动诊断。早期测试对设置页签误用role=tab、导入验证读取已折叠导航节点导致失败，改用既有n-tabs-tab和可见标签编辑值后复验通过，未为测试更改业务逻辑。检查发现公共网格被共用后已保留并新增display:grid/label方向断言，最终构建重新验证；中间候选摘要不与最终报告混写。

lint/format/typecheck/build/strict OpenSpec/diff、old816通过，gzip345.8KiB<800。完整离线包SHA-256`cf927e7a81040fcd1b2b2cfdd030d9167787549ea61aa1872da8504ea9e0c179`，37web/46项归档摘要一致，按连续验收直接更新19081、不额外备份授权发布（资源先行/入口最后，保留旧hash）。部署前后7任务关键字段不变，未重启/停止/重建对照容器，未改任务/daemon设置或浏览器偏好。localhost实页选择D，仅四tab且无配置表单，截图artifacts/remove-task-config-live.png及remove-task-config-detail.png；其余数据页保留。无提交/推送/外部发布，无本轮长压力或DSM实机验证；原13.12、DSM和较早快照回退限制保持。

复现UI回归：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/remove-task-config-verified-report npm run test:e2e:docker -- --output=.lab/remove-task-config-verified-tests tests/e2e/details.spec.ts tests/e2e/file-pagination.spec.ts tests/e2e/detail-dismiss.spec.ts tests/e2e/toolbar.spec.ts tests/e2e/settings.spec.ts`。取消设计记录openspec/changes/rebuild-transmission-web-ui/torrent-config-form.md；不是仍待实现的任务。

## 2026-11-16 文件列表分页与旧版底栏能力

- 旧行为依据：old/template/torrent-attribute.html的文件pager、torrent-attribute-files-fields.json的已下载/排序字段、system.js的pagerFilter和三个正则模板。新版实现独立filePageSize默认200/10–5000、页码/跳页、范围/匹配总数/勾选数、专用刷新、下载/跳过、优先级菜单与三模板，补已下载列和五字段排序；模板仅筛选，不自动操作文件。底栏跟随皮肤明暗，窄屏留44px避让明暗入口，强选择器限定输入/选择器180/155px以防组件默认100%导致桌面无谓换行。
- 安全/数据：fileRows合并fileStats的实际bytesCompleted及wanted/priority，保留原始index；先全量筛选/稳定排序、后本地分页，页内虚拟滚动。切任务/页码/筛选/排序/条数清勾选，刷新缩页钳制并排除页外index；操作仍捕获hash/generation和原始index。页码/搜索/排序临时，只有文件条数独立事务保存；老v2缺字段或非法值回200，主pageSize/标签/导航不重置。既有RPC字段/命令不增加，详情关闭生命周期保持；完整元数据依旧整批读取，不把此改动描述为后端分页或节省文件RPC体积。
- 自动验证：92unit（11文件）通过，新增4文件模型用例和1设置兼容/并发用例。最终冻结构建42项三浏览器回归全部通过（`.lab/file-pagination-release-report`，file-pagination/details/detail-dismiss/toolbar），包括10000文件、5000条页仍<100 DOM行、翻页零额外文件RPC、原始index200/9999的下载/跳过/优先级、模板/非法正则/空列表/切任务/缩页/条数重载独立/失败恢复、四皮肤×两明暗窄屏边界、明暗入口不遮挡及桌面底栏<=100px。初轮3项失败是新用例误以为默认先升序而双击，按Naive实际先降序修正；视觉检查另发现窄屏明暗遮挡和默认输入100%宽度，已修CSS并在最终构建完整重验，不将候选报告冒充最终报告。
- 静态与交付：lint/format/typecheck/build/strict OpenSpec/diff通过，old816摘要未改，全部JS/CSS gzip345.9KiB<800。离线归档SHA-256`9536af5807bc2cff21de97f52e7654a0bb18e2bae1a70b248b60d2e9dfaa2d5b`，45摘要/36web核对。按连续验收直接更新19081、不额外备份授权，资源先行/HTML最后；初候选015f9468实页发现底栏125px换行，最终9536af58修正后实页约62.8px、输入180px/模板155px。两次部署均7任务关键字段不变，无对照容器生命周期动作/daemon写入，旧hash资源保留。
- 实页：localhost19081选择D多文件样例，仅浏览文件页，3文件/匹配3/已选0/200条，已下载16.0KiB、16.0KiB、0B；未修改下载选择、优先级或既有偏好（旧v2按规则补新字段默认值）。截图artifacts/file-pagination-live.png。结构化build/release/live/validation及候选摘要见validation-evidence/file-pagination-*.json。用户视觉验收、真实DSM、13.12性能待办保持；未重跑四版本命令或无关30分钟长测，不能拿mock写入当真实daemon操作验证。无提交推送/对外发布，原较早快照回退限制保持。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/file-pagination-release-report npm run test:e2e:docker -- --output=.lab/file-pagination-release-tests tests/e2e/file-pagination.spec.ts tests/e2e/details.spec.ts tests/e2e/detail-dismiss.spec.ts tests/e2e/toolbar.spec.ts`。回退核验既有较早快照摘要后资源先行/入口最后，会撤销多轮优化，不清数据；未创建精确上一版备份。

## 2026-11-16 总大小单位简写

仅TorrentTable总大小渲染及Workspace移动总大小移除单位中的i，公共tableBytes/formatBytes保持不变；1024换算、二位/原移动精度、字节原值与排序不改，其他列/详情/状态栏仍按原单位显示。table-parity现有回归同时断言总大小1.00KB与已上传2.00KiB。

`npx vitest run tests/unit/table.test.ts`5项通过；三浏览器table-parity共6项通过（`.lab/size-unit-report`），覆盖列/排序换序/标签/分页/保存/移动边界。build/typecheck、lint/format、strict OpenSpec、diff、old816、344.0KiB预算均通过。没有RPC/性能/安装逻辑变化，未重复四版本或长压力测试。

完整离线包SHA-256`1bb3b0ceadc8643abdebc898ff0c246b7b7cf293fd04bd3963e060a6763b6dde`，45摘要/36web一致；沿用连续验收直接更新19081、不额外备份授权，资源先行/入口最后，7任务前后不变，无对照容器/daemon写入。localhost实页确认64.00KB、64.00MB，其他已完成64.00KiB不变，未改偏好；截图artifacts/size-unit-live.png，证据size-unit-build/release/live.json。用户视觉验收待反馈，DSM/13.12原限制保持；较早快照回退限制同此前记录，无提交推送或对外发布。

## 2026-11-16 全宽底部状态栏与真实数据

- 已实现：WorkspaceStatusbar独立32px+底部安全区末行，跨两列；左侧带Lucide下载/上传/磁盘图标，右侧连接/Transmission/RPC/UI版本，各项分隔，顶部与侧栏不重复。UI版本来自package.json，太阳月亮留左下。四布局、四皮肤及深浅共用语义变量，窄屏栏内横向滚动；抽屉/详情止于状态栏上沿。
- 数据：session-stats.downloadSpeed/uploadSpeed是真实全daemon B/s；free-space(path=session.download-dir).size-bytes为默认下载目录文件系统可用量，提示路径。单一串行刷新链/关闭自动刷新/手动刷新，空间5秒超时独立失败；0有效、缺失/负数/非有限数不可用，断线保留并标过期，重连清空并拒绝晚到generation/路径数据。默认目录变化按既有session-get最多30秒识别，不汇总所有磁盘或随当前筛选变化。
- 自动验证：87unit通过（增加非0/0/无效/路径变化/故障恢复/重连晚到/真实5秒超时隔离）；39项相关三浏览器回归（themes/toolbar/detail-dismiss/search-contrast）通过于`.lab/statusbar-final-report`，最终9项状态栏专题通过于`.lab/statusbar-focused-report`，同一冻结构建；后者含32布局×皮肤×明暗组合/浏览器、390窄屏、真实请求参数和数据格式、周期关闭与手动/故障恢复，几何96组见statusbar-metrics.json。早期失败为新测试英文名称误写、受控异步复选框需click后等待提交、导航两个同名入口需定位scrim；修正测试后9项全通过，无生产修正或重建混淆。未把最初中断的测试算通过。
- 真实协议：`node scripts/test-statusbar-readonly.mjs`四个新一次性daemon（3.00/4.0.0/4.0.6/4.1.4），无网络/卷/映射端口，结束自动移除。空闲真实上下行均0、各自free-space与statvfs逐字节相等。19081只读实测`/data`为970679914496字节，两次读取差0，显示904.0GiB；实页已连接4.1.4/RPC19和上下行0B/s。非0映射用受控浏览器数据验证，不声称真实非0下载验收，不启动对照任务。证据statusbar-rpc/live-rpc/live.json。
- 构建和发布：lint/format/typecheck/build/strict OpenSpec/diff检查通过，gzip JS/CSS344.0KiB低于800，old816原文件摘要不变。完整离线包SHA-256`a1fda5808d7d46fe7f5aaadfb584c25e005386274e27167586794b5bf2a089b8`，45摘要/36web文件核对通过；沿用连续验收直接更新19081、不额外备份授权，资源先行/HTML最后原子替换，旧hash资源保留。脚本一次因旧摘要路径引用错误在任何写入前退出，修正后部署与7任务关键字段前后相等。未重启/停止/重建对照容器、未写daemon设置/任务，未编辑浏览器偏好。截图artifacts/statusbar-live.png，底行x0/y688/1280×32。
- 待验/限制：用户风格验收待反馈，真实DSM7.1/SynoCommunity4.1.4-32仍待实机；本轮无性能路径改动，未跑无关30分钟压力，既有13.12未结案。无提交推送或对外发布。没有精确上一版新备份，既有较早before-table-progress快照可核验后资源先行/入口最后回退，会撤销多轮优化，不能清数据库/改任务。

复现专题：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/statusbar-focused-report npm run test:e2e:docker -- --output=.lab/statusbar-focused-tests tests/e2e/statusbar.spec.ts`。39项回归在`.lab/statusbar-final-report`中按文件过滤，statusbar当时失败的6项已由最终专题替代，不将该报告整体写为全通过。

## 2026-11-16 暗色搜索框辨识度修正

根因：Naive暗色Input默认border透明，前轮全局color/colorFocus设为surface时，搜索与面板同底色。仅Workspace顶部搜索绑定暗色局部theme-overrides：subtle底色、muted默认实体边框、accent悬停/聚焦和轻焦点轮廓；浅色返回undefined继承原主题，不改其他输入框/圆角/尺寸/查询逻辑。主题规范与OpenSpec25节同步。

最终6项三浏览器mock通过（`.lab/search-contrast-final`、报告`.lab/search-contrast-final-report`，14s）：四深色家族默认框线与输入/面板对比度>=3、占位文字>=4.5，hover/focus强调色、尺寸保持、筛选/清空；四浅色明暗往返恢复原外观与1280/390px边界。首轮3项浅色基准在换肤过渡未结束时采集旧颜色导致失败，改为等待实际边框/占位文字达到声明目标再采样，同一生产构建重验通过，没有降低阈值或改变业务。lint/format/类型生产构建/spec strict/old816及342.8KiB通过；局部视觉修正未重跑unit、压力或四版协议，13.12和DSM实机待验保持。

归档SHA-256 `b97891f1375714b311609756b69e82ab5f6847e5d0ade6d3230f1c61405bf6bd`，45摘要/36web文件一致，按连续验收直接更新19081无额外备份授权部署，7任务关键字段前后不变，无daemon写入/对照容器操作。实页已连接4.1.4，在用户截图对应Cupertino暗色核对底色#31353e、默认1px #b0b8c7边框，8px圆角、310×34尺寸保持；未输入搜索或操作任务，临时皮肤切换恢复modern/workbench/system。截图artifacts/search-contrast-live.jpg及search-contrast-detail.jpg，四份search-contrast证据归档。用户视觉验收待反馈，无提交推送或对外发布；没有精确上一版新备份，较早快照回退会撤销多轮改动，恢复须核验摘要并资源先行/入口最后，不清数据。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/search-contrast-final-report npm run test:e2e:docker -- --output=.lab/search-contrast-final tests/e2e/search-contrast.spec.ts`，全部mock。

## 2026-11-16 视觉皮肤与布局真正分离

- 根据用户澄清将四套区域结构移入独立LayoutPicker“布局”，新增ThemePicker“主题”中的Modern/Metro/Material/Cupertino视觉家族；左下唯一明暗按钮与品牌文字同排保持。ui.visualTheme为v2兼容可选字段，缺失/未知回modern，layoutTheme/theme含义不改；事务/通知/导入导出独立保存，不重置其他偏好。旧EasyUI仅参考皮肤概念，不引入其CSS或修改old/。
- 视觉profile集中深浅palette、控件圆角与Naive类型化覆盖，App根变量同步/卸载恢复、Provider namespace覆盖Teleport浮层。视觉CSS覆盖导航、控件、表头、选中、矩形进度外观、标签页和弹窗；状态语义颜色和20px/0圆角进度保留，DataTablepadding/行度量不改。Material/Cupertino的复选框保留3px轻圆角，避免看成单选框。规范[theme-design.md](theme-design.md)已重写为布局/视觉/明暗三层边界和扩展流程。
- 82项unit（10文件）通过：新增八套palette的正文/辅助/主按钮对比度>=4.5、旧v2/未知视觉字段保留其他配置、三项并发及导入。开发检查后调深Modern/Material浅色辅助文字；没有降低阈值。类型/生产构建、lint、format、OpenSpec strict、old816摘要和342.6KiB预算通过。
- 核心冻结构建72项三浏览器mock全通过（`.lab/visual-skins-final`、报告`.lab/visual-skins-final-report`，约1.5分钟）：32种布局×皮肤×明暗组合、390px两入口、固定布局坐标/行高、勾选详情身份、实际按钮/输入/表头/菜单/缓存列设置Portal样式、三项刷新与跨页保存，以及既有工具栏/导航/矩形进度/详情/迁移回归。之后仅修正预览中的两个主按钮填充，使其与实际主操作一致，并在最终冻结构建重跑12项三浏览器视觉专题（`.lab/visual-skins-preview-final`、报告同名-report，35.9s）全部通过，补预览背景等于实页主按钮的实际断言；没有将72项描述为同一个最终归档构建的重跑。最终native样式数据为visual-skins-metrics.json，四家族按钮6/0/18/8px、输入6/0/10/8px，Portal半径与namespace同步，真实数据行<=35px。未重跑压力长测或四版RPC；原13.12预算/DSM实机待验不关闭。
- 最终离线归档SHA-256 `e18b0f6381ad1cd506164466359671c12b2a5195725fcf2f554a2df994adf8d6`，45项归档摘要/36web文件与最终dist一致；按连续验收直接更新19081无需额外备份授权部署，资源先行入口最后，保留旧哈希文件。前后7任务关键字段一致，无daemon写入/对照容器生命周期操作，无提交推送或对外发布。目标安装仍不需Node/npm/Python/CDN。
- 实页localhost:19081已连接4.1.4，独立布局面板仍有四结构，视觉面板四家族；1280×720下四皮肤主区始终x290/y114/990×606，按钮半径6/0/18/8px。Material列设置Portal为skin-material-light、半径10px；Cupertino+浅色刷新恢复且布局不变。临时切换已恢复原modern/workbench/system，未操作任务。截图visual-skins-picker-live.jpg及visual-*-light-live.jpg，图像等待控件颜色过渡完成后保存；build/release/metrics/live四证据已复制validation-evidence。用户主观风格验收待反馈。
- 本轮无新增精确上一版备份。选Modern可恢复默认皮肤，选workbench恢复默认布局；完整回退既有较早before-table-progress快照会撤销多轮功能，不是精确上一版。核验摘要后资源先行/入口最后恢复及对应deployment.json，不清数据库或改任务；旧客户端可忽略新增视觉字段，再升级安全回默认。

复现核心：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/visual-skins-final-report npm run test:e2e:docker -- --output=.lab/visual-skins-final tests/e2e/visual-themes.spec.ts tests/e2e/themes.spec.ts tests/e2e/toolbar.spec.ts tests/e2e/column-dialog.spec.ts tests/e2e/table-progress.spec.ts tests/e2e/detail-dismiss.spec.ts tests/e2e/migration.spec.ts tests/e2e/navigation.spec.ts`。最终预览专题：同命令改用`.lab/visual-skins-preview-final-report`、输出`.lab/visual-skins-preview-final`，仅`tests/e2e/visual-themes.spec.ts`；全部mock。

## 2026-11-16 左下明暗按钮横排修正

根据用户截图将唯一ColorModeToggle与品牌/版本文字组放到同一sidebar-bottom横排，垂直居中，取消按钮独立fixed定位；侧栏预留底部一行，专注轨道/移动导航关闭时只显示图标，移动展开恢复横排。未改持久化、任务或明暗逻辑。18项三浏览器主题/导航mock回归通过（`.lab/theme-footer`、报告`.lab/theme-footer-report`，25.5s），覆盖四主题两明暗、断点/强制桌面、文字与按钮中心差<1px、导航与既有保存。lint/格式/类型构建/spec strict/old816摘要及339.3KiB预算通过；局部布局修正未重跑unit、压力或四版协议。

已按连续验收直接更新19081无额外备份授权部署，归档SHA-256 `a612ee54c89125f95c204348422f217f3135f9a5c38eb0c9d0a6ba644fcb6296`，45摘要/36web文件一致，前后7任务关键字段相同，无daemon写入/对照容器操作。实页1280×720已连接4.1.4，文字组中心y686、按钮中心y686，按钮x232/36px且仅一个入口；没有编辑偏好。截图artifacts/theme-footer-live.jpg及theme-footer-detail.jpg，三份theme-footer证据已归档；规范theme-design.md同步。既有较早before-table-progress可核验回退但非精确上一版，会撤销后续多轮功能；不清数据库/改任务。性能13.12与DSM实机待验保持，不提交推送或对外发布。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/theme-footer-report npm run test:e2e:docker -- --output=.lab/theme-footer tests/e2e/themes.spec.ts tests/e2e/navigation.spec.ts`。

## 2026-11-16 布局主题与独立明暗

- 设置页旧theme选择已移除，右上ThemePicker提供经典工作台workbench、紧凑控制台console、侧栏工作室studio、专注列表focus四套结构；左下太阳/月亮按当前有效明暗切换，布局选择器底部可恢复明暗跟随系统。ui.layoutTheme为兼容可选字段，缺失/未知回workbench，ui.theme仍保存light/dark/system；沿用事务/BroadcastChannel/导入导出，不清其他偏好。工作区与任务表唯一，不改RPC/行高/操作范围。
- 完整扩展规范在[theme-design.md](theme-design.md)：用途/结构差异、尺寸和令牌、浮层继承、状态边界、自适应、保存兼容、扩展顺序与验收。四主题不只是颜色；1440px几何和两种明暗证据见themes-geometry.json。390px统一移动布局仍保留ID，回桌面恢复；工作室平板页头降级、专注抽屉和强制桌面入口覆盖。
- 72项unit（9文件）通过，新增旧v2/未知ID保留自定义设置、并发保存layout/theme与导入恢复。最终冻结构建63项三浏览器mock全部通过（`.lab/themes-final`、报告`.lab/themes-final-report`，55.3s），覆盖四布局×两明暗、1440/1024/800/390px、强制桌面、刷新/系统变化/跨页通知、勾选详情列宽保持，以及工具栏/列设置轻过渡/导航/详情/分页/迁移回归。Chromium先行4项亦通过，不代替最终证据。lint/格式/类型生产构建/OpenSpec strict/old816摘要、339.2KiB预算通过；未跑压力长测或四版RPC，因为未改协议/数据渲染算法，不关闭13.12预算和DSM实机待验。
- 完整预编译归档SHA-256 `35e96a68ee79b195c448eed40b7c9377249d022978183b78f50a37ff1c5e3cd8`，45项归档摘要/36个web文件与冻结dist一致；按本次连续验收的直接更新19081/无需额外备份授权部署，资源先行入口最后、保留旧哈希文件。部署前后7任务关键字段一致，无daemon写入/对照容器生命周期操作或old/修改。安装仍不需要Node/npm/Python/CDN；未提交/推送/对外发布。
- 实际localhost:19081已连接4.1.4，1280×720下工作台主区x290/y114、控制台x220/y94、工作室x276/y114并保留外边距、专注x56/y114，四套实际查看/键盘选择/截图齐全。专注导航开关、浅色与专注布局刷新保持、设置页旧项移除均核对；临时本地偏好切换已恢复workbench/system，不更改任务。截图`artifacts/themes-picker-live.jpg`及theme-*-live.jpg，build/release/live/geometry证据复制validation-evidence；用户主观外观验收待反馈。
- 本轮不新增精确上一版备份。选workbench可恢复默认布局；完整回退只能核验既有较早before-table-progress快照后资源先行/入口最后恢复与对应deployment.json，会撤销此后多轮改动，不能称精确上一版；不清数据库或改任务。旧客户端可能忽略新增布局字段，再次升级安全回默认。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/themes-final-report npm run test:e2e:docker -- --output=.lab/themes-final tests/e2e/themes.spec.ts tests/e2e/toolbar.spec.ts tests/e2e/layout.spec.ts tests/e2e/column-dialog.spec.ts tests/e2e/table-parity.spec.ts tests/e2e/migration.spec.ts tests/e2e/navigation.spec.ts tests/e2e/detail-dismiss.spec.ts`，全部mock。

## 2026-11-16 列设置开关响应优化

- 仅列设置首次按需挂载，之后复用23行控件；独立ColumnSettingsDialog避免Workspace重建插槽。首次先隐藏挂载一个nextTick再显示，不增加计时器。卡片/遮罩均120ms纯透明度、去除scale(.5)，减少动态效果时0ms；遮罩对组件库!important仅作局部覆盖，不影响其他弹窗。持久化接口/schema/RPC不改。
- 最终冻结构建36项三浏览器回归通过（`.lab/column-dialog-verified`、报告`.lab/column-dialog-verified-report`，32.5s）：同一DOM身份跨关闭按钮/Esc/空白遮罩复用，首次无控件，隐藏后退出可访问树和焦点陷阱、返回Columns按钮，其他设置弹窗正常；深浅/390px/减少动态效果、列宽/顺序/显隐/重载和工具栏既有交互。三浏览器transitionrun实际事件均仅opacity，卡片和遮罩进出均0.12s，见column-dialog-transitions.json。不把此证据当逐帧/P95性能测量；保留控件的驻留DOM/内存开销是明确取舍。
- 首轮12个新增用例失败：遮罩点击定位被滚动容器覆盖、窄屏错误等待隐藏桌面行、首次按需挂载跳过过渡；修正真实空白点击/连接就绪等待和首开显示阶段。后续遮罩仍0.25s暴露Naive使用!important，局部覆盖后上述最终36项全部通过；早期失败报告保留，不引用为通过证据。lint、format、类型/生产构建、OpenSpec strict、old/816摘要、335.9KiB资源预算通过。未重跑unit、压力长测或四版RPC矩阵，本轮无协议/daemon改动；既有13.12超预算和DSM实机待验不变。
- 已生成完整预编译归档并沿用工具栏连续验收的直接更新19081/无需额外备份授权部署，仅替换静态资源并保留旧哈希文件。归档SHA-256 `38cbdf6c8d7267b23a31f6e0e45d481d488d0ac76c73ce3e0235b62edcad14bb`，45项归档摘要/36个web文件与冻结dist一致；部署前后7任务关键字段不变，没有daemon写入、对照容器生命周期操作或配置重置。
- 实页localhost:19081已连接4.1.4，初始无列控件、打开23行，关闭后23行隐藏保留、遮罩0、焦点返回列设置；重开及Esc关闭核对通过。只查看关闭，无偏好编辑；截图`artifacts/column-dialog-live.jpg`。build/release/transitions三份证据已复制validation-evidence；用户主观流畅度验收待反馈，未提交/推送/对外发布。
- 本轮无新增精确上一版备份；旧before-table-progress-20261115可核验后回退，但会撤销其后矩形进度条/工具栏/确认等多轮改动，不能称精确上一版。恢复资源先行、入口最后及对应deployment.json，不清数据库或改任务。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/column-dialog-verified-report npm run test:e2e:docker -- --output=.lab/column-dialog-verified tests/e2e/column-dialog.spec.ts tests/e2e/layout.spec.ts tests/e2e/table-parity.spec.ts tests/e2e/toolbar.spec.ts`，全部mock。

## 2026-11-16 列设置移除版本预设入口

- 按用户要求移除“应用旧版完整列表”及配套“恢复上一份列布局”按钮和两条中英文案，删除Workspace.resetColumns/store.columnPreset的界面包装。列设置保留显隐、宽度、顺序；默认20列和现有自定义不改，不重置IndexedDB。SettingsRepository历史字段/迁移数据与内部兼容方法保留，不顺带重构存储。
- 最终构建9项现有三浏览器回归全部通过（`.lab/column-settings-cleanup`、报告`.lab/column-settings-cleanup-report`）：表格20列/安全值/校验进度/标签/拖动/分页和列显隐/宽度/顺序/重载保留。原恢复按钮断言改为入口不存在、调整后20列保持。lint、format、类型/生产构建、spec strict、old/816摘要及335.6KiB预算通过；局部入口移除未重跑unit、压力长测或四版RPC矩阵，既有13.12和DSM实机待验不变。
- 归档SHA-256 `d3677e3f2f6113d9f19530b96ee269ef126bde8075adae0f23c31c3eaf945c10`，45项归档摘要与36个web文件/dist一致。沿用本次工具栏连续验收直接更新19081/无需额外备份授权，资源先行/入口最后原子更新并保留旧哈希资源；未新增备份、未重置列配置，部署前后7任务关键字段相同。
- 实际19081打开列设置并定位最后可选字段，确认底部没有预设按钮，字段/宽度/顺序控件仍可见；仅聚焦末项宽度并关闭，没有编辑偏好或操作任务。截图`artifacts/column-settings-cleanup-live.jpg`；column-settings-cleanup-build.json和column-settings-cleanup-release.json已复制到validation-evidence。未操作对照容器、未提交/推送/对外发布，用户视觉验收待反馈。
- 无本次精确前一版新备份；已有before-table-progress-20261115等较早快照可核验后回退，但会撤销之后多轮外观/交互，资源先行/入口最后恢复及对应deployment.json，不清数据库或改任务。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/column-settings-cleanup-report npm run test:e2e:docker -- --output=.lab/column-settings-cleanup tests/e2e/table-parity.spec.ts tests/e2e/layout.spec.ts`，全部mock。

## 2026-11-16 更多批量与自动刷新核对

- 更多独立于右键完整menu，仅stopAll/startAll/replaceTrackers。全部启停无需勾选，连通/非空/非忙碌时可打开；operateBulk通过refreshSnapshot先等待在途/延后读取链完成、再完整读取，然后捕获全连接明确非空hash/generation和名称/数量并确认，不使用空ids代表全部，不受筛选/页/勾选影响。正常torrent-start尊重daemon队列，torrent-stop停止；新任务不加入已显示的确认，失效身份拒绝。原确认框不重发部分成功/失败整批；取消后续请求保持可用。Tracker替换要求勾选，右键保留强制开始/标签/匹配等高级操作，更多不再重复校验（工具栏/右键保留确认）。
- 自动刷新原本已有单setTimeout链与设置持久化，但关闭后秒数可编辑、前台恢复忽略开关、卸载时在途finally可能重挂计时器。现工具栏秒数/加减与设置页毫秒输入随autoRefresh禁用，保留原数值；visibilityChanged尊重开关，disposed守护schedule并清理pendingFull/递增generation，refresh销毁后不发读取。保持前台2–300秒、后台30秒、共享刷新及手动/明确操作后核对，没有新增计时链/schema。
- 70项unit（9文件）通过，新增4类有效计时/快照测试：真实调度2/4秒边界、开关/快速反复、关闭后前台事件无读取/手动仍有效；后台30秒/失败后恢复/恢复前台；在途关闭/销毁不重挂或写晚到状态；全局范围等待当前和延后全量读取后再新完整快照，避免把合并promise完成误当最新全量已完成。
- 最终冻结构建63项相关三浏览器mock回归全部通过（`.lab/bulk-refresh-final`、报告`.lab/bulk-refresh-final-report`）。新增更多精确三项、无勾选Tracker禁用点击无动作、筛选外新增任务在全局确认中可见、确认前零写/取消不写、确认期间新任务不隐式加入、全局Start/Stop明确hash非空、空列表禁用/部分失败不重发、Tracker单勾选预览；自动刷新用真实浏览器时钟和请求计数验证周期读取、关闭后至少2.4秒无后续周期请求、手动读取一次、恢复周期、关闭禁用输入与两个加减按钮、重载保留4秒和关闭状态、设置页同值禁用。另有既有工具栏/选择/校验确认/添加/详情/Tracker/匹配回归。首次批次60通过/3失败仅测试误用Naive UI未提供的ARIA menuitem，改为实际禁用项与点击不操作断言后最终63项通过，旧trace保留，不累计重跑。
- 最终套件在WebKit收尾出现一次临时测试代理向未启动19091的读取连接拒绝日志，所有63项断言通过；未启动该实验daemon或操作对照任务。全局启停只在mock内执行，不将其称为四版真实全局启停验证。底层RPC方法未变，未重跑四版完整矩阵或压力长测，13.12性能与DSM实机待验继续开放。
- lint、format、类型/生产构建、spec strict、old/816摘要与335.8KiB预算通过。归档SHA-256 `7d0534121747fa5c45ad22ec4ea5d980a443bbad817bac53afba12118980f8c5`，45项归档摘要和36个web文件与dist逐项一致，完整预编译资源/目标安装依赖不变。bulk-refresh-build.json、bulk-refresh-release.json和bulk-refresh-live.json已复制到validation-evidence。
- 沿用本次工具栏连续验收明确授权，直接更新19081且无新增备份，资源先行/入口最后原子替换，保留旧哈希文件。部署前后只读核对7任务关键字段相同。实页无勾选时更多只有三项、Tracker禁用，取消自动刷新后5秒输入/两个按钮均disabled；全部暂停确认列出当前7任务且默认取消，已取消未执行，之后恢复原自动刷新开启/5秒，普通单任务/队列按钮仍禁用。截图`artifacts/bulk-refresh-live.jpg`、`artifacts/bulk-confirmation-live.jpg`。未对照任务/daemon写入，未启停/重建对照容器，未提交/推送/对外发布，用户视觉验收待反馈。
- 本次没有精确前一版新备份；可核验已有before-table-progress-20261115等较早快照后资源先行/入口最后恢复及对应deployment.json，但会撤销此后外观/确认/刷新修正，不清浏览器数据库或改任务。

复现：`npm test`；`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/bulk-refresh-final-report npm run test:e2e:docker -- --output=.lab/bulk-refresh-final tests/e2e/bulk-refresh.spec.ts tests/e2e/toolbar.spec.ts tests/e2e/verify-confirmation.spec.ts tests/e2e/operations.spec.ts tests/e2e/detail-dismiss.spec.ts tests/e2e/trackers.spec.ts tests/e2e/workflow.spec.ts`。全部为mock，不运行real daemon集成用例。

## 2026-11-16 重新校验二次确认与实际逻辑核对

- 直接校验原先在Workspace.commands中立即执行，现移出该映射，工具栏/更多/右键统一走ActionDialog；冻结点击时hash/generation和名称/数量，默认取消，显示磁盘I/O/耗时及“提交不等于完成”，明确“开始校验”才发送。确认前取消/Esc/关闭/遮罩不写；发送前继续验证身份。submit有busy保护，尝试发送后禁用原框整批重发，避免部分成功/unknown重复校验；错误保留并提示核对后重新选择。成功仅消息通知已提交，实际状态/进度沿用既有刷新。移动后显式勾选校验继续包含在移动确认中并补提示，匹配工作流内部校验不增加嵌套弹框。
- 核对底层逻辑：targets拒绝空目标，command验证hash/generation并发送hash，execute对torrent-verify串行提交、结束后重读列表，RPC对未知网络/超时不自动重发；校验进度采用recheckProgress，不误用percentDone。此轮底层逻辑本身无改动。
- 最终冻结构建的42项三浏览器mock回归全部通过（`.lab/verify-confirmation-settled`、报告`.lab/verify-confirmation-settled-report`），包含5类新确认场景及既有工具栏/操作/匹配回归：三个入口确认前零写、取消/Esc/关闭/真实遮罩点击、取消焦点、单/多目标hash、确认中身份变化拒绝、双击仅提交一次、失败/未知不重发、实际校验25%与下载50%分离、串行批量中取消剩余请求。提交中确认框新增“取消后续任务”，因页面底部入口会被遮罩挡住；已提交首项继续结算、后两项cancelled，原框无法重发。
- 中间结果保留：初次类型构建因Naive UI无ButtonInst导出失败，改为显式按钮根元素类型后通过；初批浏览器32通过/7失败，遮罩底层元素被包装层拦截、确认框遮住原页面取消入口以及在未结束批次中重建dist造成动态资源失配。遮罩测试改为真实坐标外部点击、弹框新增取消后续按钮；初批不作为最终构建证据。下一批39通过/3失败仅取消断言匹配了提示和错误两个alert，精确断言取消项并去掉错误文案undefined后，最终42项通过。不累计重跑次数为额外独立覆盖。
- 66项unit通过（包含空目标/身份、串行取消、请求与错误分类）；lint、format、类型/生产构建、spec strict、old/816摘要及335.0KiB预算通过。未重跑无关压力长测，13.12性能超预算和真实DSM设备待验继续开放。
- `scripts/test-verification-isolated.mjs`使用缓存3.00/4.0.0/4.0.6/4.1.4镜像，各创建一个唯一标签一次性容器，--network none、无宿主端口/绑定挂载/共享卷，只对新建32KiB/2×16KiB数据调用hash校验。每版损坏一半后haveValid=16384、percentDone=0.5、位图gA==；修复后haveValid=32768、percentDone=1、位图wA==，均等待实际status=0并核对文件内容不变。RPC接受和实际完成分别记录，四版8种数据结果全部通过。首次4.1.4将部分文件重命名.part导致固定路径断言失败，测试夹具显式rename-partial-files=false后四版重跑通过，此设置仅在临时容器中。4个容器已退出/清理，按本轮唯一标签docker ps -a为空；没有操作twui-compare/twui-lab服务。此小数据测试不声称大盘I/O耗时或真实DSM行为已验收。
- 预编译归档SHA-256 `e5463628778ba8a47c5f931382a3873392cd3403ebd818c2d4ef64df2a49ef22`，45项归档清单、36个web文件与最终dist逐项一致；分块合并导致文件数变化，清单均完整，不新增目标运行依赖。verify-confirmation-build.json、verify-confirmation-release.json和verification-daemon-results.json已复制到validation-evidence。
- 沿用本次工具栏更新的明确直接部署/无需额外备份授权，仅静态资源先行/入口最后更新19081，保留旧哈希资源。部署前后只读核对7任务id/hash/名称/状态/进度/目录/大小不变。实际19081已连接4.1.4，B确认框显示1任务/正确名称/提示、默认取消，已点击取消并清除临时勾选；没有点击“开始校验”、没有对照任务/daemon写入或对照容器生命周期操作。截图`artifacts/verify-confirmation-live.jpg`，用户视觉验收待反馈，未提交/推送/对外发布。
- 本轮无精确上一版新备份；既有before-table-progress-20261115等较早快照可核验后回退，但会撤销此后的图标/工具栏/确认改动，不能描述为精确上一版。资源先行/入口最后恢复及对应deployment.json，不清数据库或改任务。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/verify-confirmation-settled-report npm run test:e2e:docker -- --output=.lab/verify-confirmation-settled tests/e2e/verify-confirmation.spec.ts tests/e2e/toolbar.spec.ts tests/e2e/operations.spec.ts tests/e2e/workflow.spec.ts`；四版数据核对为`node scripts/test-verification-isolated.mjs`，仅创建自己的离线临时容器，需本机已缓存镜像。

## 2026-11-16 校验图标统一

- WorkspaceToolbar、SidebarNavigation和TorrentTable将ScanLine导入/映射替换为现有Lucide DatabaseSearch，数据库加右下小放大镜；保留现有尺寸、可访问名称、勾选启用和全部业务逻辑，不引入依赖/图片/CDN。
- 12项相关三浏览器回归通过（`.lab/verify-icon`、`.lab/verify-icon-report`）：导航筛选/统计/展开、工具栏勾选目标与快捷操作、深浅主题校验进度/列伸缩/行选择。构建/类型、lint、format、spec strict、old/816摘要、334.6KiB预算通过。仅现成图标替换，未新增外观映射测试，未重跑unit、压力长测或四版业务矩阵；既有13.12性能和DSM实机限制保持。
- 归档SHA-256 `8a38bd3493c5b09b000c105606af1519789936b812a98bf60c598e48d32c85ad`，46项归档摘要/37个web文件与dist一致。沿用本次工具栏验收直接更新19081、无需额外备份授权完成静态部署；资源先行/入口最后，保留旧哈希文件。部署前后只读核对7任务关键字段完全一致，未操作容器或写daemon，保留用户当前修改的任务名称。
- 实页已连接4.1.4，确认工具栏18px与左导航16px的SVG均为lucide-database-search；临时勾选B查看启用图形后已清除、任务按钮恢复禁用，未触发校验。列表当前没有校验中的真实任务，其图标以源码/构建与mock中status=2渲染回归验证，不通过发起真实校验造状态。截图`artifacts/verify-icon-live.jpg`；证据verify-icon-build.json、verify-icon-release.json已复制到validation-evidence。用户视觉验收待反馈。
- 无本次新增备份；既有before-table-progress-20261115较早快照可以回退，但会撤销矩形进度条/全宽工具栏，并非精确上一版。核验既有摘要后资源先行/入口最后恢复及对应deployment.json，不清数据库或改任务。未提交/推送/对外发布。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/verify-icon-report npm run test:e2e:docker -- --output=.lab/verify-icon --grep 'shortcuts preserve|tree filters|rectangular progress' tests/e2e/toolbar.spec.ts tests/e2e/navigation.spec.ts tests/e2e/table-progress.spec.ts`，已用--list核对12个mock用例。

## 2026-11-15 工具栏仅勾选可操作修正

- 根因是Workspace.effectiveIds在无批量勾选时回退selectedId，导致只点击行查看详情也启用任务按钮。移除回退，targetCount直接读取checkedIds.length；operateChecked发送前再次检查ready/busy/非空并复制勾选，operate必须显式接收ids。右键、标签入口继续传各自明确目标；无勾选禁用10个任务入口（含队列/更多），改名保持单勾选限制，添加/刷新/设置/列设置不受影响。
- 最终构建36项相关三浏览器回归全部通过（`.lab/toolbar-selection`，报告`.lab/toolbar-selection-report`）。新增仅高亮不启用、取消最后一项/取消全选/搜索清勾选后禁用且详情仍在、无误写；保留勾选A查看B时工具栏只操作A、右键/Shift、移动端勾选与详情分离、确认中身份变化、批量取消、详情空白保护、布局/主题和刷新设置。移动与真实daemon集成测试源码中需要工具栏操作的用例已改为显式勾选；本次未启动或重跑真实四版集成测试，不将其列为本次通过。
- 66项unit、lint、format、类型/生产构建、OpenSpec strict、old/816文件完整性及334.5KiB预算通过。协议/同步未变，不重跑压力长测；既有13.12性能与DSM实机待验限制继续开放。
- 预编译归档SHA-256 `00332fe05caa30837ecc8150061a3e90637d30822440f6c51663054fc3d890d4`，46项归档摘要与37个web文件/dist一致。沿用本次工具栏更新“回归后直接更新19081、无需备份”的明确授权，已资源先行/入口最后原子更新、保留旧哈希文件；本次不新增备份，未提交/推送/对外发布。部署前后只读核对7任务关键字段完全相同，未启停/重建容器或写任务/daemon。
- 实际19081已连接4.1.4，只点击A名称时10个任务按钮全禁用；勾选A后全启用；取消A勾选后全禁用且A详情/行高亮保留。只操作本地选择，没有点击写命令。截图`artifacts/toolbar-selection-live.jpg`、三态DOM证据`toolbar-selection-live.json`、归档/部署证据`toolbar-selection-build.json`和`toolbar-selection-release.json`已复制到validation-evidence。用户视觉验收待反馈。
- 无精确本次前一版的新备份；已有before-table-progress-20261115及对应归档可回到56662266…较早快照，会同时撤销矩形进度条和全宽工具栏。先核对既有摘要，再资源先行/入口最后恢复和对应deployment.json，无需改数据或重启daemon。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/toolbar-selection-report npm run test:e2e:docker -- --output=.lab/toolbar-selection tests/e2e/toolbar.spec.ts tests/e2e/selection.spec.ts tests/e2e/operations.spec.ts tests/e2e/detail-dismiss.spec.ts`。四个文件均为mock，已用`--list`核对36项，无real daemon用例。

## 2026-11-15 Logo下统一工具栏

- WorkspaceToolbar只展示并发事件，业务仍由Workspace/operate管理；全宽48px工具栏置于页头下，添加保留文字，常用操作/队列/更多/刷新/设置/列设置使用既有Lucide SVG、翻译aria-label/title，改名单目标才启用。自动刷新开关与2–300秒输入复用原autoRefresh/refreshIntervalMs及单一schedule，无新RPC/schema/计时器。移动端保持单行横滚，预览发现竖滚动条后已明确overflow-y:hidden和细滚动条。
- 66项unit通过；最终生产构建的51项适用三浏览器回归全部通过（`.lab/toolbar-isolated`、报告`.lab/toolbar-isolated-report`）。覆盖工具栏深浅主题、1440/1024/800/390px与强制桌面、键盘可达、列设置、单多目标/忙碌禁用/命令hash、弹窗取消、队列、详情保护、刷新偏好持久化与设置页一致；保留添加/拖放/身份变化/批量取消/选择/列布局/工作流/Tracker/语言回退相关回归。5000条mock冒烟是已有workspace短用例，不是压力长测。
- 中间失败如实保留：初批26通过/10失败，原因是移除按钮字形后添加入口与提交重名导致定位不唯一、resize保留原焦点而未触发重新滚入视区、受控复选框持久化异步断言；修改测试为明确toolbar/dialog范围、先移出再聚焦、点击后等待已提交状态。最终构建初次整批51通过/12失败，12项来自误选未启动的独立四版lab（19091–19095）连接拒绝，未送达任务写入。过滤补跑过早复用正在收尾的临时4187服务，服务关闭导致51项连接失败。最终以独立4189端口、`--grep-invert 'real daemon'`串行运行51项全部通过；不把失败批次或重复执行累计为更多覆盖。trace分别保留toolbar、toolbar-final、toolbar-scoped和toolbar-isolated目录。
- 补跑曾被自动审批以担心选入real daemon写用例为由拒绝；只读`playwright test --list --grep-invert 'real daemon' ...`确认精确51个mock用例后，同一过滤命令获审批执行。没有绕过审批或启动实验daemon。四版协议、同步与数据层未变化，不重跑四版完整业务矩阵/压力长测；13.12性能超预算和DSM真实设备待验保持开放。
- lint、类型/生产构建、format、OpenSpec strict、old/816文件完整性、334.5KiB gzip预算通过。预编译归档SHA-256 `d4b9c9641d809d3b278fffc79b1b4c17d49076847e653a4edb8956eb6a5724c2`，46项归档摘要及37个web文件与dist逐项一致；不增加安装/运行依赖。
- 用户本轮明确授权回归后直接更新19081且无需备份，已按资源先行/入口最后原子替换，保留旧哈希资源；未新增备份、未启停/重建容器、未写daemon或任务。部署前后只读torrent-get核对7任务的id/hash/名称/状态/进度/目录/大小完全一致，A仍做种、其余暂停。实际入口已连接4.1.4，1280px视口工具栏top66/高48/宽1280，main从114px开始，列设置和添加Y相同，无页面横溢出，列设置弹窗可开关，无控制台警告/错误。截图`artifacts/toolbar-live.jpg`；临时4188预览关闭，浏览器临时视口已恢复。
- 证据`toolbar-build.json`与`toolbar-release.json`已复制到validation-evidence。用户视觉验收待反馈；未提交/推送/对外发布。本轮没有精确上一版完整备份；如需回退，可用已存在before-table-progress-20261115及对应归档回到56662266…快照，会同时撤销矩形进度条，先核对摘要再资源先行/入口最后恢复及deployment.json，不清数据库或改任务。

复现：`TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/toolbar-isolated-report npm run test:e2e:docker -- --output=.lab/toolbar-isolated --grep-invert 'real daemon' tests/e2e/toolbar.spec.ts tests/e2e/layout.spec.ts tests/e2e/selection.spec.ts tests/e2e/detail-dismiss.spec.ts tests/e2e/operations.spec.ts tests/e2e/workspace.spec.ts tests/e2e/localization.spec.ts tests/e2e/workflow.spec.ts tests/e2e/trackers.spec.ts`。选取清单可在同命令追加`--list`核对，不启动四版lab。

## 2026-11-15 列表矩形进度条

- 用户要求按旧版截图采用百分比居中的矩形条，适配整个列宽。原progress-cell受100px上限与ellipsis包装限制，实际只约28–40px；现移除该列省略包装及固定上限，20px矩形填满单元格，左右各6px留白。沿用状态配色、以透明度保证深浅主题文字可读。百分比仍两位小数，校验采用原recheckProgress并在title/aria说明，未知无虚假aria-valuenow；进度条点击复用任务行选择，不增加RPC或改变移动卡片。
- 66项unit通过；12项相关三浏览器覆盖通过：6项table-parity在`.lab/table-progress`通过，6项深浅主题矩形专项在`.lab/table-progress-final`通过，均为同一最终生产构建。覆盖0/12.5/50/100/未知/25%校验对90%完成、列宽增大及60px下限、居中/完整文字、列内边界和行点击保留勾选，另有既有20列/拖动/分页/移动边界回归。模拟RPC写入为空。
- 初批6项矩形专项因误把32px虚拟配置当作实际行高而失败；实页对照旧快照和候选均约34.8–35px，原进度单元格22px、新矩形20px。保留现有布局，以实测35px基线验证不额外撑高，6项专项完整通过；未扩大范围调整其他列行高，也不宣称修复了原虚拟配置与实际高度差异。初批失败trace保留，不累计重跑为更多覆盖。
- lint、类型/生产构建、格式、OpenSpec strict、old/816文件完整性、332.7KiB资源预算通过。只有列表进度渲染和局部样式变化，不改领域数值/同步/协议/存储，未重跑四版业务矩阵或压力长测。已有完整表格性能限制与DSM实机待验保持开放。
- 独立4188预览真实7任务：矩形含0/50/100%，列宽120px时条宽108px，拖至220px时条宽208px，文字居中、左右6px留白；已恢复预览列宽。截图`artifacts/table-progress-preview.jpg`，未修改19081浏览器偏好、任务或启停容器。
- 归档SHA-256 `7fe68e0576c93c8182cb06c641b88fc80157b608b98b4a026e9ce78f20e033fe`，46项归档清单通过，37个web文件与最终dist逐字节一致；table-progress-build.json、table-progress-candidate.json（授权前）、table-progress-release.json（授权后）为证据。安装/运行依赖未增加，未对外发布。
- 用户明确授权后，完整备份当前119个静态文件并逐项校验，仅更新19081，资源先行、入口最后原子替换，保留旧哈希资源。实页最终已连接4.1.4并显示7任务，确认0/50/100矩形与居中数字、120px列内108px条宽/20px高度；截图`artifacts/table-progress-live.jpg`。未修改19081列宽/详情高度、任务或daemon设置，A仍做种、其余暂停；未启停/重建容器。临时4188预览已关闭，用户视觉验收待反馈。
- 回退基线`.lab/comparison/backups/before-table-progress-20261115/`，部署信息与文件摘要为同名.deployment.json/.sha256.json。按资源先行/入口最后恢复modern-web并还原部署记录，不清浏览器数据库或删除H，无需重启daemon。

复现：`npm test`；`TWUI_PREVIEW_PORT=4187 TWUI_REPORT_DIR=.lab/table-progress-final-report npm run test:e2e:docker -- --output=.lab/table-progress-final tests/e2e/table-progress.spec.ts`；同构建的表格相关回归为`tests/e2e/table-parity.spec.ts`，采用独立报告/输出目录。

## 2026-11-15 分块全宽与逐格提示

- 按用户三张截图将图移出概览字段值列，独占底部全宽区域；目标18px方格、4px间隔，ResizeObserver自适应列数，设备像素比绘制，保留最多512格。单个Naive UI提示层显示实际大小×两位小数完成率和原始块范围；间隙/末行空白不命中，离开/滚动/resize/数据变化/卸载清理。没有新增RPC、逐块DOM或计时轮询。
- 66项unit（9文件）通过，新增真实范围、尾块大小/字节加权、未知元数据和命中边界。最后不足pieceSize的块不按固定大小高估：例如16KiB+4KiB一格且仅尾块有效，显示20.0KiB×20.00%。
- 最终同一生产构建覆盖24项相关三浏览器用例：15项details/detail-dismiss回归在`.lab/responsive-pieces-final`通过；9项piece-map专项在`.lab/responsive-pieces-settled`全部通过，deviceScaleFactor=2。覆盖全宽/约18px/间隙、完整/部分/缺失提示、resize后命中、滚动隐藏、键盘、390px窄屏、少量方格不被拉大和短尾汇总格。没有将多次重跑累计为更多独立用例。
- 初次19通过/2失败为启动时用即时isVisible误选移动布局；改为按视口等待行。后续末格/resize/焦点失败暴露测试未等待滚动结束且面板过低，夹具通过真实拖动加高并等待两帧布局/滚动事件、键盘前移开鼠标；最终9项专项通过。旧失败trace均保留，不能把中间整批命令标通过。
- lint、类型/生产构建、格式、OpenSpec strict、old/816文件和332.5KiB预算通过。此为局部详情绘制，未改变列表/同步，未重跑无关压力长测或四版业务矩阵；既有表格性能限制和DSM实机待验继续保留。
- 独立候选预览`http://localhost:4188/?lang=zh-CN`复用只读RPC查看真实H，实页确认全宽方格与`128.0 KiB × 50.00%`、分块1601–1608，缩放/滚动后提示清理正常；仅调整4188本地详情高度，不影响19081偏好。截图`artifacts/responsive-pieces-preview.jpg`。
- 预编译归档SHA-256 `566622662191fd70e9821a91e119ecb65a0bf888054ac37a98ed04387726c417`，46个归档文件清单及37个web文件与最终dist逐字节一致；证据responsive-pieces-build.json、responsive-pieces-candidate.json（授权前状态）、responsive-pieces-release.json（授权后部署）。安装/运行依赖未增加，未对外发布。
- 用户明确授权后，已完整备份当前快照103文件并校验，资源先行/入口最后更新19081、保留旧哈希资源，实页确认真实H的全宽与`128.0 KiB × 50.00%`/分块1601–1608提示。截图`artifacts/responsive-pieces-live.jpg`；临时4188预览关闭，截图时调高的19081详情高度已恢复原310px。7任务仍为A做种、其余暂停，未执行任务写入或容器生命周期操作；用户视觉验收待反馈。
- 回退基线`.lab/comparison/backups/before-responsive-pieces-20261115/`，部署记录与全文件摘要为同名.deployment.json/.sha256.json。按资源先行/入口最后复制回modern-web并还原部署信息，不清浏览器数据库、不重启daemon，H独立保留。

复现：`npm test`；`TWUI_PREVIEW_PORT=4187 TWUI_REPORT_DIR=.lab/responsive-pieces-settled-report npm run test:e2e:docker -- --output=.lab/responsive-pieces-settled tests/e2e/piece-map.spec.ts`；相关详情使用相同构建和独立输出目录执行`tests/e2e/detail-dismiss.spec.ts tests/e2e/details.spec.ts`。

## 2026-11-15 详情空白收起与大分块样例

- 用户确认仅点击任务列表空白处收起详情，保护任务行/表头/控件/滚动条，工具栏/搜索/详情/弹窗/菜单不受局部监听影响；补明显“收起详情”按钮。select(null)取消详情请求并清理加载状态，序号保护旧响应，保留checkedIds。没有新增全局blur/visibility/click监听。
- 63项unit（9文件）通过，覆盖关闭后加载/缓存/晚到响应/勾选保留和4096→512格比例。21项三浏览器相关回归通过（detail-dismiss/details/selection）：空白关闭、显式按钮、任务/表头/搜索/详情/更多和弹窗不误关闭，重开、10000文件索引/虚拟渲染、配置失败草稿/晚到保存、移动详情以及3种分块色阶。第一次3项移动测试仍查找旧“Close”按钮而超时，更新为新名称后完整21项通过，不把旧失败隐藏或累计成更多独立用例。
- lint、类型/生产构建、format、OpenSpec strict、old/816文件完整性和331.2KiB资源预算通过。此次是局部交互与样例，不改变分块绘制算法/聚合/轮询，不重跑无关长测或四版业务矩阵，已有表格长测限制仍保留。
- 新H真实Transmission4.1.4核对：64MiB、4096块、16KiB/块、2048块有效、50%、status=0、位图512字节全部符合预期，128个完整格/256个各半格/128个缺失格。原6任务关键字段前后一致。脚本首次added=true，重跑added=false且不校验/重写已有任务；证据piece-preview-created.json、piece-preview-results.json。
- 用户明确授权后已备份并仅更新19081静态资源，37个web文件与最终构建逐字节匹配、归档完整摘要通过；资源先行、入口最后原子替换并保留旧哈希资源，未启停/重建容器或修改原任务。最终本机候选包SHA-256为`dec52d80bd9bc3516833ef857bfe68875cd0a640fecc947f499086379f3c1430`，证据detail-collapse-build.json、detail-collapse-release.json；没有新增目标安装/运行依赖，未对外发布。
- 更新后通过localhost实页确认H的64MiB/4096块/32MiB有效/50%及512格三种色阶与汇总说明；点击搜索框详情保留，点击列表空白及“收起详情”按钮均关闭，重开正常。截图`artifacts/detail-collapse-piece-preview.jpg`。用户视觉验收待反馈。
- 回退备份`.lab/comparison/backups/before-detail-collapse-20261115/`，部署信息与逐文件摘要为同名.deployment.json/.sha256.json。按资源先行、入口最后恢复到modern-web，并还原部署信息，无需清数据库/重启daemon；H独立保留，不随UI回退删除。既有完整表格长测限制、DSM实机待验状态不变。

复现：`npm test`；`TWUI_PREVIEW_PORT=4186 TWUI_REPORT_DIR=.lab/detail-dismiss-final-report npm run test:e2e:docker -- --output=.lab/detail-dismiss-final tests/e2e/detail-dismiss.spec.ts tests/e2e/details.spec.ts tests/e2e/selection.spec.ts`。`node scripts/seed-piece-comparison.mjs`只用于用户授权的H夹具新增/幂等核对，不替换原样例或常规回归。

## 2026-11-15 完整任务列表与底部分页

已实现旧版20个业务列的默认顺序/标题，独立行号与任务ID区分；新增名称状态/警告/错误提示、独立校验进度、单行标签快捷编辑、表头拖动与列设置预设/恢复。追加底部记录范围/页与总页数/跳页/每页条数选择（默认200、最大5000）；切条数回第一页、清勾选并保存，关闭分页继续使用虚拟列表。

旧出厂9列仅在key、顺序、宽度、可见性全部匹配时自动升级，原布局备份在ui.columnsBackup；自定义布局保留，列设置可显式应用旧版完整列表并恢复上一份。v2可选columnPresetVersion防止恢复旧布局后反复升级。列设置以字段key保存，不清标签/目录字典/导航偏好。表格二位精度与合法本地24小时日期，未知日期不显示1970，服务器按主机/有效端口且隐藏秘密参数，Tracker未知人数不假装0。

已验证：
- 61项unit、9文件通过；lint/typecheck（含生产构建）、format:check、OpenSpec strict、legacy816文件和最终330.7KiB JS/CSS gzip预算通过。
- 日期收尾前30项三浏览器相关回归通过（table-parity/layout/selection/migration/localization/navigation）；逐列中文标题另6项通过。最后只调整日期本地格式后，61项unit/生产构建与6项table-parity三浏览器专项再次通过，不把多次同用例累计成更多独立覆盖。
- table-parity覆盖20列表头及顺序、旧布局升级/撤销、0/未知/无穷/服务器端口与秘密参数、校验进度、单行标签入口取消/目标、列拖动/重载、末页201起号、跳页、切条数清勾选、重载条数、5000条虚拟渲染、空结果和移动宽度。窄屏断言等待响应式布局稳定；迁移测试按默认折叠的标签分组操作，不误判数据丢失。
- `node scripts/test-table-fields.mjs`在3.00/4.0.0/4.0.6/4.1.4各自有暂停metainfo夹具核对全部28个列表字段存在及非空Tracker/目录。finally仅按自有hash移除、delete-local-data=false；未操作对照任务。此为非空协议字段覆盖，不冒充四版所有动态状态/远端服务全量实测。

性能证据与限制：
- 性能冻结构建为`.lab/table-final`，摘要table-performance-build.json。初次独立60秒全部预算通过：排序161.7ms、筛选扣防抖150.4ms、增量73.1ms。
- 完整1800秒实际结束，851次增量、61次GC样本、页面错误0，初始243.8ms、增量P95 77.5ms、最大堆50.83MiB、堆增长-1.395MiB。
- **完整长测失败，不能标全项通过**：排序P95 258.2ms、筛选扣120ms防抖后225.4ms，均超200ms。排序断言失败后收尾又报超时，trace已保存在独立`.lab/table-soak-full`，本次没有共享目录清理问题。
- 长测准备阶段与表头专项有短暂并行；排序/筛选采样发生在准备阶段，可能受并行负载影响，但仅凭时序不能证明因果。随后同构建在完全无并行回归时独立60秒复核通过：排序165.0ms、筛选扣防抖143.5ms、增量76.8ms、33次更新、页面错误0。
- 所有结果分别保留；独立短测通过不覆盖或替代完整长测失败。完整长测排序/筛选验收仍保留限制，不再盲目重复30分钟等待。后续验证按改动风险选择，持续聚合/缓存/资源释放变化或短测发现持续异常时才安排完整长测；性能计时必须与其他功能回归串行，报告和trace亦须隔离。
- 实页收尾发现浏览器语言导致美式日期，最终仅把日期改为本地YYYY-MM-DD HH:mm:ss，未再改同步/聚合/行渲染结构。最终构建摘要table-final-build.json与性能构建分列，不声称最终日期收尾包重新执行过30分钟。

可见版本与回退：
- 用户明确授权后已备份并仅更新19081；最终包SHA-256 `336732457a7d5cb28b555ad1defbdfb27cc3109d14c91c30e0c9a618bd637609`，37个web文件与最终构建逐字节匹配，完整清单校验通过。归档仍为本机2.0.0开发候选，无正式发布/版本安装认证新增结论。
- 实页确认全部20列、末列横向滚动可达、行号、modern:8080、日期与底部1–6/第1页/200条及最大5000选项。A仍做种、其他5项仍暂停，未重启/重建/停止compare容器、未写daemon设置或任务。只查看和操作了表头排序/滚动/展开分页选项，最终刷新恢复默认排序和200条。
- 备份`.lab/comparison/backups/before-table-parity-20261115/`及同名.deployment.json/.sha256.json。恢复按资源先行、入口最后，并还原部署信息；用户列布局可用恢复上一份按钮撤销，不清IndexedDB。截图artifacts/table-parity-left.jpg与table-parity-right.jpg。若自定义旧9列仍显示，点击列设置→应用旧版完整列表。
- 已实现与功能检查完成，用户视觉验收待反馈，完整性能验收仍有上述限制，DSM实机保持待验。未提交/推送/对外发布。

复现本轮相关检查：

```sh
npm test
node scripts/test-table-fields.mjs
TWUI_PREVIEW_PORT=4186 TWUI_REPORT_DIR=.lab/table-regression-report npm run test:e2e:docker -- --output=.lab/table-regression tests/e2e/table-parity.spec.ts tests/e2e/layout.spec.ts tests/e2e/selection.spec.ts tests/e2e/migration.spec.ts tests/e2e/localization.spec.ts tests/e2e/navigation.spec.ts
# 性能与上条严格串行；报告/输出独立
TWUI_PREVIEW_DIR=.lab/table-final TWUI_PREVIEW_PORT=4189 TWUI_REPORT_DIR=.lab/table-perf-isolated-report TWUI_SOAK=1 TWUI_SOAK_SECONDS=60 npm run test:e2e:docker -- --project=chromium --workers=1 --output=.lab/table-perf-isolated tests/e2e/soak.spec.ts
```


## 2026-11-15 默认折叠范围调整

缺省仅展开全部任务，其余分组及后代折叠；保留用户显式展开偏好。三浏览器navigation共6项通过，覆盖缺省状态、逐层手动展开、偏好重载和5000节点虚拟渲染/键盘/移动；lint、构建（含类型）、spec strict通过。仅调整缺省策略，未改变聚合/轮询，不重复性能长测。

已备份并更新19081，实页确认全部任务展开、服务器分布/数据目录/数据统计折叠，六任务保持暂停。截图artifacts/navigation-default-collapse.jpg。当前归档SHA-256 `a3a5c0d97c587d4a5ed40840e21e1659292dd6a67fe52fd06e3245af0a3c9eef`，回退快照`.lab/comparison/backups/before-default-collapse-20261115`及同名.deployment.json。原导航长测冻结构建与此缺省值调整后的构建分开记录，不宣称新版重新跑过30分钟。

## 2026-11-15 多级导航增量验收

已实现层级状态导航、Tracker主机/有效端口分组、保存路径前缀树、累计/当前daemon会话五项统计、Lucide图标与键盘/移动导航；移除私有任务节点，保留private字段和既有Logo。展开偏好兼容旧v2并在事务内按节点合并，最多5000项；目录/Tracker分组不暴露announce查询参数。

- lint、typecheck、format:check、生产构建、OpenSpec strict、old/816文件完整性、JS/CSS预算均通过。55项unit（8文件）通过。
- 三浏览器相关24项通过：navigation、selection、localization、layout、migration。包括5000个不同Tracker和目录的可见节点虚拟渲染、父目录范围、计数/去重、展开恢复、方向键/手机无横向溢出；减少动态效果断言也通过。全部模拟RPC，不操作对照任务。
- `node scripts/test-navigation-readonly.mjs`通过3.00/4.0.0/4.0.6/4.1.4真实session-stats字段和导航字段请求，实验实例均为零任务：这证明真实统计/字段兼容，非空聚合和动态变化由独立fixture验证，不冒充四版非空任务人工验收。
- 最终冻结构建为`.lab/navigation-final`，全部非map资源摘要见`artifacts/navigation-final-build.json`。完整1800秒、5000任务/20列/每轮500项，848次增量，61次GC采样、页面错误0：初始255.1ms、增量P95 83.7ms、排序P95 188.2ms、筛选P95扣120ms防抖后175.7ms、堆最大49.31MiB、30分钟增长0.420MiB，报告断言全部达标。
- **完整长测命令退出失败**：并行短回归复用了默认test-results，清理了长测trace文件，结束时browserContext.close报ENOENT。指标已完整写出且原测试性能断言未报失败；随后独立脚本重新校验完整报告所有预算通过（navigation-performance-check.json）。该失败属于测试输出目录冲突，不能写成整条长测命令通过。
- 同一冻结构建另以独立输出目录完成60秒同流程复核，1 passed、33次增量；这只验证独立输出与收尾，不替代上述完整30分钟数据。以后并行运行必须给每次执行设置独立`--output`，HTML报告也应隔离，避免并行报告相互覆盖。
- Release `c1276698e166a4ecc3a1675d200e82a757760f5f730aaae326c5853bafe6688e`：37个web文件逐字节匹配冻结构建；包含SVG/ICO和`licenses/lucide.txt`，没有新增目标安装/运行依赖。JS/CSS gzip 328.6KiB。
- 获用户明确授权后已备份并仅更新19081静态资源。实页验证modern:8080分组为6任务/320.0KiB，多级目录/data/comparison/complete筛选1项，清条件恢复6项；六样例仍暂停，进度100/0/50/50/0/100。截图artifacts/navigation-desktop.jpg。未重启/重建/停止compare容器、未写daemon或样例。
- 备份及回退见local-comparison.md；用户视觉验收待反馈，DSM实机仍待验证。未提交、推送或对外发布。

复现增量检查（需冻结构建和独立输出）：

```sh
npm test
npm run spec:validate
node scripts/test-navigation-readonly.mjs
TWUI_PREVIEW_DIR=.lab/navigation-final TWUI_PREVIEW_PORT=4187 npm run test:e2e:docker -- --output=.lab/navigation-regression tests/e2e/navigation.spec.ts tests/e2e/selection.spec.ts tests/e2e/localization.spec.ts tests/e2e/layout.spec.ts tests/e2e/migration.spec.ts
TWUI_PREVIEW_DIR=.lab/navigation-final TWUI_PREVIEW_PORT=4187 TWUI_SOAK=1 npm run test:e2e:docker -- --project=chromium --workers=1 --output=.lab/navigation-soak-full tests/e2e/soak.spec.ts
```


## 2026-11-15 品牌标识优化验证

本次仅涉及品牌 SVG、CSS 流光和 favicon，不修改业务、RPC 或安装器。历史主矩阵与以下增量验证分别记录。

- `npm run lint`、`npm run typecheck`、`npm run build`、`npm run check:legacy`、`npm run check:size`、`npm run spec:validate` 通过；old/ 816 文件保持完整，全部 JS/CSS gzip 约 322.7 KiB。
- `npm run test:e2e:docker -- tests/e2e/localization.spec.ts tests/e2e/selection.spec.ts`：Chromium / Firefox / WebKit 共 12 项通过，覆盖语言、主题、选择和移动基本交互，使用模拟 RPC，不访问对照任务。该轮针对最初双流光构建；随后单流光修正仅改变 CSS 时序，再次通过生产构建、格式检查与 OpenSpec 校验，未重复无关长测。
- 通过浏览器实际打开 localhost:19081，检查桌面深浅主题、空状态及 390px 移动布局；移动 logo 为 29×29，文档无横向溢出。临时浅色设置已恢复为原先「跟随系统」。六个样例均保持暂停和原进度。
- 实页已加载 prefers-reduced-motion CSS，规则隐藏流光并设 animation:none；本轮未切换真实系统的减少动态效果偏好，因此不声称完成该系统级实测。
- 用户指出双流光同时出现后改为单段交替：最终实页 5,241ms / 49 次采样覆盖 4.8 秒完整一轮，两支箭头均出现过流光，同时可见最多 1 段。证据 `artifacts/brand-single-flow.json`；最新截图 `artifacts/brand-single-flow-header.jpg`。
- `/transmission/web/favicon.svg` 与 `.ico` 实际返回 200，MIME 分别为 image/svg+xml、image/vnd.microsoft.icon；入口使用相对路径，移动跳转入口也声明 favicon。ICO 三图层由 ImageMagick 开发期预生成，目标安装运行不依赖该工具。
- 最终预编译包 SHA-256：`6c9c90d05a32c832baa1d38f4ed9099d9aa1dbfdc0f61c4559f610df1193ad1f`。归档内清单全部验证，36 个 web 文件与运行快照逐字节一致，旧哈希资源额外保留供已打开页面读取。证据 `artifacts/brand-release-verification.json`。
- 运行快照更新已获得用户明确授权；备份、回退见 local-comparison.md。本轮不重启容器、不跑会变更样例的 test:compare，不重复四版协议、安装器或 30 分钟性能验证；DSM 实机仍待验证。

日期：2026-11-15（Asia/Shanghai）。主要功能与本机验证已完成，当前交付开发候选；SynoCommunity 4.1.4-32 条件式 XDG 接入已完成本机验证，DSM 实机验收保留待办，OpenSpec 尚未归档。以下是实际执行结果，不以测试文件存在代替通过。

首轮完整 Git 交付同时保存了 [精简 JSON 实测证据](validation-evidence/README.md)；完整日志与运行数据仍留在本机忽略目录。

## 最新结果

| 检查 | 实际结果 | 证据与范围 |
| --- | --- | --- |
| lint / 类型 / 生产构建 | 通过 | `npm run check`；最终构建用于三浏览器与短时性能复核 |
| Vitest | 49 项、7 文件通过 | RPC 11、领域 5、分片 2、设置 6、工作流 9、Pinia 15、文案完整性 1 |
| 三浏览器综合回归 | 78 项通过，6 项按条件跳过 | Chromium / Firefox / WebKit 各 26 项；规模专项独立执行，不计入这里通过数 |
| 真实 RPC | 3.00 / 4.0.0 / 4.0.6 / 4.1.4 全部通过 | `artifacts/rpc-results.json`；握手、文件索引/优先级、Tracker、定位/移动/校验、重命名、启停/删除、会话限速 |
| 认证 | 4.0.6 / 4.1.4 401 后显式 Basic 凭据通过 | 实验端口 19094/19090；生产凭据只存页内内存 |
| 真实本地下载 | 四版通过 | `download-results.json`；本地 Tracker + seeder，URL 添加，1MiB 内容 SHA-256 一致 |
| 真实任务控制 | 四版通过 | `controls-results.json`；magnet 接受、四方向队列、任务限速读回、start-now/stop、reannounce 接受 |
| 真实目录匹配 | 四版通过 | `match-results.json`；partial 等待/后项继续/下一候选；取消不送后项；恢复原目录并等校验结束 |
| 真实诊断 | 四版通过 | `diagnostics-results.json`；本地 blocklist 更新、free-space；配置在 finally 恢复 |
| 稳定真实 5,000 任务 | 通过 | 全部 status=0 且 metadata 完整；浏览器虚拟渲染 15 行，无页面错误；fixture 已清理 |
| 可控性能长测 | 完整 1,800 秒通过 | `soak-1800.json` 与冻结构建摘要 `soak-baseline-build.json` |
| 最终构建短时复核 | 60 秒通过 | `soak-60.json`，33 次实际增量；不冒充最终构建的 30 分钟长测 |
| JS/CSS 资源预算 | 总 gzip 322.1KiB，通过 | `bundle-size.json`；包括全部懒加载和语言分块，比首屏范围更大的上界，预算 800KiB |
| 本机安装器故障注入 | 通过 | `test:installer`；安装/升级/回退/卸载、CLI 优先级、锁、异常路径/摘要/链接/未校验文件拒绝 |
| BusyBox 离线部署 | 最终包通过 | 无网络且无 Node/Python，完整静态包、非 root、只读父目录、新容器读取、服务用户正反例 |
| 运行中 daemon 切换 | 最终包通过 | 4.0.6、UID 12345、只读父目录；A→B→回退 A，无需 daemon 重启；RPC 409/会话头 |
| 双路径反向代理 | 三浏览器通过 | `/ui/`→`/rpc` 与 `/nas/transmission/web/`→`/nas/transmission/rpc` |
| OpenSpec strict / legacy | 收尾复核通过 | `old/` 816 文件，无新增/变更/链接；不修补旧框架 |
| SynoCommunity 接入 | 4.1.4-32 本机模拟通过 | 真实 4.1.4、固定上游启停脚本、BusyBox 1.35；XDG 接入/恢复、真实进程核对、完整资源、拒绝分支及持久化卷重建 |
| DSM 实机 | 待验证 | DSM 7.1、型号原文 DS928、SynoCommunity 4.1.4-32；完整型号/build/架构、实际进程环境、ACL 和生命周期证据待补 |

本轮日志已保存在 `artifacts/*-final.log`，结构化汇总为 `artifacts/validation-summary.json`（含最终资源和归档 SHA-256）。验证结束已执行 `lab:down`，实验镜像和数据卷保留，恢复实验先 `npm run lab:up`。

## 环境与复现

主机 Linux amd64、i5-14600K、20 逻辑 CPU、约 62.5GiB RAM。Node 26.13.1、Docker 29.9.3、Compose 5.7.1。镜像来源与源码固定提交见 [进度记录](implementation-progress.md)；所有实验端口仅映射本机回环，使用自有种子/目录。

```sh
npm ci
npm run lab:up
npm run check
npm run format:check
npm run spec:validate
npm run test:rpc
npm run test:download
npm run test:controls
npm run test:diagnostics
npm run test:match
npm run test:synocommunity
```

下载/匹配/诊断脚本会准备 fixtures profile。三浏览器代理场景先启用 proxy；生成 release 必须在构建完成后：

```sh
docker compose -p twui-lab -f lab/compose.yaml --profile proxy up -d --no-build proxy
TWUI_PROXY=1 npm run test:e2e:docker -- --workers=3
npm run release
npm run test:installer
npm run test:deployment
npm run test:release:live
```

Playwright 固定官方镜像为 `mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579`，提供 Fedora 本机缺失的 WebKit 库，使用宿主 UID。该脚本的 host 网络适用于本机 Linux 实验。BusyBox 固定 `busybox:1.37.0@sha256:a7dbc319b1438115a207e11930dc4bb3e643dcb3ec0bdd694bb36cd8fad289ec`，部署测试使用 `--network none`。

构建与浏览器读取必须顺序执行；不能边重写 dist 边测试。此前并发构建造成暂态空页，顺序执行后通过。长测冻结构建，后续候选在独立目录/端口构建和验证；报告分别记录，不混用。

## 5,000 任务性能结果

| 指标 | 完整 30 分钟冻结构建 | 最终构建 60 秒复核 | 预算 |
| --- | --- | --- | --- |
| JSON 解析后到两帧的初始渲染 | 235.4ms | 227.4ms | ≤1,000ms |
| 500 项增量 P95 | 68.6ms | 66.7ms | ≤150ms |
| 排序 P95 | 152.3ms | 163.1ms | ≤200ms |
| 筛选 P95，含 120ms 防抖 | 280.2ms | 254.7ms | 防抖另记 |
| 筛选 P95，扣除配置防抖 | 160.2ms | 134.7ms | ≤200ms |
| GC 后最大 JS 堆 | 47.26MiB | 47.37MiB | ≤200MiB |
| 对齐 GC 后增长 | 0.516MiB / 30min | 0.155MiB / 60s | 30min ≤20MiB |
| 实际增量次数 | 854 | 33 | 如实记录 |

数据为 5,000 任务、20 个业务列、每轮 500 项变化，刷新间隔配置 2 秒。调度是请求完成后再等待，不声称 1,800 秒恰好 900 次更新。渲染计时从 JSON 已解析至两次 requestAnimationFrame，排除网络；排序/筛选含输入处理和两帧，筛选另报告原始值与扣除配置防抖值。堆每 30 秒经 CDP 显式 GC 后采样，不代表浏览器进程 RSS。

长测构建与最终构建不同：后续增加写后界面保护、批量取消、Tracker 失败重读和格式化；长测资产摘要单列，最终构建使用同流程 60 秒复核。生产轮询/实体更新策略没有在此后更改。原始 JSON 和日志保留，后续性能路径变更需重新完整长测。

复现可控长测（默认 1,800 秒，不能用短测代替）：

```sh
TWUI_SOAK=1 npm run test:e2e:docker -- --project=chromium tests/e2e/soak.spec.ts
# 最终构建短时复核入口
TWUI_SOAK=1 TWUI_SOAK_SECONDS=60 npm run test:e2e:docker -- --project=chromium tests/e2e/soak.spec.ts
```

真实 daemon 规模独立复现：

```sh
npm run lab:seed -- --count 5000 --port 19093 --settle-paused
TWUI_REAL_SCALE=1 npm run test:e2e:docker -- --project=chromium tests/e2e/performance.spec.ts
npm run lab:seed -- --clear --port 19093
```

`--settle-paused` 仅对映射到本机实验端口的服务做正常停止/启动，让 daemon 完成已排队初始校验状态的持久化并核对全部暂停。添加时 paused=true 本身不保证初始校验队列结束。稳定结果见 `stable-5000-daemon.json`；一次真实 Chromium 样本：导航到行可见 424.7ms、筛选含防抖及自动化等待 216.1ms、使用堆 58.58MiB、15 行 DOM，无页面错误。此单次样本与可控 P95/长测分别解释。

`.lab/seed-19093.json` 只记录自有 hash，清理同时校验名称前缀，当前 manifest 已空。前轮初始校验队列下移除较慢，曾按 manifest 离线清理自己的记录；本轮使用稳定暂停基线后通过 RPC 完成全部清理，没有删除其他任务或实验卷。10,000 文件用三浏览器验证虚拟渲染、筛选后原始 RPC index；分片图保持最多 512 画布单元。

## 行为追踪与三浏览器范围

| 历史行为/风险 | 新框架验证 |
| --- | --- |
| B01/B02/B03/B10 | 空快照可用；增量新实体补齐；失败保留缓存和错误；恢复清 stale |
| B08/B09 | 刷新峰值并发 1；HTTP/auth/protocol/business/network/timeout/cancelled 均结算；409 有界，写失败不自动重发 |
| B11 | session 身份变化、旧 generation 快照、晚到详情和成功保存；捕获身份变化拒绝删除；空目标不发命令 |
| B06/B07 | 数值与标签/Tracker 排序；同长度 Peer 内容变化更新；列布局顺序/宽度/可见性持久化 |
| B04/C08 | 真实四版 Tracker 参数；批量预览不写；外部更改冲突；3.00 多步部分失败后重读且不重试写 |
| B05/B12/C02 | URL/文件/magnet、无效 metainfo 后续继续、最后成功标签、重复独立结算；一次性目录不变默认值 |
| C01/C06/C07 | 稳定标签 ID/hash、说明/颜色、悬空索引报告、字典独立导入、事务/跨页同步、endpoint 隔离 |
| C03/C10 | 实际校验等待；partial 后继续其他项；下一目录、超时、取消、恢复后校验；保存作业不自动重放 |
| C05/C11 | wanted number/boolean；名称 HTML 只作文本；启动无第三方请求，手动服务失败可重试 |
| I01–I04 | 归档安全与全文件摘要、目标边界、失败不切换、升级回退/非 root/离线 BusyBox、运行中 daemon 切换 |

每个浏览器 26 项：规模安全文本 1、四版真实添加/详情/删除 4、选择/Shift/右键与移动布局 2、详情/10,000 文件/草稿竞态 3、迁移备份重置 1、添加/身份确认/取消 3、设置跨页/独立 daemon 差异/手动服务/诊断 3、16 语言与异步语言/主题 2、列布局 1、Tracker 批量 1、移动真实 4.0.6/4.1.4 旧入口流程 2、双路径代理 2、匹配窗口重开/partial/恢复 1。语言测试遍历全部 16 个选项并检查回退；不等价于第三方人工完成全部语言校对。

## 真实版本差异与安装边界

| 项目 | 3.00 | 4.0.0 | 4.0.6 | 4.1.4 |
| --- | --- | --- | --- | --- |
| RPC 版本 | 16 | 17 | 17 | 19 |
| wanted JSON | number | boolean | number | number |
| 重复添加 | torrent-duplicate | business: duplicate torrent | torrent-duplicate | torrent-duplicate |
| Tracker 更新 | 扁平位置/URL 对，删除后重编号 | trackerList | trackerList | trackerList |

3.00 先替换后删除/新增，依据 [该版 rpcimpl.c](https://github.com/transmission/transmission/blob/3.00/libtransmission/rpcimpl.c) 和真容器；其他 3.x 衍生版需扩展实测，不推断所有分支相同。4.0.0 若重复错误未返回身份，报告重复但不擅自修改标签。真实校验/移动测试同时核对最终数据内容，reannounce 只声称命令已接受，不保证远端 Tracker 在线。

3.00 原 daemon 在 OpenSSL 3 的 Peer 加密场景曾退出 139；仅实验容器启用 default/legacy provider 后下载通过，保留官方源码。此实验适配不进入 release、不要求 NAS 改加密环境；上游补丁背景见 [Debian Transmission 3.00 补丁记录](https://sources.debian.org/patches/transmission/3.00-2.1%2Bdeb12u1/)。

安装器采用受管理目录、相对链接和标准 mv 能力探测，无 mv -T 前提；GNU/BusyBox 均执行回归。发布包包含安装、迁移和群晖说明，全部在内部 SHA256SUMS 中校验，不含 sourcemap、旧工程、node_modules 或实验 Python。外层摘要与完整包位于 artifacts。安装不会替用户修改 daemon 启动脚本或自动重启服务。

## 依赖审计与未完成事项

开发依赖更新至 Vitest 5.1.0 等兼容版本，先前 critical/high 告警已消除。`npm audit --omit=dev --json` 生产依赖漏洞数为 0。兼容范围内 `npm audit fix` 后仍有 11 项 moderate 开发依赖链告警，涉及 typescript-eslint/minimatch 和 Vue Test Utils/js-beautify/glob/editorconfig；当前未应用 audit --force 提议的依赖降级。它们是实际保留项，不写成全依赖零漏洞。审计是本次联网运行时快照，后续发布前重新核对。

DSM 已提供双路径说明、只读工具/实际服务账户可读性预检和本机正反例；用户已确认 SynoCommunity 4.1.4-32，已补齐真实进程核对后的 XDG 接入和本机上游脚本模拟；尚缺实际 DSM 的有效进程环境、ACL、NAS 重启、套件升级和容器重建记录。型号仅按用户输入 DS928 保存，不推断其他型号/架构。Linux Docker 通过不能代替这些证据。详见 [群晖说明](synology.md)。

正式验收前保留主变更未归档；当前未发布到外部，也未操作真实 NAS。完整规格和实现入口见 [追踪矩阵](traceability.md)。

## 用户定版 SynoCommunity 4.1.4-32 的新增证据

用户补充版本后新增真实 4.1.4 镜像（固定 `a6d907d9ea2313143af714d7830feb6c1b60b84c`，端口 19095）及认证实例（19090）。四版重新执行 RPC/下载/控制/匹配/诊断，4.1.4 保留旧 RPC，实测版本 19；详见各 results.json。三浏览器新增该版本的桌面与移动流程，最新 78 通过、6 专项跳过。生产前端资源与上一轮性能复核构建相同，本轮改动是实验矩阵、安装接入与文档，没有改渲染/同步代码，因此没有重复完整性能长测。

`test:synocommunity` 固定上游 `5e012dab21d616c9f5a41dabab755caf73b660aa` 的 start-stop-status 和 package service-setup，生成通用变量前缀，以真实非 root sc-transmission 启动真实 4.1.4。使用 BusyBox 1.35 静态工具执行接入脚本，版本夹具包含全部预编译前端资源（排除 sourcemap），核对生产入口与 JS 内容摘要。测试中只给自己的容器设置账户与持久化卷，不修改宿主账户或 NAS。

已验证只读身份/环境检测、PID 拒绝、实际服务账户要求、已有非受管 XDG UI 拒绝、幂等接入、运行中 UI 升级与回退、注册未解绑卸载拒绝、新容器重装上游脚本后接入保留、不支持修订号/Web 环境覆盖/临时 XDG 路径拒绝、外部改动链接拒绝删除、解绑重启恢复原 UI 与 RPC 握手。供应方脚本和原 UI 摘要前后保持一致；这些 Error 行是预期拒绝测试，最终结果以脚本退出和 synocommunity-results.json 为准。

实验 Dockerfile.synocommunity 中的 Bash/procps/静态 BusyBox 用于运行上游脚本与忠实回收进程，不进入 release；正式安装器另使用官方 BusyBox 1.37 在无网络、无 Node/Python 环境验证。真实 DSM 的实际账户 HOME/XDG/ACL 可能不同，适配器检查失败时不会改目录或尝试写供应方脚本；NAS 按 synology.md 先做 inspect，再决定 attach。完整设备证据未取得前主 OpenSpec 仍不归档。

## 本机双端口人工对照环境

用户在本轮要求实际部署旧 UI 与重构 UI。twui-compare 使用 19080 / 19081 两入口，共享独立真实 4.1.4。旧源码 old/src 只读；新端使用通过外层/资源摘要检查的预编译 Release 快照，不受随后 dist 重新构建影响。旧版只经已有配置项调整默认全部任务/中文与本地自动更新空结果，未修补旧代码。old/ 816 文件检查继续通过。

新增独立 Playwright 配置 playwright.compare.config.ts，三个浏览器真实打开两端：核对共同任务、RPC 19、从新端开始、等待旧端真实轮询后勾选暂停，观察两边状态；收尾恢复暂停。测试期间发现旧版“看详情”和“勾选操作”本来就是不同状态，且旧端按钮根据已刷新的状态启用，测试按其真实交互等待，不修改 old/。结果/截图见 artifacts/comparison-*，不计入重构主矩阵的 78 项。

compare:check -- --restart-check 对同一 daemon 临时修改一个连接数参数、正常重启后从两入口读回，并恢复原值，验证对照配置不是每次启动都重置。原实验入口保持原默认行为；compare 通过 TR_INITIAL_SETTINGS_ONLY=1 启用持久化启动模式。两个 UI 均为非 root 静态代理，daemon 不向宿主单独暴露端口；只发布本机 127.0.0.1:19080/19081。

现有六个本地样例的真实进度为 100%、0%、50%、50%、0%、100%，均暂停；文件和 config 保存在 twui-compare 卷。另提供未添加的 G 文件/URL。重置只按自己 manifest 的 hash 移除和重建样例，不删其他任务。人工核对项目见 local-comparison.md；空 Peer 数据不代表所有 Peer/外部服务功能已经实际逐项测试。

本轮保留 twui-compare 运行供用户比对，仅停止 twui-lab。截图和当前部署/摘要信息在 artifacts/comparison-results.json、.lab/comparison/deployment.json。不要将本机代理和实验 Python 当作 NAS Release 的额外运行依赖。
