# 群晖部署与验证

用户已确认：套件版 Transmission 和 Container Manager／Docker 两条路径都需要支持。发布物是预编译静态资源，不要求在 NAS 安装 Node.js、npm、Python 或编译工具。开发和本机验证使用 Docker，不改变这一运行要求。

## 兼容边界

| 环境 | 适配内容 | 证据要求 |
| --- | --- | --- |
| DSM 套件版：目标 SynoCommunity 4.1.4-32 | 独立资源目录、实际服务账户读取权限、Web 根目录配置、套件重启与升级后的配置保留 | 安装器本机测试 + 目标 DSM 实机验证 |
| DSM Container Manager / Docker | 持久化父目录挂载、相对软链、容器服务用户权限、重启/重建与回滚 | 本机真实 daemon 容器 + DSM 操作验证 |
| CPU 架构 | 发布的 HTML/JS/CSS 不含本机二进制 | 静态包检查；Transmission 本身必须支持 NAS 架构 |

用户已提供目标 DSM 版本为 **7.1**，型号原文为 **DS928**。型号按原始输入记录，套件已确认为 **SynoCommunity 4.1.4-32**。完整型号标识（是否带后缀）、CPU 架构、DSM build/Update 仍待核对，不据此推断其他型号或架构。实机验收状态仍为待验证。

DSM 7.1 的容器部署说明以 **Docker 套件**界面为基线；DSM 7.2 及以上才使用 Container Manager 名称和相应界面。不能要求 DSM 7.1 用户使用 Container Manager 的“项目”入口或额外安装 Compose。安装器仍只部署预编译资源；已有 Docker 容器通过卷挂载与环境变量接入。[来源：Synology 容器备份说明](https://kb.synology.com/en-me/DSM/tutorial/How_do_I_back_up_Docker_containers)

目标验收分为 DSM 7.1 套件版 Transmission、DSM 7.1 Docker 套件容器版两条路径，同时保留较新 DSM 的 Container Manager 文档。

## 套件版适配

安装位置由用户明确指定，例如某个持久化共享目录下的 `transmission-web-ui`。`/volume1` 只是常见示例，不能作为自动推断结果。安装器不覆盖套件目录中的官方 UI，也不修改供应方启动脚本。

### SynoCommunity 4.1.4-32 的接入机制

本次用户提供的版本为 **4.1.4-32**，不是此前已验证的 4.0.x。已增加固定源码 `a6d907d9ea2313143af714d7830feb6c1b60b84c` 的 4.1.4 实验镜像，保留 3.00、4.0.0、4.0.6。4.1.4 旧协议实测 RPC 版本 19，原有界面和命令兼容；其上游新增 JSON-RPC 2.0，但仍支持旧协议。本版使用经过四版验证的旧协议，不声称支持未来移除它的版本。[Transmission 4.1.4 RPC 说明](https://github.com/transmission/transmission/blob/4.1.4/docs/rpc-spec.md)

SynoCommunity 的启动命令没有通用自定义 Web 环境文件入口，不能把任意 `.env` 文件写入套件就当作生效。本次核对的上游提交为 `5e012dab21d616c9f5a41dabab755caf73b660aa`，测试固定脚本和摘要记录在 `lab/synocommunity-sources.json`。[套件服务定义](https://github.com/SynoCommunity/spksrc/blob/5e012dab21d616c9f5a41dabab755caf73b660aa/spk/transmission/src/service-setup.sh)、[通用启停脚本](https://github.com/SynoCommunity/spksrc/blob/5e012dab21d616c9f5a41dabab755caf73b660aa/mk/spksrc.service/start-stop-status)

Transmission 4.1.4 的 Linux 资源查找支持 XDG：无 CLUTCH_HOME / TRANSMISSION_WEB_HOME 覆盖时，先查实际进程的 XDG_DATA_HOME；未设置则用实际进程 HOME（再回退账户数据库）下的 `.local/share`，随后查该数据目录内 `transmission/public_html/index.html`。因此可在那里创建一个指向独立受管理 prefix/current 的链接，保留套件自带资源和全部启动脚本。[固定版本资源查找源码](https://github.com/transmission/transmission/blob/a6d907d9ea2313143af714d7830feb6c1b60b84c/libtransmission/platform.cc)

发布包新增 **synocommunity.sh**，默认只读；`--attach` 仅开放给 4.1.4-32，先核对 INFO 的来源/版本、真实 sc-transmission UID、PID 对应二进制与 config-dir、进程身份及有效环境。不会读取或输出 settings.json 和 RPC 密码，不执行 INFO/服务脚本。实际 HOME 不存在、Web 环境覆盖、XDG 数据目录落在临时/系统路径、已有其他 XDG UI、权限不足或工具缺少能力时拒绝接入。不同套件修订号需重新核对，不能仅改版本检查强行安装。

### 在 NAS 上执行

以下由 NAS 管理员在实际设备执行；本轮没有连接或修改 NAS。把已校验归档及脚本放到 sc-transmission 可读取、父目录可遍历的位置。包内包含 install.sh、synocommunity.sh 和 synology-check.sh，后两者需保持同一目录；不要放在其他账户不可遍历的私有 home 中。

首先执行只读检测。优先使用实际服务账户，这也避免将 root 的环境误当 daemon 环境：

```sh
sudo -u sc-transmission -- sh synocommunity.sh --inspect
```

必须先启动已有 Transmission 套件，脚本才能核对当前实际进程。检测输出实际有效数据目录、候选链接和两个供应方脚本摘要；若因环境/目录不受支持而退出，保留结果进一步核对，不手动猜路径或改启动脚本。

若检测通过，可在 SynoCommunity 的持久化数据目录中创建独立 UI prefix。下例路径是该来源已核对的数据入口，不依赖 volume1；仍需实际账户在目标上可写。安装器管理的只是其下新增的 transmission-web-ui 子目录：

```sh
sudo -u sc-transmission -- sh install.sh --prefix /var/packages/transmission/var/transmission-web-ui --archive /actual/readable/path/transmission-web-ui-2.0.0.tar.gz
sudo -u sc-transmission -- sh synocommunity.sh --attach --prefix /var/packages/transmission/var/transmission-web-ui
```

接入要求以 sc-transmission 执行，先用同一账户检查所有资源可读；prefix 也需由该账户管理，以便注册状态和安装锁正确工作。不为方便安装扩大整个下载共享目录权限。脚本创建的只是实际 XDG 数据目录下的 public_html 链接及 prefix 内的注册记录；已有非受管 UI 不会被替换。`ln -sT` 能力在修改前探测，工具不支持时拒绝。

然后在 **套件中心停止并启动 Transmission**，确认页面与同源 RPC 均正常。接入/解绑不自动重启，也不自行启动第二个 daemon。实际 RPC 端口以原套件配置为准，不假设始终是 9091。

UI 升级/回退继续以相同账户执行统一 install.sh；链接始终指向 prefix/current，因此不需重新写启动配置。本机真实 4.1.4 已验证运行中切换可见。升级 SynoCommunity 套件或 DSM 后仍需核对环境和权限，不能把模拟持久化当作设备升级保证。

恢复官方界面时先解绑，再到套件中心停止/启动，最后卸载 UI：

```sh
sudo -u sc-transmission -- sh synocommunity.sh --detach --prefix /var/packages/transmission/var/transmission-web-ui
# 在套件中心停止并启动，确认原界面恢复后：
sudo -u sc-transmission -- sh install.sh --prefix /var/packages/transmission/var/transmission-web-ui --uninstall
```

绑定状态存在时安装器拒绝卸载，避免留下失效链接。解绑只移除自己注册且仍指向原 prefix/current 的链接，检测到外部改动就停止；不删除目录中的其他资源。

套件服务用户必须能遍历父目录并读取所有静态资源。DSM ACL 可能影响实际访问，不能只检查 POSIX mode 或以 root 的读取结果代替服务账户测试。不得使用 `chmod -R 777` 作为适配方法。[来源：SynoCommunity 权限说明](https://github.com/SynoCommunity/spksrc/blob/master/docs/reference/permissions.md)

## 容器版适配

将安装的父目录整体只读挂载，例如宿主机 `<实际共享目录>/transmission-web-ui` → 容器 `/web-ui`，设置 `TRANSMISSION_WEB_HOME=/web-ui/current`。父目录内 `current` 指向 `releases/<版本>/web`，容器内能够完整解析此相对软链。不要单独挂载 `current`，否则宿主机切换链接后容器可能仍然绑定旧目录。

在 DSM 7.1 中使用 Docker 套件的容器配置入口，编辑已有容器对应的卷映射和环境变量；如该版本不支持原地调整，按原有配置重建容器并继续挂载原配置/下载目录。是否支持原地编辑需以实际 Docker 套件版本核对。无需为了安装这个静态 UI 升级 DSM 或增加 Node.js/Compose。

保留已有 Transmission 配置、下载数据、用户身份与网络设置。用户只需补充 Web 资源挂载和环境变量，不需要换用本项目的实验镜像。Container Manager 提供容器配置入口，具体 DSM 界面操作以目标版本为准。[来源：Synology Container Manager 帮助](https://kb.synology.com/en-global/DSM/help/ContainerManager/docker_container?version=7)

## 验证清单与记录

| 检查 | 本机可执行 | 必须补充 DSM 实机证据 |
| --- | --- | --- |
| POSIX sh、BusyBox 工具能力检测；无 Node/Python 离线安装 | 是 | 系统自带工具具体版本 |
| 空路径、根目录、异常归档、摘要损坏、写权限不足拒绝切换 | 是 | 共享目录 ACL 下的失败表现 |
| 3.00 / 4.0.0 / 4.0.6 / 4.1.4 静态资源和同源 RPC | 是 | 套件服务 Web 根目录生效 |
| 非 root UID/GID 读取与父目录只读挂载 | 是 | DSM ACL 和实际服务用户 |
| 安装、升级、回滚、容器重建后新版本可见 | 是 | Container Manager 操作、套件升级保留 |
| 反向代理资源路径与 RPC 会话头 | 通用代理可测 | DSM 代理规则和证书 |
| NAS 重启后持续生效 | 不能等价模拟 | 必需 |

每条证据记录日期、设备/系统版本、套件来源、Transmission 版本、安装命令、目录、运行用户和结果。无实机结果的条目保持“待验证”。

## 可执行的安装与预检入口

本机 Docker 模拟验证入口为 `sh scripts/test-deployment.sh`，先生成 release 归档。该脚本在无网络 BusyBox 中执行安装器，并用独立非 root UID、只读父目录挂载及新容器重建检查资源可见性。

正式发布包包含 `synology-check.sh`。套件版在安装后可执行：

```sh
sh synology-check.sh --mode package --web-home '<实际安装目录>/current'
```

随后通过目标套件支持的运行账户方式，以实际服务用户执行相同预检并增加 `--service-user '<实际用户名>' --probe-as-service`；预检会拒绝当前账户不匹配的结果。容器版在容器内部执行 `--mode container --web-home /web-ui/current`。预检是只读操作，输出是否检测到 DSM 元数据；通用 Linux 模拟不会显示为 DSM 已通过。

本机 SELinux 启用时，共享静态目录需要适当容器标签。实验 Compose 使用 `:ro,z`（多容器共享）；这是本机实验配置，DSM 的权限按其实际共享目录 ACL 和服务用户检查。

## 本轮新增的套件验证证据

`npm run test:synocommunity` 使用真实 4.1.4、固定上游启停脚本及对应 package service-setup 内容，在 Linux 容器中构造同名非 root 服务账户/套件目录，使用 BusyBox 1.35 静态工具运行接入脚本。实际 DSM 元数据不存在时明确标为 Linux simulation。包内 POSIX sh 安装器另在官方 BusyBox 1.37、无网络环境验证。所有额外工具仅在实验镜像，不增加 NAS 运行依赖。

已通过：只读身份检测；PID 拒绝；实际服务账户和资源可读检查；已有 XDG UI 拒绝；首次/重复接入；运行中 UI 升级与回退；未解绑卸载拒绝；新容器重装上游脚本后持久化数据卷保持接入；不支持版本、Web 环境覆盖、临时 XDG 目录和外部链接修改拒绝；解绑重启后恢复原 UI，RPC 继续可用。供应方脚本与原资源摘要前后相同。原始记录为 `artifacts/synocommunity-results.json`。

这是机制与本机模拟验证，不是 NAS 实机认证。下一步需在用户 DSM 7.1 上保存只读检测结果，并验证实际 ACL、套件停止/启动、NAS 重启和套件升级后保留；型号仍按原文 DS928 记录，不推断其他型号。
