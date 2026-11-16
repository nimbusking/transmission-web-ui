# Transmission Web UI

使用 Vue 3、TypeScript、Naive UI 和 Pinia 的静态 Transmission Web UI。原实现保存在 `old/`，分析依据为 `project_outline.md`。主要功能与 Linux/Docker 本机验证已完成，当前为开发候选；已补齐 SynoCommunity 4.1.4-32 条件式 XDG 接入，DSM 实机验收尚待补齐。

- [实施进度与剩余工作](docs/implementation-progress.md)
- [新框架架构](docs/architecture.md)
- [实测结果与复现](docs/validation.md)
- [安装、升级、回退与反向代理](docs/deployment.md)
- [旧版数据迁移](docs/migration.md)
- [群晖套件与容器双路径](docs/synology.md)
- [本机新旧 UI 对照地址与功能清单](docs/local-comparison.md)
- [OpenSpec 设计](openspec/changes/rebuild-transmission-web-ui/design.md)、[任务](openspec/changes/rebuild-transmission-web-ui/tasks.md)、[追踪矩阵](docs/traceability.md)

## 开发

本机对照环境：旧版 http://127.0.0.1:19080/transmission/web/ ，重构版 http://127.0.0.1:19081/transmission/web/ 。两者共享独立的 Transmission 4.1.4；运行 `npm run compare:up`，详见上方功能清单。

需要 Node.js >=22.12，Docker 用于真实服务验证。`npm ci` 后执行 `npm run dev`，默认代理至 19091 的实验服务。先 `npm run lab:up`；结束用 `npm run lab:down`，保留实验卷。

```sh
npm run check
npm run spec:validate
npm run format:check
TWUI_PROXY=1 npm run test:e2e:docker -- --workers=3
```

浏览器前先完成生产构建；代理用例需启动 proxy profile，完整步骤见验证文档。其他入口包括 `test:rpc`、`test:download`、`test:controls`、`test:diagnostics`、`test:match`、`test:synocommunity`。不要并发修改 dist 和测试该目录。

## 预编译安装包

面向用户的一体化入口是发布附件 **install-transmission-web-ui.sh**，内置完整离线包：下载到NAS后执行 `sudo sh install-transmission-web-ui.sh`，按提示完成检测、备份、接入和验证，失败自动恢复。无需分别执行辅助脚本，详见[一体化安装器](docs/integrated-installer.md)。正式附件由打包命令生成；源码目录内同名文件是开发入口，不自带UI包。以下独立安装器用法保留给高级/手动部署。

`npm run release` 生成 `artifacts/transmission-web-ui-2.0.0.tar.gz`、`.sha256` 和独立 `install.sh`。包内含完整静态资源、内部摘要清单、许可证、安装/迁移/群晖说明、只读预检和 SynoCommunity 接入脚本，排除 old/ 与开发运行时。

目标已有 Transmission，安装/运行无需 Node.js、npm、Python 或 CDN。将候选包和摘要复制到目标主机：

```sh
sha256sum -c transmission-web-ui-2.0.0.tar.gz.sha256
sh install.sh --prefix /absolute/persistent/path/transmission-web-ui --archive transmission-web-ui-2.0.0.tar.gz
```

在已有服务支持的持久化配置入口设置 `TRANSMISSION_WEB_HOME=/absolute/persistent/path/transmission-web-ui/current`。容器只读挂载受管理父目录，使用容器内 current 路径；首次接入需按已有服务配置重启。SynoCommunity 4.1.4-32 使用 synocommunity.sh 核对真实进程后接入 XDG，具体步骤见群晖文档；不能把 Linux 模拟通过等同于 DSM 已通过。
