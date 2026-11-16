# 已执行验证的证据快照

三个设置问题优化：settings-state-build/validation/release/live.json记录冻结43资源、69有效三浏览器及静态检查、无备份19081切换/52摘要/7任务和参数及容器保持、实页最近常规模式/保存禁用；settings-state-runtime-{3.00,4.0.0,4.0.6,4.1.4}.json为4项真实针对性场景，runtime-environment核对专用临时环境清理与对照完全相同。F1/F2已修复；4.0.0为风险处理及两端关闭uTP的新TCP限速对照，不宣称内核修复或全量封板。旧settings-effects为修正前历史审计。

设置真实效果审计：settings-effects-audit.json汇总主运行1通过/3失败及未覆盖项；settings-effects-{3.00,4.0.0,4.0.6,4.1.4}.json保留实际UI提交及传输/队列/停止/定时字节差；4.0.0-diagnostic为另一轮连续20秒超速采样，alt-upload为4.1.4计划时段上传补充，environment核对对照任务/daemon参数/容器保持。两项前端状态问题尚未修复，不能标记四版完整封板；详见../settings-effects-audit.md。此次没有业务代码、构建或19081更新。

设置统一深色本轮：settings-contrast-build（同一43冻结资源）、settings-contrast-validation（63既有+最终9新增=72有效三浏览器、实际全类型/禁用/焦点/动态深浅与设置外隔离，列明中间测试修正和精确RO通知边界）、settings-contrast-release（52摘要/HTTP、7任务/daemon/容器保持、无部署备份）、settings-contrast-live（未聚焦的语言/刷新/分页实页颜色和尺寸），截图artifacts/settings-contrast-live.jpg。

设置紧凑同行本轮：settings-compact-build（最终43冻结资源）、settings-compact-validation（最终63三浏览器和几何/单位/依赖/大值/主题语言断点范围，不累计初稿报告）、settings-compact-release（52摘要/HTTP及7任务/daemon/容器保持、无部署备份）、settings-compact-live（缓存4的160px同行及带宽7值控件对齐）。实页截图artifacts/settings-compact-basic-live.jpg和settings-compact-bandwidth-live.jpg。

路径框边界/深色本轮：settings-path-build（43冻结资源）、settings-path-validation（54有效三浏览器及6项时序断言替代关系、无关测试未重跑）、settings-path-release（52摘要/HTTP和7任务/daemon/容器不变、无部署备份）、settings-path-live（实页标题不触发/框内打开/外部关闭及深色颜色），截图artifacts/settings-path-live.jpg。

设置旧版分类本轮：settings-build（最终冻结43web）、settings-release（52摘要/HTTP/7任务与daemon设置及容器不变/无部署备份）、settings-validation（19unit/最终69三浏览器与中间候选替代关系）、settings-compatibility（四版隔离真实读回）、settings-live（19081七分类和底部可达的只读界面观察）。截图在artifacts/settings-live.jpg及settings-transfer-live.jpg。旧版额外设置新增偏好暂缓，DSM实机仍待验。

名称模糊搜索：name-search-build/release/validation/live.json记录冻结43web/52摘要、16相关unit/37有效三浏览器/2性能采样跳过、无备份更新19081与7任务/容器不变、实际C/目录hash排除/多词/清空；name-search-model-performance.json为本机Node领域5000筛选+排序P95约54.27ms（无DOM/防抖），name-search-browser-performance.json为Chromium输入到绘制P95约261.40ms（含防抖）。首轮新增6项测试问题与最终替代报告明确分列，不复用历史通过数或声称长测/DSM通过。

页头副标题：brand-subtitle-build/release/validation.json记录8px→10px的冻结构建、6项现有三浏览器布局回归及无备份19081切换、43web/52摘要与任务/容器不变；截图artifacts/brand-subtitle-live.jpg。未把此前关于回归计入本轮通过数。

关于文字修正：about-typography-build/release/validation.json分别记录15px/正常正文色最终构建、无备份19081切换与43web/52摘要、24项本轮三浏览器及实页截图；旧about-*证据仍表示文字修正前一轮，不冒充本次重跑。

关于入口增量（2026-11-16）：about-build.json为冻结43web与350.6KiB资源；about-validation.json记录关于24/主题工具栏状态栏36/最终语言6共66有效场景及首报告历史语言失败与最终替代报告；about-release.json记录完整52项归档摘要/43web实际HTTP摘要、无备份授权直接更新19081、7任务和容器启动/重启计数不变；about-live.json为真实4.1.4/RPC19中文弹窗及截图入口。不把受控版本显示当四版daemon业务重验，DSM和13.12保持待验。

日期：2026-11-15（Asia/Shanghai）。为首轮完整 Git 交付保留的精简 JSON 证据。测试源码和复现命令见 [验证记录](../validation.md)，运行中的双入口见 [本机对照](../local-comparison.md)。这些文件是已执行结果，不是每次提交自动生成的 CI 结论。

- validation-summary.json：49 项 unit、主矩阵 78 项浏览器、额外 3 项新旧 UI 对照、四版 daemon 与归档摘要；保留 DSM 实机待验。
- rpc/controls/download/match/diagnostics-results.json：真实 3.00、4.0.0、4.0.6、4.1.4 的协议、控制、下载、目录匹配和诊断。
- synocommunity-results.json：4.1.4-32 的真实 daemon/上游脚本/BusyBox 本机模拟，不能替代 DSM 实机认证。
- stable-5000-daemon.json、real-5000-browser.json：真实稳定暂停规模及单次浏览器样本。
- soak-1800.json 与 soak-baseline-build.json：完整 30 分钟冻结构建的指标和资产摘要；soak-60.json 是后续最终前端构建的短时复核，不能混为同一构建长测。
- bundle-size.json：全部 JS/CSS gzip 上界。
- live-release-results.json：运行中 daemon 升级/回退。
- comparison-results.json、comparison-containers.json：两个端口共享后端、设置重启保留和当时健康状态；容器实时状态以实际运行结果为准。
- production-audit.json：当时生产依赖审计快照；开发依赖仍有 moderate 告警，范围见验证记录。

完整日志、截图、归档和实验数据保留在本机忽略目录 artifacts/、.lab/；可由已提交脚本重建，不把下载数据或开发依赖纳入 Git。后续优化需要重测时保留测量口径和构建对应关系。

导航增量：navigation-rpc-results（四版零任务只读统计/字段）、navigation-soak-1800（完整指标，原runner收尾失败）、navigation-performance-check（独立断言核对）、navigation-final-build（冻结构建摘要）、navigation-release-verification（当前归档和回退快照）。不能把数据断言通过误写为原长测命令通过，详见validation.md。

完整表格/分页增量：table-fields-results（四版非空28字段）、table-final-build与table-performance-build（最终日期收尾/性能冻结构建分别摘要）、table-soak-60与table-soak-isolated-60（独立短测通过）、table-soak-1800与table-full-budget-check（完整排序/筛选预算失败）、table-release-verification（当前包与回退备份）。完整长测失败不能被短测通过覆盖；可能的并行干扰与性能验收开放项见validation.md及OpenSpec任务13.12。

详情/H样例增量：piece-preview-created为首次新增/真实校验，piece-preview-results为已存在H只读幂等核对，保留原任务未变/暂停/4096位及文件占用；不把样例校验当作四版协议全矩阵。detail-collapse-build为最终构建37文件摘要，detail-collapse-release为已授权19081静态更新/归档匹配与备份记录；实页检查和回退见validation.md最新条目。

分块全宽增量：responsive-pieces-build为最终37文件摘要；responsive-pieces-candidate记录授权前归档全清单/构建匹配、66项unit和24项相关三浏览器独立覆盖，保留本轮未跑长测的边界；responsive-pieces-release记录获明确授权后19081更新及103文件回退备份。实页截图和回退见validation.md。

矩形进度条增量：table-progress-build为最终37文件摘要，table-progress-candidate为授权前完整归档校验、66项unit与12项相关三浏览器覆盖；table-progress-release记录已获明确授权后19081更新和119文件回退备份。本轮未跑压力长测，实页截图及回退见validation.md。

- `toolbar-build.json`：最终静态资源37文件摘要；`toolbar-release.json`：完整归档校验、51项mock三浏览器回归、实际19081宽度/位置/控制台/7任务不变及用户授权无额外备份的部署记录。中间失败与排除四版lab的原因见validation.md；本轮不代表四版完整重验或性能限制已解决。

- `toolbar-selection-build.json`、`toolbar-selection-release.json`、`toolbar-selection-live.json`：工具栏仅勾选可操作的构建/36项mock浏览器回归/19081部署与仅详情→勾选→清空勾选的实际按钮三态证据；沿用本次直接更新无额外备份授权，7任务关键字段不变。

- `verify-icon-build.json`、`verify-icon-release.json`：校验数据库放大镜图标的37文件摘要、12项mock三浏览器回归、19081静态部署/实页图形与7任务不变证据；未新增备份，未执行真实校验。

- `verify-confirmation-build.json`、`verify-confirmation-release.json`：重新校验确认的最终构建、42项mock三浏览器/66项unit、19081只打开取消确认及7任务不变的部署证据；`verification-daemon-results.json`：四个独立无网络/端口/共享挂载的一次性daemon对自有两分块数据损坏50%→修复100%的真实校验，已全部清理，不涉及对照任务。

- `bulk-refresh-build.json`、`bulk-refresh-release.json`、`bulk-refresh-live.json`：更多三项批量/自动刷新禁用与实际周期核对，70项unit与最终63项mock浏览器、19081静态更新/只打开取消7任务全局确认/恢复原刷新偏好的证据，未执行真实全部启停。

- `column-settings-cleanup-build.json`、`column-settings-cleanup-release.json`：移除成对列布局预设入口的36文件摘要、9项现有mock浏览器回归、19081实页底部与7任务不变的静态部署证据，无布局重置。

列设置开关优化（2026-11-16）：column-dialog-build.json为冻结36个web文件摘要；column-dialog-transitions.json为最终三浏览器实际transitionrun数据（进出卡片/遮罩均opacity/0.12s）；column-dialog-release.json记录归档/部署、7任务未变和实页只读核对。最终36项mock回归报告`.lab/column-dialog-verified-report`，不代表压力预算或DSM实机通过。

布局主题（2026-11-16）：themes-build.json为冻结36个web文件摘要；themes-geometry.json为四主题×两明暗在三浏览器的实际区域几何；themes-live.json为localhost实页四布局/键盘选择/明暗刷新保持和偏好恢复记录；themes-release.json为离线归档/部署及7任务未变。最终63项mock报告`.lab/themes-final-report`，72unit通过，不代表压力长测、四版协议重验或DSM实机通过。扩展规范见docs/theme-design.md。

theme-footer-build/release/live.json：左下明暗入口横排的冻结资源、部署及实页几何（文字/按钮中心y686、唯一按钮）；18项三浏览器mock在`.lab/theme-footer-report`，无压力/四版重验或偏好编辑。

visual-skins-build/release/metrics/live.json：最终视觉皮肤静态资源、部署、三浏览器真实控件/Portal样式和localhost实页四家族不移布局/独立保存/偏好恢复。82unit通过；核心72项三浏览器在预览按钮填充修正之前，最终构建再验12项视觉专题（含32组合和预览与实页填充一致）。不混淆构建或将局部回归当压力/四版/DSM通过。规范docs/theme-design.md已重写三层设置。

search-contrast-build/release/metrics/live.json：暗色搜索框最终静态资源/部署、三浏览器四皮肤背景/框线/占位色以及实页Cupertino暗色截图参数；6项mock见`.lab/search-contrast-final-report`，对比度阈值3/4.5，不是压力或四版协议/DSM证据。

statusbar-build/release/metrics/live/rpc/live-rpc.json：全宽状态栏冻结资源、离线部署/任务不变、三浏览器96组样式几何、localhost实页、四个全新离线daemon的速度0/空间与statvfs相等，以及对照4.1.4默认/data真实空间只读核对。87unit；39相关回归于`.lab/statusbar-final-report`（仅相关4文件），9最终专题于`.lab/statusbar-focused-report`；首轮状态栏测试定位失败不计通过。没有真实非0流量或DSM实机验收、没有本轮长测或新回退备份。

size-unit-build/release/live.json：总大小单位简写的冻结36web摘要、45归档摘要/19081部署和实页KB/MB核对；5相关unit、6项三浏览器table-parity于`.lab/size-unit-report`，无RPC/长测重验，7任务不变。

file-pagination-build/release/live/validation.json：最终文件分页底栏的冻结36web/45归档摘要、19081部署/7任务不变、实页D三文件与62.8px底栏、92unit/42三浏览器验证范围；报告`.lab/file-pagination-release-report`。candidate-build/release为125px宽度修正前中间构建，不与最终构建混写；不代表后端分页、四版真实写入、长压力或DSM实机验收。

torrent-config-cancellation.json记录3.00隔离实例seedIdleLimit0请求成功/回读仍17及按用户条件取消；不代表四版全部不兼容/全部通过，其他版本和后续阶段未继续。remove-task-config-build/release/live/validation.json是最终移除任务配置tab/表单/专用读取、保留四页与全局设置共用CSS的37web/46归档摘要、19081实页与92unit/48三浏览器证据；报告`.lab/remove-task-config-verified-report`。candidate文件仅为公共样式恢复前中间版本；无对照任务写入、无长压力/DSM实机结论。
