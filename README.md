## transmission-web-ui

原暂停维护项目地址：https://github.com/ronggang/transmission-web-control
本人重启该项目二次开发维护，主要依赖大模型分析重构。


----

## 关于
本项目主要目的是想加强[Transmission](https://www.transmissionbt.com/) Web的操作能力，本项目原本在[Google Code](https://code.google.com/p/transmission-control/)托管，现迁移至GitHub。
本项目设计之初仅针对PT站，因此增加了 Tracker 服务器分组及状态，但这不并适用于普通BT种子。

另外，本项目仅为一套自定义的WebUI，不能代替 Transmission 工作，用户需要自行安装 Transmission 后才可正常使，Transmission 安装方法请移步至官网：https://www.transmissionbt.com/

### DSM7.0
在这个版本中，需要额外修改权限以实现自动更新的功能
在 `root` 权限下执行以下命令，其中：
 - `YOUR_USERNAME` 替换为你登录和更新脚本时候选择的用户
 - `/var/packages/transmission/target/share/transmission/web/` 这串路径为 transmission 的安装路径（默认应该是这个）
```shell
sed -i '/sc-transmission/s/$/YOUR_USERNAME/' /etc/group
chown sc-transmission:sc-transmission /var/packages/transmission/target/share/transmission/web/* -R
chmod 774 /var/packages/transmission/target/share/transmission/web/* -R
```
