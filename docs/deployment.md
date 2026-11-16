# 安装、升级与回退

发布物是完整预编译静态资源。安装主机已有 Transmission 即可，不需要 Node.js、npm、Python、编译器或外部 CDN。开发验证环境才使用这些工具和 Docker。

## 离线安装

将对应版本的 `install.sh`、`transmission-web-ui-<version>.tar.gz` 与外层 `.sha256` 放到目标主机，先校验下载摘要。示例版本仅用于说明：

```sh
sha256sum -c transmission-web-ui-2.0.0.tar.gz.sha256
sh install.sh --prefix /absolute/persistent/path/transmission-web-ui --archive transmission-web-ui-2.0.0.tar.gz
```

安装器内部还会核对每个文件的 SHA256SUMS，并拒绝异常路径、链接和未校验文件。`--prefix` 优先于 `TWUI_PREFIX` 环境变量；必须明确指定独立绝对路径，不接受根目录/系统根目录。安装器先执行系统工具能力检测，不会要求安装额外开发运行时。自动执行不需要 stdin 或交互确认。

目录结构：

```text
transmission-web-ui/
  .twui-managed
  releases/
    2.0.0/
      web/
      VERSION
      SHA256SUMS
  current -> releases/2.0.0/web
  previous -> releases/<previous-version>/web
```

安装器不修改 Transmission 启动脚本，不自动重启服务。普通 Linux 服务在其支持的持久化环境入口设置 `TRANSMISSION_WEB_HOME=/absolute/persistent/path/transmission-web-ui/current`，重启后访问原 `/transmission/web/`。systemd 环境文件路径、服务名和运行用户由发行版/服务配置决定，不能硬编码。首次改变 Web 根目录后需要确认服务实际生效；之后测试中的版本切换无需重启 daemon。

## Docker 与 DSM

已有容器增加受管理父目录的只读挂载（例如宿主 prefix → `/web-ui`），并设置 `TRANSMISSION_WEB_HOME=/web-ui/current`。保留已有配置卷、下载卷、端口、用户和网络。不单独绑定 current，因为软链切换后那种挂载可能仍绑定旧目录。

本项目的 `lab/` 镜像用于本机验证，不是用户安装 UI 必须替换的 Transmission 镜像。用户现有镜像需尊重 `TRANSMISSION_WEB_HOME`，并允许服务用户读取整个父目录。

DSM 7.1 使用 Docker 套件界面；较新 DSM 使用 Container Manager。无需为 UI 安装额外 Compose。套件版的服务账户、ACL 和接入方式由来源/版本决定。已为 SynoCommunity 4.1.4-32 提供 synocommunity.sh，在真实进程/权限核对后使用 XDG 查找目录接入，无需修改供应方启动脚本或写入不存在的环境文件。已知用户环境为 DSM 7.1、型号原文 DS928；完整型号仍待核对，Transmission 套件已确认为 SynoCommunity 4.1.4-32。具体预检见 [群晖说明](synology.md)。

## 升级与回退

```sh
sh install.sh --prefix /absolute/persistent/path/transmission-web-ui --archive transmission-web-ui-2.1.0.tar.gz
sh install.sh --prefix /absolute/persistent/path/transmission-web-ui --rollback 2.0.0
```

新版本完整准备后才原子切换 current，保留已有版本。安装损坏归档、无权限或遇到安装锁时非零退出，不改变已激活版本。已安装的同一版本不会原地覆盖，用 `--rollback VERSION` 激活它。切换后刷新页面加载新的入口；已打开的旧页面可能持有旧版本懒加载地址，继续操作前应刷新。旧版本目录保留供显式回退。

SynoCommunity XDG 已绑定时先执行适配器 detach 并重启套件确认原 UI；安装器会拒绝带绑定记录的直接卸载。

卸载仅清理受管理 release 和链接，遇到不属于安装器的 release 条目会拒绝；不修改下载数据、daemon 配置和官方 UI。卸载前先将服务 Web 根目录恢复为原配置并重启，再执行：

```sh
sh install.sh --prefix /absolute/persistent/path/transmission-web-ui --uninstall
```

## 同源反向代理

前端使用 hash 路由和相对资源路径，不需要服务端 SPA 路由回退。默认运行配置 `rpcUrl: ../rpc`：

| Web UI 外部路径 | 对应外部 RPC 路径 |
| --- | --- |
| `/transmission/web/` | `/transmission/rpc` |
| `/nas/transmission/web/` | `/nas/transmission/rpc` |
| `/ui/` | `/rpc` |

代理需同时转发静态资源和 POST RPC，保留请求/响应的 `X-Transmission-Session-Id`，以及需要时的 Authorization、Content-Type。不要缓存 RPC POST 或 409 响应。409 是会话握手的一部分，应原样转发并保留会话头。使用 UI 自带登录时可在同源代理保护 RPC；认证只存当前页面内存。

### DSM 原端口上的自定义登录页

Transmission 直接提供的 HTML 也受 Basic 认证保护；仅替换静态文件不能消除网页加载前的浏览器认证弹窗。`release/login-nginx.conf` 提供公开静态页面，仅将精确的 `/transmission/rpc` 转发给仍开启密码认证的 Transmission，并隐藏 `WWW-Authenticate` 响应头，让错误密码在页面内显示。401、409 和会话头保持原样，不缓存 RPC，也不重试有副作用的请求。

从 `2.0.0-installer.5` 起，单文件安装器已整合此入口。针对已核对的 SynoCommunity 4.1.4-32、原端口9091和启用密码认证的DSM，默认 `--login-page auto` 使用系统nginx接管9091，将RPC移到9093；不额外安装nginx。`--login-page on` 显式要求支持，`off` 为尚未配置入口的设备保留浏览器原认证。已有独立修复入口会自动迁移，升级时同步更新 `/usr/local/share/transmission-web-ui-login/web`，无需再次执行独立脚本。RPC密码及访问限制保留。不含登录页的旧发布包会在切换前被拒绝。

执行前检查原服务认证、备用端口、管理标记和nginx配置。登录资源快照纳入安装器同一备份，失败恢复及 `--restore <本次备份目录>` 同时处理Web资源和登录入口：首次接入恢复回原9091认证入口；已有入口升级恢复旧登录资源并保留9091/9093布局。原独立修复脚本仅用于尚未迁入一体化安装器的旧修复包。强制终止或断电需手动执行一体化安装器给出的恢复命令。DSM升级后配置保留尚未验证。

Docker模式仍支持原静态资源安装，但本版不自动迁移任意容器的端口或创建nginx代理；明确指定 `--login-page on` 时会拒绝并解释。容器自定义登录入口可使用上述配置原则单独部署，不将DSM集成宣称为全平台自动配置。

`npm run test:login-entry` 使用本地独立 nginx 和真实 Transmission 4.1.4，验证公开页面、匿名/错误密码拒绝、正确密码与 409 会话握手，并通过 Chromium 实际完成页面登录。容器仅用于本地测试，NAS 无需 Docker；该测试不等同于 DSM 安装脚本的实机验收。

运行配置 `app-config.json` 可改为同源 RPC 路径，不能包含 URL 用户名/密码，也不接受跨源 RPC。配置文件和首页应避免长期强缓存；带内容 hash 的静态资源可长期缓存。代理处终止 HTTPS 时，浏览器访问的 UI 和 RPC 必须保持同源。

本机 `proxy` profile 在 19098 端口验证了 `/ui/` 与 `/nas/transmission/web/` 两种路径及 409 会话头。测试代理 Python 只用于实验，不随 release 部署，也不替代用户的 DSM/Nginx 代理配置。
