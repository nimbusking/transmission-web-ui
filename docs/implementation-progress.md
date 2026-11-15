# 重构实施进度

更新：2026-11-15 16:14（Asia/Shanghai）。用户已明确恢复实施；本文件是续接入口，替代此前暂停时的未验证快照。

**当前状态：新框架主要功能和本机综合验证已完成；最终预编译包安装复验已通过。已为用户确认的 SynoCommunity 4.1.4-32 完成条件式 XDG 接入和本机验证；DSM 实机权限与生命周期仍待设备证据，OpenSpec 主变更保持未归档。**

本轮按用户要求整理完整 Git 提交并推送至 origin/main，实际提交标识以 Git 历史为准。源码、文档、OpenSpec、验证脚本与 old/ 迁移均纳入交付；精简实测快照位于 docs/validation-evidence。原目录的大量删除和 `old/` 新增是用户此前迁移旧工程的结果，不能恢复或重置。`old/` 816 文件摘要检查通过，回归基线只用于新框架重构，不修补旧实现。

## 已确认范围

- Vue 3 + TypeScript + Naive UI + Pinia + Vite，静态 SPA、hash 路由、单实例同源 RPC，无应用后端。
- 桌面有效功能、移动常用操作、5,000 任务、默认 200 条分页与虚拟滚动、列布局、底部详情。
- Transmission 3.00 / 4.0.0 / 4.0.6 / 4.1.4 实验容器；Linux、Docker 和群晖双路径。
- 用户设备信息：DSM 7.1、型号原文 DS928。完整型号/架构和 DSM build 仍待核对；套件来源/版本已确认为 SynoCommunity 4.1.4-32。DSM 7.1 文档使用 Docker 套件入口；较新 DSM 保留 Container Manager 说明。
- Release 为完整预编译静态包；目标安装/运行不需要 Node.js、npm、Python、编译器或 CDN。离线安装使用已有 Transmission、POSIX sh 和系统文件/摘要工具，在线下载另需 curl/wget。
- 标签本地稳定 ID/hash 映射，中英完整，14 个历史语言包英文回退；第三方服务仅手动触发。

## 已实现与验证

| 范围 | 实际结果与入口 |
| --- | --- |
| 工程与规格 | lint、类型、49 项 unit（7 文件）、生产构建通过；10 个 OpenSpec 能力；old/ 基线完整 |
| RPC/同步 | 409 有界握手、认证、错误结算、串行刷新/补齐/全量核对、会话重连与 generation 防旧响应、hash 写入身份 |
| 工作台/详情 | 虚拟列表、分类搜索排序、按 key 布局、独立勾选/详情/右键/Shift、10,000 文件索引、配置草稿与晚到写入防护、分片画布 |
| 业务 | URL/magnet/文件/拖放、重复结算、启停/队列/校验/重命名/定位/移动/限速、批量逐项与取消未发送项 |
| Tracker | 3.00 扁平位置/URL 参数，替换先于删除；4.x trackerList tier；冲突核对、批量预览、多步部分失败后重读 |
| 迁移与设置 | v2 IndexedDB 事务、跨标签页、原始/导入前备份、查看导出、仅 UI 重置、daemon 独立差异确认 |
| 匹配 | 真实 partial 等待/后项继续/下一目录；取消不再送后项；恢复原目录等待实际校验；持久化作业显式核对恢复；关闭重开窗口 |
| 完整体验 | 三浏览器 78 项通过（26/浏览器）；另 6 个专项跳过不计入通过；16 语言、主题、手动服务、移动真实 daemon、双路径代理 |
| 真实协议 | 四版 RPC、实际下载内容摘要、四方向队列/任务限速、blocklist/free-space、匹配取消/恢复均通过 |
| 性能 | 真实 5,000 个稳定暂停且元数据完整任务；可控 5,000/20 列/每轮 500 更新完整 30 分钟通过，见 validation.md |
| 发布/群晖本机 | 独立目录安装器、完整摘要、BusyBox 离线/非 root 父目录挂载、服务账户预检正反例、运行中 daemon 升级/回退均已有通过证据；最终包复验已通过，结果见 validation.md |

完整 30 分钟报告为冻结构建证据，资产摘要保存在 `artifacts/soak-baseline-build.json`；后续改动集中在交互生命周期、取消和代码格式，最终构建另做短时同流程复核，不能把两次构建混写为一次长测。

## 文件入口

- 架构及状态边界：[architecture.md](architecture.md)。原工程依据：根目录 `project_outline.md` 第 17–21 节。
- 实测报告与复现：[validation.md](validation.md)，规格追踪：[traceability.md](traceability.md)。
- 安装/升级/回退/反代：[deployment.md](deployment.md)，数据迁移：[migration.md](migration.md)，DSM 双路径：[synology.md](synology.md)。
- 计划及规格：`openspec/changes/rebuild-transmission-web-ui/`；实现：`src/`；实验：`lab/`；验证：`tests/`、`scripts/test-*`。
- 本轮结构化证据：`artifacts/validation-summary.json`，包含通过数、最终构建资产摘要、归档摘要及待办；对应日志已由 /tmp 复制到 artifacts。
- 开发候选：`artifacts/transmission-web-ui-2.0.0.tar.gz`、同名 `.sha256`、`artifacts/install.sh`。artifacts/dist/.lab 在 gitignore 中，源代码和脚本必须一并保留以重建。

## 续接时的剩余工作

1. 先读 validation.md 最新实际结果和 OpenSpec tasks；不要依暂停时旧快照重新开始。
2. 在实际 DSM 7.1 上以 sc-transmission 执行 synocommunity.sh --inspect，保存实际进程环境、可读性与脚本摘要；符合条件后按 synology.md 接入，不猜路径或修改供应方脚本。
3. DSM 套件版与 Docker/Container Manager 各记录：实际服务用户/ACL、入口/RPC/代理、升级回退、容器重建、NAS 重启、套件升级后保留。
4. 完成这些设备证据后再决定正式发布与 OpenSpec 归档；当前没有对外发布，也没有改动真实 NAS。

## 实验环境与注意事项

Node 26.13.1、OpenSpec 2.0.0、Docker 29.9.3、Compose 5.7.1；Linux amd64、i5-14600K、20 逻辑 CPU、约 62.5GiB RAM。npm 缓存 `/tmp/twui-npm-cache`。Docker socket/网络安装在沙箱内需授权提权。

基础镜像固定 `debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc`；Transmission 源码分别固定：

- 3.00：`bb6b5a062ee594dfd4b7a12a6b6e860c43849bfd`
- 4.0.0：`280ace12f8a2b99fdf144011cd4f6fed8be876fe`
- 4.0.6：`38c164933e9f77c110b48fe745861c3b98e3d83e`
- 4.1.4：`a6d907d9ea2313143af714d7830feb6c1b60b84c`（匹配用户 SynoCommunity 4.1.4-32）

Compose 项目 twui-lab，端口 19091/19092/19093；4.1.4 为 19095；认证 19094/19090、seeder 19096、fixture 19097、proxy 19098。测试自己的文件/种子，不使用真实用户数据。3.00 在 OpenSSL 3 中的 RC4 历史适配仅放在 lab，不进入 release。实验容器 Python 不是安装运行依赖。

构建、浏览器和长测顺序执行；不要在浏览器读取 dist 时重新构建该目录。原生 Fedora 缺 WebKit 依赖，使用固定官方 Playwright Docker 镜像。5,000 fixture 使用 `--settle-paused` 正常重启隔离 daemon 后核对全部 status=0，清理仅按 manifest hash 和名称前缀。验证结束已执行 `lab:down`，实验容器和网络已停止/移除，镜像与实验卷保留；下次 `npm run lab:up` 恢复。

依赖审计：生产依赖已验证 0 漏洞；此前开发工具的 critical/high 已通过兼容升级消除，仍有 11 项 moderate 开发依赖链告警。不要为了消除计数盲目执行 `npm audit fix --force` 的降级方案；详见 validation.md。

## SynoCommunity 4.1.4-32 补充（本轮）

用户补齐来源和版本后已扩展四版真实协议/下载/队列限速/匹配/诊断矩阵及 4.1.4 认证，三浏览器增加 4.1.4 桌面与移动入口。生产前端资源与上一轮性能复核构建保持一致，本轮没有改动渲染或同步策略。

新增 release/synocommunity.sh：默认只读，核对真实账户/PID/二进制/config-dir/进程环境；在无 Web 环境覆盖且实际 XDG 目录可持久化时，以服务账户接入 public_html→prefix/current。支持显式解绑、外部改动拒绝和未解绑卸载拒绝，不改供应方脚本或原 UI。

真实 4.1.4 + 固定上游启停脚本 + BusyBox 1.35 的隔离包目录模拟已通过接入/幂等/升级回退/新容器重装脚本保留/解绑恢复与拒绝场景，报告 artifacts/synocommunity-results.json；这不等价于 DSM 实机认证。NAS 接入步骤和只读检测命令在 synology.md。工具和上游脚本只属于实验夹具，不加入 NAS 运行依赖。

## 用户要求的双入口对照部署（保持运行）

用户在基本回归后要求实际部署新旧 UI 供逐项比对。已启动独立 twui-compare 项目：

- 旧版：http://127.0.0.1:19080/transmission/web/?lang=zh-CN （old/src 只读，Web Control 1.6.1）。
- 重构版：http://127.0.0.1:19081/transmission/web/?lang=zh-CN （已校验的 2.0.0 Release 快照，独立于后续 dist 构建）。
- 共用独立 Transmission 4.1.4；任务/daemon 设置互相可见，浏览器本地数据按两个端口隔离。
- 六个样例覆盖完整/空数据/50%/多文件中文/目录匹配/零字节；另有手动添加文件与 URL。均为本地生成数据及本机空 Peer Tracker。
- 三浏览器基础对照已通过：新版开始、等待旧版轮询更新、旧版勾选并暂停、两边同步；测试最后保留暂停状态。
- 已验证后端重启保留 RPC 设置，检查后恢复原值。配置/数据放在独立 Docker 卷，restart unless-stopped。
- 普通 twui-lab 验证容器已停止，镜像和卷保留；**twui-compare 的三个容器继续运行，不能在收尾时停止它们**。

功能清单、入口与样例使用见 docs/local-comparison.md。控制命令为 compare:up、compare:down、compare:reset、compare:check。compare:reset 仅重建已知样例任务和文件，不代表 daemon 参数或浏览器偏好回退。逐项人工功能验收尚由用户实际比对，本轮基础部署流程通过不等于清单所有项目已人工确认。

## Git 交付与运行约束

用户明确要求完整提交并推送，随后逐步讨论优化；同时要求本机两个 UI 暂不停止。保持 twui-compare（19080/19081 与共享后端）运行，不在提交/推送或后续收尾时执行 compare:down。Git 忽略的构建资源、node_modules、日志、Docker 数据与本机比较快照继续留在原位置；本次提交不发布 GitHub Release，不将 DSM 待验标为完成。
