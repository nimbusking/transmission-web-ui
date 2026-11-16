# OpenSpec 与实现追踪

设置真实效果审计F1/F2/F3→SettingsDialog响应式initialDaemon、既有会话watch同步未编辑备用模式、独立实际状态/过期提示及4.0.0/uTP定向风险和仅暂存关闭→OpenSpec settings-migration保存/实际模式与uTP风险需求、tasks39→69有效三浏览器与独立真实四版本4场景；4.0.0新TCP限速及4.1.4分钟级实际传输/勾选跟随/草稿保留已测，settings-state系列证据与19081只读实页截图。4.0.0内核问题与38.5其他矩阵仍开放，不覆盖先前审计的历史失败。

设置深色数字/下拉缺少边框的再次反馈→D35仅路径覆盖遗漏及Naive暗色组合默认透明/弱边框确认→SettingsDialog.settingsAppearance与abstract局部NConfigProvider统一Input/数字/下拉/时间/标签peer→OpenSpec settings-migration统一深色需求、D37/tasks37→9项最终新增外观（三浏览器四皮肤/所有类型/default/disabled/focus/popup/动态深浅/设置外隔离）+63相关设置布局迁移路径，合计72有效同一构建。settings-contrast-build/release/validation/live证据及未聚焦偏好实页截图。

设置页小参数臃肿反馈→全量审视服务端16数字/加密及三个现有短偏好、已启用依赖组合→SettingsDialog.fieldRows与compactField/compactUnit、style.css局部同行/统一起始列/窄屏→OpenSpec settings-migration同行需求、D36/tasks36→settings-parity新增几何/单位/依赖/大值/中英文断点测试，连同既有设置、路径边界/对比度和迁移回归。长路径/URL/脚本/多行内容维持宽度，旧版额外设置新增项仍暂缓。

路径输入框截图反馈→19081实页label整行空白命中/深色同底色复现→SettingsDialog路径aria-labelledby与局部AutoComplete peers.Input深色覆盖→OpenSpec settings-migration边界/对比度需求、D35/tasks35→settings-path新12有效场景及相关42场景（54合计）、实页框外0/框内打开/框外关闭与普通深色值；settings-path-build/release/validation/live证据。不新增RPC或持久化。

旧版分类与标签/分类交换（2026-11-16，旧版额外设置新增选项暂缓）→ SettingsDialog、domain/settings-layout、services/settings-transfer、SettingsRepository分类事务与store.removeLabels → OpenSpec settings-migration新增分类/交换需求、design D34、tasks34 → settings-transfer unit和settings-parity/settings/migration及相关工具栏三浏览器、test:settings四版隔离真实读回。用户指定旧分类优先；保持现有界面偏好和高级手动服务，导航/右键行为不变。最终构建、结果、部署与DSM边界以validation.md及settings证据为准。

仅名称多关键词搜索→ domain/name-search.ts及selectTorrents、中英文提示→ torrent-browser查询和列布局中的名称AND模糊/实时清空场景、OpenSpec33节→16相关unit及37有效三浏览器（2性能采样跳过）、5000领域与浏览器短测、19081C/目录hash排除/多词/清空实页，name-search证据。保留原导航/排序/分页/勾选/详情，文件详情过滤不改；不把短测或mock当13.12/四版daemon/DSM实机结案。

关于文字验收修正→ AboutDialog局部15px/正常正文色及about.spec实际computedStyle断言→ localization-theme关于可读性场景/OpenSpec31.5→24项三浏览器本轮通过，19081已更新/7任务与容器不变，证据about-typography-build/release/validation；此前66项不当本次重跑。

关于入口（2026-11-16）→ Workspace按需AboutDialog、BrandMark静态版、project.ts集中链接和中英文文案 → responsive-interface关于可达/关闭/状态保持、localization-theme项目身份 → about三浏览器24、既有主题/工具栏/状态栏36、最终语言6共66有效场景及文案unit1；四版版本显示为受控数据，不冒充真实daemon业务重验。OpenSpec31节；about-build/release/validation/live证据，19081已按本轮明确无备份授权更新，7任务/容器状态不变。实际报告替代关系和回退限制见validation.md，第30节/DSM/13.12未结案。

依据：`project_outline.md` 第 17–21 节；规格为 `openspec/changes/rebuild-transmission-web-ui/`。最新执行结果见 [validation.md](validation.md)，系统边界见 [architecture.md](architecture.md)。本机通过不替代 DSM 实机验收。

| 能力规格 | 实现入口 | 已执行验证 | 保留边界 |
| --- | --- | --- | --- |
| rpc-connection | services/rpc.ts、config.ts、stores/app.ts | unit/rpc、store；test:rpc 四版；401 认证；双路径代理三浏览器 | 仅单实例同源，写未知结果不自动重试 |
| torrent-synchronization | domain/torrents.ts、stores/app.ts | 空/增量补齐/失败缓存/刷新合并/旧 generation/session 重连/早期 4.0 全量核对 unit；真实规模与长测 | 会话轮询和核对周期见架构，网络耗时与渲染分开计 |
| torrent-browser | Workspace、TorrentTable | 三浏览器 workspace/selection/layout；table-progress覆盖深浅主题/列宽/进度语义；真实稳定 5000；20 列可控更新与完整 30 分钟 | 历史长测资产冻结，最新列表长测限制见validation.md；局部进度条不重跑长测 |
| torrent-operations | ActionDialog、AddDialog、stores/app.ts | store unit；e2e/operations；test:rpc/download/controls 四版；真实移动端 | 已送达命令不因取消撤销，逐项 success/duplicate/failed/unknown/cancelled |
| torrent-details | DetailPane、PieceMap | e2e/details 三浏览器：10000 文件原始索引、失败草稿、晚到成功；pieces unit；piece-map三浏览器：全宽/逐格/尾块/缩放/窄屏；真实文件/Tracker 参数 | Peer 为详情展示与手动 IP；分片为最多512格画布 |
| batch-workflows | batch/workflow/match-controller、WorkflowDialog | workflow/store unit；test:match 四版取消/恢复；e2e/workflow/trackers/operations 三浏览器 | daemon 无事务/CAS，冲突需核对，取消与恢复分别处理 |
| settings-migration | settings/session-fields、SettingsDialog | settings/store unit；e2e/migration/settings：备份/重置/跨页/独立 daemon 差异 | 不能修复未知历史标签错位，保留原文；同字段最后提交生效 |
| responsive-interface | Workspace/style、index.mobile.html | 三浏览器 mobile-real 真实 4.0.6/4.1.4 与 selection 移动视口；旧入口查询/hash 保留 | 移动以常用操作为目标，完整高级编辑在桌面 |
| localization-theme | i18n、App | 中英 key 完整性 unit；三浏览器遍历 16 语言、延迟包竞态、主题重载 | 历史语言缺失新文案用英文，不声称全部人工翻译校对 |
| release-installation | release/install、synology-check、release.mjs | 安装器故障注入；最终完整包 BusyBox 无网络/无运行时；非 root 父目录；真实 daemon A/B/回退；代理 | SynoCommunity 4.1.4-32 XDG 接入经 test:synocommunity 的真实 daemon/上游脚本/BusyBox 模拟；真实 ACL/重启/升级待设备证据 |

源文件位于 src/，测试位于 tests/unit 与 tests/e2e；真实协议/下载/安装脚本位于 scripts/。三浏览器各 26 项、共 78 项通过，6 个专项跳过不算通过；专项报告见 validation.md。OpenSpec tasks 按这些执行证据勾选，主变更未归档。

## 已明确的协议与旧行为修正

1. 3.00 Tracker 使用该版本实际的扁平位置/URL 参数，先替换再删除/新增；4.x 使用 trackerList tier。多步部分失败刷新实际状态并保留原始错误，不宣称原子回滚。
2. completeSize 沿用有效旧行为 `max(0, totalSize-leftUntilDone)`；Peer 计数使用非负 Tracker 统计并附当前连接数。标签按名称、Tracker 按主机字符串排序。
3. wanted 的 number/boolean 归一化；4.0.0 重复 business 错误缺身份时只报告重复，不任意补标签。
4. 3.00 OpenSSL 3 legacy provider 仅属于实验容器，前端包不携带或修改目标服务加密环境。
5. B/C/I 追踪验证针对新实现，不修改 old/。详细对应、计时口径和证据局限见 validation.md。


## 多级导航增量追踪（2026-11-15）

- torrent-browser：SidebarNavigation、domain/navigation、Workspace；navigation单测和三浏览器navigation覆盖Tracker去重/隐私、目录边界、父目录筛选、计数、展开恢复及5000个不同目录/Tracker的虚拟渲染；私有任务菜单已移除，private字段未修改。
- torrent-synchronization：SessionStatistics与store重连清空；store单测验证失败保留统计/重连未知，test-navigation-readonly.mjs只读核对四版字段与累计/当前数据（实验实例为零任务，不能替代非空真实分组验证）。
- settings-migration：navigationExpanded可选字段与事务合并；settings单测覆盖旧v2、两页面不同节点更新。
- responsive-interface：图标、方向键/Enter/Space导航、移动抽屉和只读统计；24项相关三浏览器回归通过。完整性能结果另记validation.md，不复用历史证据。


## 完整任务列表与分页增量

OpenSpec任务第13节、table-list-parity.md及追加Pagination Follow-up对应DEFAULT_COLUMNS、domain/table、TorrentTable、Workspace和SettingsRepository列预设事务。61项unit通过（9文件），30项三浏览器相关回归通过，追加逐列中文表头专项6项通过；table-parity覆盖自动布局升级/恢复、20列顺序与中文标题、行号、服务器端口/隐藏秘密、校验进度、单行标签入口/取消、拖动保存、分页跳转/末页/切条数清勾选/最大5000/空结果/移动无溢出。

scripts/test-table-fields.mjs使用生产RpcClient，四版各新增自有暂停metainfo夹具，读取同一28字段列表并核对全部存在、路径/Tracker非空，finally按自己的hash移除且不删数据；未操作对照样例。这是非空字段证据，不冒充四版所有状态/外部Tracker联通性完整验收。完整性能及当前快照结果另记validation.md。


详情收起增量：Workspace的列表局部点击和DetailPane显式按钮复用store.select(null)，store单测覆盖加载取消/晚到响应/勾选保留，三浏览器detail-dismiss/details/selection共21项通过。PieceMap算法不变，仅新增大于512块的汇总说明；4096块纯函数比例、三浏览器canvas像素色阶与真实H位图各自核对。新H仅属于本机comparison夹具，非Release依赖。

工具栏增量：WorkspaceToolbar.vue、Workspace.vue和style.css对应responsive-interface的Logo下全宽工具栏要求；toolbar.spec.ts覆盖三浏览器深浅/宽窄/强制桌面、键盘可达、单多目标/快捷命令/确认弹窗/队列、刷新偏好与手动刷新。相关选择/详情/列布局/添加/工作流/Tracker/语言回归保留mock范围；独立四版daemon和压力长测不作为本次适用回归，历史限制不变。

工具栏勾选语义修正：torrent-browser“工具栏仅操作勾选任务”由Workspace.operateChecked及checkedIds启用条件实现。toolbar.spec.ts新增只高亮/取消最后勾选/取消全选/搜索清勾选的禁用断言和无RPC写入，保留A勾选+B详情的目标核对；selection.spec.ts补移动端查看详情不启用、勾选/取消切换。右键明确范围、身份变化与批量取消回归不变。

2026-11-16校验图标：WorkspaceToolbar/SidebarNavigation/TorrentTable统一DatabaseSearch；对应responsive-interface校验图标一致场景，现有toolbar/navigation/table-progress三浏览器12项mock回归和19081实页图形核对通过，无新增业务或真实校验任务。

重新校验确认：torrent-operations新增明确确认场景由Workspace/ActionDialog实现；verify-confirmation.spec.ts覆盖三个入口无确认不写、取消/Esc/关闭/遮罩、取消焦点、hash范围、身份变化、重复点击与失败/未知不重发。operations保留串行取消，workflow保留内部校验；test-verification-isolated.mjs独立无网络/端口/挂载的四版daemon核对两分块损坏50%→修复100%、字节/位图/文件不被改写。历史真实协议结果不是本次新证据；新结果单列verification-daemon-results.json。

更多/自动刷新：WorkspaceToolbar.moreMenu及Workspace.operateBulk→refreshSnapshot→ActionDialog对应全局启停明确范围；bulk-refresh.spec.ts用mock检查三项菜单、无勾选、筛选外目标、确认前零写、冻结hash、空/失败、Tracker勾选、实际周期请求与禁用/重载。store.test.ts新增四类计时核对，覆盖前后台、开关/间隔、快速切换、失败恢复、在途关闭/销毁和全局快照等待读取链。协议未变，不把此轮mock或前轮真实daemon校验混写为全局启停实机验证。

列设置入口清理：Workspace和文案不再提供两套版本预设/撤回入口；现有table-parity/layout三浏览器用例核对默认20列与用户调整重载保留，无任务写入。底层历史兼容读取维持原状，不把它作为当前产品入口。

列设置开关响应（用户2026-11-16反馈）→ ColumnSettingsDialog.vue按需挂载/复用、style.css局部120ms淡入及减少动态效果 → column-dialog.spec.ts的控件身份/三关闭方式/焦点/其他弹窗/真实过渡事件/深浅窄屏，layout与table-parity覆盖既有保存，toolbar覆盖集中入口；OpenSpec21节。无新RPC/设置schema。

布局主题与独立深浅（用户2026-11-16）→ ThemePicker/ColorModeToggle、domain/themes、SettingsRepository兼容字段及themes.css四布局 → settings unit旧v2/未知ID/并发与导入，themes.spec四主题×两明暗/断点/持久化/系统/跨页/任务上下文保持；完整规范docs/theme-design.md，OpenSpec22节。无新RPC或主题外部资源。

视觉皮肤纠正（用户2026-11-16）→ 独立LayoutPicker/ThemePicker、visual-themes.ts单一palette/Provider覆盖、App根变量及namespace、visual-themes.css → visual-themes unit八套对比度/历史字段/三方并发与导入，visual-themes.spec真实控件/缓存浮层/32组合/状态保持/独立保存。原四套仅作为布局，规范docs/theme-design.md已重写，OpenSpec24节。

全宽底部状态栏（用户2026-11-16）→ WorkspaceStatusbar、Workspace、themes.css/styles四行grid、store.refreshFreeSpace及domain/status → statusbar.spec的真实字段映射/未知/故障/模式组合/窄屏、store.test五类生命周期/超时、39相关三浏览器回归，四目标版本全新无网络daemon的free-space/statvfs只读对照及19081真实核对；OpenSpec26节/workspace-statusbar.md，证据statusbar-*.json。无对照任务写入；真实非0速度由浏览器受控值覆盖格式映射，不伪称真实流量测试。

总大小单位简写（用户2026-11-16）→ TorrentTable.totalSize/Workspace移动总大小局部标签替换，不改公共换算 → table单元5项、table-parity三浏览器6项同时断言总大小KB和其他列KiB，实页KB/MB核对；OpenSpec27节，size-unit三份证据。

文件列表底栏补齐（用户2026-11-16截图）→ old文件pager/fields/pagerFilter三个模板只读依据 → DetailPane+domain/torrent-files、独立filePageSize兼容schema → 模型4用例/设置1用例与最终42三浏览器（万文件/5000页内虚拟化/原始索引200和9999/选择隔离/模板/失败/四皮肤明暗窄屏/两种遮挡与宽度）→ OpenSpec28节/file-list-controls.md，file-pagination-*.json与实页D三文件截图。现有RPC方法未改，mock操作不能当作四版daemon真实写入验收。

任务配置（用户2026-11-16追加条件）→ 候选设计取消，3.00隔离seedIdleLimit0请求success/回读仍17证据 → 移除DetailPane配置tab/通用草稿保存与config详情路由，保留四页/全局设置公共网格 → 最终92unit/48三浏览器（配置入口不存在、零专用读写、余下详情/文件分页和全局设置）→ OpenSpec29节及取消设计，torrent-config-cancellation.json与remove-task-config证据。旧配置草稿验收属于历史已移除功能，不再是当前要求。


## 2026-11-16 共用兼容性修复增量

按既有OpenSpec第30节实施；选择身份、真实持有量/未知值、方向独立限速、Tracker完整基线及3.00挡板见[实施与验收记录](shared-compatibility-implementation-2026-11-16.md)。证据区分真实daemon回读、受控故障/浏览器与已有测试失效。无持久化schema迁移，无新轮询或任务配置tab；19080/19081只读，G4未发布，13.12长测待办保持开放。
