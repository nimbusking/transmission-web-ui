# 设计

用户只需下载正式单文件附件并执行`sudo sh install-transmission-web-ui.sh`。开发源入口由主流程和原辅助脚本生成；发布器先打包标准静态归档，再将归档base64及SHA256内嵌到下载脚本，避免循环打包。NAS只用系统shell/curl/文件工具，无Node/Python依赖。

事务顺序为只读检测→包外/内摘要验证→真实旧目录/页面匹配→空间检查→完整资源和接入备份→用户确认→激活→逐文件HTTP及只读session-get验证。密码隐藏输入，存于私有临时curl配置，不进入argv、日志或持久化备份；容器inspect备份可能含现有环境凭据，父目录root:0700。

群晖只接受经核验的SynoCommunity 4.1.4-32；独立prefix和XDG接入保留供应方文件。已有XDG入口移动到旁边保留原目录/链接，另存完整资源内容。使用synopkg重启，失败恢复原XDG入口、current/previous及注册信息，再验证旧页面/RPC。

Docker通过本机Engine API复制原Config/HostConfig与端点信息，仅增加只读UI挂载和Web变量/事务标签。使用原镜像ID，不拉取镜像；原实际匿名卷名称继续挂载。原容器停止并改名保留，新容器使用原名。失败只删除带匹配事务标签的新容器，不删除数据卷，恢复旧容器。已接入的升级只切换资源。Compose/Swarm、随机端口、静态IP、AutoRemove、容器共享网络和远程Engine等不满足安全恢复契约的情形拒绝自动接入。

持久化日志使用数据文件而非source/eval；prepared/activating/committed/rolled-back/recovery-required状态明确。可捕获异常自动恢复；SIGKILL/断电不能执行trap，保留pending与备份供同脚本--restore，PID和进程开始时间区分活锁与残留锁。检测到外部替换、备份损坏或原容器丢失则保留现场并报告，不伪称恢复成功。

本轮不发布GitHub Release、不操作真实NAS或对照服务；交付本地可分发单文件及对应归档/摘要。在线入口仅在正式附件上传后可下载。真实DSM的ACL、synopkg和生命周期验证仍需设备证据；模拟不冒充实机。
