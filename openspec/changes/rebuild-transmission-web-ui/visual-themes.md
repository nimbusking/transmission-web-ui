# 视觉主题、布局与明暗分离

## Context
用户明确上一轮workbench/console/studio/focus属于布局而非视觉主题。旧版system.js切换整套EasyUI CSS，metro-red等实际改变控件形态/表头/选中态；参考其皮肤概念，不迁移jQuery CSS。当前App固定6px圆角/青色，themes.css主要调整grid，需补全真正的视觉层。

## Decisions
右上独立“布局”（保留四套，字段layoutTheme不改）和“主题”（Modern/Metro/Material/Cupertino）；左下唯一明暗按钮及同排规则保留。新增ui.visualTheme，旧v2缺省/未知回modern，theme仍为light/dark/system。三项事务独立保存，不重置业务状态。
视觉家族统一覆盖按钮/输入/菜单/导航/表头/选中/进度条外观/标签页/弹窗。Modern轻边框6px，Metro红色强调/方正无阴影，Material圆润按钮与填充输入/浮层阴影，Cupertino中性细线/分组/柔和渐变。每套含深浅配对；错误/警告/完成颜色语义保留，用户指定矩形进度和虚拟行度量不变。
集中类型化palette和Naive GlobalThemeOverrides；App在root同步语义变量并在卸载恢复，Provider namespace同步浮层皮肤，解决Teleport继承；自有组件使用同源变量。皮肤不更换布局、不重新挂载工作区，不引入外部资源或新后台。设计规范docs/theme-design.md改为三层边界，布局章节归入布局附录，不再把布局叫主题。

## Validation
字段兼容/未知回退/三项并发与导入，所有palette普通文字/主按钮对比度、常量来源；四家族×两明暗的真实控件/输入/表头/菜单/弹窗样式，固定布局下位置与行高保持、选择详情保持；四布局与四皮肤组合、窄屏两个入口/同排明暗、键盘/刷新/系统/跨页。必要unit、三浏览器局部mock、静态/资源检查；不重复30分钟压力或四版RPC，既有13.12和DSM实机待验保持。

## Delivery
沿用连续验收授权，冻结构建完成回归后完整预编译离线包，直接更新19081不新增备份；资源先行入口最后、保留旧哈希。不写daemon、不操作对照容器或old/。可选择Modern恢复默认皮肤；完整回退既有较早快照会撤销多轮改动，不是精确上一版。未授权提交推送或对外发布。

## 深色搜索框辨识度修正
根因：Naive暗色Input默认透明边框，前轮统一color/colorFocus=surface使搜索与面板同底色。仅Workspace顶部搜索框提供暗色局部覆盖，底色subtle、默认边框muted、悬停/聚焦accent，聚焦保留轻轮廓；不改变全局Input、浅色、布局、圆角或搜索逻辑。验证四家族默认边框与面板/输入背景对比度>=3、占位文字>=4.5、hover/focus可辨、筛选清空与窄屏尺寸。
