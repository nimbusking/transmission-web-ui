# 登录刷新问题定位（2026-11-17）

用户现场：2.0.0 持续使用正常，升级 2.1.0 后刷新返回登录首页。

## 已确认的代码与发行包差异

原始 artifacts/stage-2.0.0/web 内 index-q5Xwhuk8.js 调用 initialize(config)，自动连接；app-C1WHELk3.js 使用 credentials: same-origin，允许浏览器同源认证信息参与请求。

2.1.0 原始发布包 index-B4Gy_jYP.js 调用 initialize(config, false)，禁止启动自动连接；app-3p7ihaN3.js 使用 credentials: omit。登录页提交的 Authorization 仅保存在 RpcClient 内存，刷新后重建为空。App 的 hasConnected 也重置为 false，登录页条件再次成立。刷新后不发起认证恢复请求，因此无需等到服务端401就已回到登录页。

这两处行为由提交 4ddff6f6b8ccefa4be07b3386000064f261ed385（2026-11-16 20:42 +08:00，新增登录页）引入；并非本次诊断采集的代码变更。2.0.0-installer.7 同样已经包含此登录页改造，不能用它代替原始2.0.0作为正常对照。

## 实验

三个引擎 Chromium/Firefox/WebKit 对冻结发行静态资源运行，未重建或修改包。4191 为 installer.7，4192 为2.1.0：模拟RPC验证合成用户名密码，登录工作台成功；刷新后均返回登录页，新增RPC请求均为0。

4193 为原始2.0.0：模拟RPC可访问条件（不模拟真实HTTP认证缓存），首次和刷新均进入工作台，刷新发出 session-get/torrent-get/session-stats。该实验验证启动流程，不独立证明NAS浏览器当时的认证缓存内容。

原始2.1.0包与installer.7包内 install-transmission-web-ui.sh、synocommunity.sh、install.sh、web/app-config.json逐字节相同。

只读获取NAS 9091公开页面：HTTP200，入口和app资源名与原始2.1.0包一致，由nginx提供。SSH只读检查因公钥认证被拒，未取得NAS代理配置和升级备份。NAS旧版部署文件、浏览器当时的认证状态尚未直接取证。

## 状态

已定位2.1.0刷新必回登录页的具体启动/认证机制，以及相对原始2.0.0的引入提交。诊断代码没有引入这两处行为变化。未修改或部署修复；之前试作的sessionStorage方案已撤下，未纳入交付安装包。原始2.1.0安装包、NAS交付目录和19081仍为已发布构建。
