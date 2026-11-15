# 发布与安装

## Purpose
发布安装能力交付独立静态资源和可验证清单，通过受管理目录安全安装、升级和回退，适配Linux与Docker，保留官方界面并确保失败不会报告成功。

## ADDED Requirements

### Requirement: 静态部署
系统 SHALL 发布预编译静态包、版本清单和摘要，安装与运行不要求 Node.js、npm、Python、编译器或外部 CDN。

#### Scenario: 静态部署的可观察结果
- **WHEN** 部署到daemon目录或同源反向代理
- **THEN** 入口、资源和RPC路径正确，旧目录不包含在发布包中。

#### Scenario: 无开发运行时的离线安装
- **WHEN** 目标已有 Transmission、POSIX sh 以及所需文件和摘要工具，且没有 Node.js、Python 和网络连接
- **THEN** 完整 release 包能够安装、切换和回滚，浏览器无需下载外部字体或脚本即可使用。

### Requirement: 群晖部署兼容
系统 SHALL 提供群晖套件版及 Container Manager/Docker 的适配路径，并区分本机模拟验证与真实 DSM 验证证据。

#### Scenario: 群晖套件环境
- **WHEN** 安装到明确指定且权限允许的独立目录
- **THEN** 检查工具能力和服务用户读取权限，不依赖固定存储卷编号，不覆盖套件自带 UI、配置或启动脚本；不支持的环境在切换前报告原因。

#### Scenario: 群晖容器环境
- **WHEN** 将受管理父目录只读挂载至已有 Transmission 容器并设置 Web 根目录
- **THEN** 相对 current 软链可解析，容器非 root 服务用户可读，升级、回滚及容器重建后均可加载正确资源。

#### Scenario: 验证证据的边界
- **WHEN** 尚无目标 NAS 的实际执行结果
- **THEN** 验证报告把 DSM ACL、套件升级持久性、平台服务重启等项目标记为待实机验证，不把 Linux Docker 通过等同于 DSM 已通过。

### Requirement: 目标与完整性
安装器 SHALL 验证明确prefix、归档路径和文件摘要，拒绝空路径及根目录。

#### Scenario: 目标与完整性的可观察结果
- **WHEN** 目标无效、解包失败或摘要不符
- **THEN** 非零退出，当前版本不变，不写到其他系统目录。

### Requirement: 切换与回退
安装器 SHALL 准备完成后切换current，保留原版本且仅管理自身文件。

#### Scenario: 切换与回退的可观察结果
- **WHEN** 升级失败、显式回退或卸载
- **THEN** 旧版本仍可用，官方UI资源未被覆盖，自动模式不等待交互输入。

### Requirement: SynoCommunity定版接入
系统 SHALL 为用户确认的SynoCommunity 4.1.4-32提供只读检测和可撤销XDG接入，保留供应方脚本与自带UI。

#### Scenario: 实际进程核对后接入
- **WHEN** 对4.1.4-32执行attach且真实服务账户、PID二进制/config-dir、进程环境、持久化数据位置和资源可读检查均满足
- **THEN** 仅创建指向受管理prefix/current的XDG Web链接及注册记录，不修改启动脚本或设置文件，不自行重启服务；界面提示通过套件中心重启并验证。

#### Scenario: 不安全或未知接入环境
- **WHEN** 版本不符、进程身份不符、Web环境覆盖、临时数据路径、已有其他UI或工具能力不足
- **THEN** 非零退出且不替换原有UI，提供可理解的拒绝原因，inspect不写配置或创建目录。

#### Scenario: 显式解绑后卸载
- **WHEN** 用户先detach再卸载，或外部更改了注册链接
- **THEN** 仅移除仍属于自己的链接，外部改动拒绝删除；有注册记录的安装拒绝直接卸载，解绑重启可恢复原UI。

### Requirement: 本机开发对照部署
系统 SHALL 为用户功能比对提供独立双端口旧UI和重构UI，共享隔离的真实daemon，不修改old源码。

#### Scenario: 两入口共享数据
- **WHEN** 用户打开本机19080和19081入口并在一边操作生成的样例任务
- **THEN** 两边经正常刷新观察相同daemon状态；旧端只读old/src，新端提供已校验Release快照，浏览器偏好按端口独立保存。

#### Scenario: 保留对照环境
- **WHEN** 自动验证结束或用户重启对照服务
- **THEN** 保留该Docker项目运行及持久化配置/数据卷，另有显式停止和仅重置自有样例的入口，提供人工功能清单，不将基础自动流程通过标成全量人工验收。
