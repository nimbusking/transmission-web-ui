# 入口改名交付：2.0.0-installer.3（2026-11-16）

正式入口统一为`install-transmission-web-ui.sh`。本版只调整入口名、提示、发布元数据和文档，归档校验同时接受旧名称以兼容历史包；UI仍为同一冻结44文件，不混入后续登录页开发。

候选位于`artifacts/installer-2.0.0-installer.3/`。单文件SHA256：`5bac0fd8d344935c9338ec1618bc03f1d887fa3cee1fe0159cd9ee6c50f464bd`。源码入口为`release/install-transmission-web-ui.sh`，源码入口不自带UI归档；发布附件才携带完整离线包。

改名后的同一冻结附件通过9个Docker和4个群晖Linux模拟场景；GNU安装器回归、shell语法、ESLint、格式、OpenSpec及old/816文件检查通过。

用户已授权将安装器相关源码和文档提交推送到远程仓库。GitHub Release附件仍需单独上传；本轮不操作NAS及19080/19081，不提交并行UI改动。以下为此前版本验收历史，最新摘要及本版测试见[机器证据](validation-evidence/integrated-installer.json)。

---

# 二次验收：2.0.0-installer.2（2026-11-16）

本版替代下述installer.1候选。冻结单文件后使用同一摘要完成全部验收，没有在测试过程中重建。UI仍为原冻结44文件，逐字节核对一致；未修改NAS、19080/19081或old/。

修复：Docker重建前核实配置、默认下载、启用的未完成目录及所有现有任务目录位于持久化挂载；拒绝未知可写层修改（仅排除挂载点及daemon临时session文件）；恢复前确认原容器和完整旧资源仍可用，温和停止新容器；恢复后验证完整资源。补齐显式版本选择、特殊路径URL编码、严格JSON解析、凭据控制字符检查及底层残留进程锁恢复。

真实Docker的9个场景通过：未知可写层拒绝、非持久化下载目录拒绝、真实SIGKILL停止后恢复、安装、旧资源被改时保留当前服务、重复安装、显式恢复、Web覆盖失效自动回滚、原容器丢失时保留当前服务。任务身份/状态、下载哨兵、原配置和匿名卷保持断言未降低。

群晖Linux模拟4个场景通过：自定义旧UI安装、完整恢复、重启失败回滚、真实daemon带认证的交互预检（密码含引号/反斜杠且不回显）。使用真实4.1.4、服务账户及固定上游脚本；synopkg仍是模拟接口，不代表真实DSM认证。

GNU及BusyBox底层安装/失败场景、严格JSON解析、shell语法、目标ESLint/格式、OpenSpec strict及old/816文件检查通过。真实DSM的ACL、设备重启/升级、Compose/Swarm接入仍不在已验证范围。不可捕获中断使用恢复入口；未知或被外部损坏的现场保留并明确拒绝，不能保证任意故障下无人工介入。

交付：`artifacts/installer-2.0.0-installer.2/install-tr-control.sh`，SHA256：`1ef05c099b4b8363e49f65d8957d693253269631f34b41d1270362056de3a8f4`。未上传GitHub Release、未提交推送本轮改动。机器证据：[integrated-installer.json](validation-evidence/integrated-installer.json)。

---

以下为已被替代的installer.1历史验收记录，勿将其附件用于本次首次安装。

# 一体化安装交付验收（2026-11-16）

交付版本`2.0.0-installer.1`，UI沿用已发布2.0.0快照，44个web文件逐字节一致。独立安装交付版本不覆盖旧封板包；本轮没有重建UI。工作区同时存在另一轮登录改动，因此打包显式使用`.lab/shared-compatibility-verified-release/web`，不读取并行变化的dist。

正式单文件附件包含离线归档、全部辅助脚本及内置归档SHA256。用户仅执行`sudo sh install-tr-control.sh`，脚本完成检测、认证提示、备份、接入、必要重启和验证。单文件SHA256：`c2c8dc6451a55ae462f4066946763ad73c0f420298bf26232c1371e26cf5c532`。附件位于`artifacts/installer-2.0.0-installer.1/`；尚未上传GitHub Release。

最终交付物直接通过四个Docker场景：安装、同版本重复接入、旧容器显式恢复（含残留进程锁）、镜像忽略Web覆盖时自动恢复。使用真实4.1.4、独立配置/下载匿名卷及暂停小样例；任务hash/名称/状态和下载哨兵内容保持，原环境变量、主机名、重启策略和全部原挂载保持。新旧容器不同时运行；所有测试容器与专用匿名卷已清理，未触碰对照容器。

三个群晖Linux模拟场景通过：既有自定义XDG旧界面安装、完整资源显式恢复、注入重启失败后的自动恢复。使用真实4.1.4、实际sc-transmission账户及固定上游启停脚本；供应方文件摘要不变。synopkg命令由测试适配器模拟，因此不声称真实DSM已认证；实际ACL、系统重启和升级保持仍需NAS验证。

BusyBox 1.37无网络验证通过；原封板归档的`./`前缀/额外文档拒绝问题已复现并修正，完整原包通过修正后的安装器。重复路径别名、损坏摘要、链接、未校验文件、外部目录和损坏存储版本回退等失败场景通过。shell语法、ESLint、目标格式、OpenSpec strict、old/816文件完整性检查通过。

首次测试定位并处理了宿主随机端口在恢复后变号（改为切换前拒绝）、测试客户端跨服务重启复用失效HTTP连接、daemon只读session-id重启必然变化。没有降低可写配置或数据保持断言。最终结果与命令输出见[机器证据](validation-evidence/integrated-installer.json)。

支持范围为已核验SynoCommunity套件及本机独立Docker。编排容器、固定容器IP/随机宿主端口、远程/共享容器网络、自动删除容器等在改动前保护性拒绝，不擅自修改编排配置。不可捕获的断电/SIGKILL须运行同一脚本的恢复入口；若备份损坏或原容器被外部替换，保留现场并明确报告，不能保证在任意外部破坏后自动恢复。
