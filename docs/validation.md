# 重构验证记录

日期：2026-11-15（Asia/Shanghai）。主要功能与本机验证已完成，当前交付开发候选；SynoCommunity 4.1.4-32 条件式 XDG 接入已完成本机验证，DSM 实机验收保留待办，OpenSpec 尚未归档。以下是实际执行结果，不以测试文件存在代替通过。

首轮完整 Git 交付同时保存了 [精简 JSON 实测证据](validation-evidence/README.md)；完整日志与运行数据仍留在本机忽略目录。

## 最新结果

| 检查 | 实际结果 | 证据与范围 |
| --- | --- | --- |
| lint / 类型 / 生产构建 | 通过 | `npm run check`；最终构建用于三浏览器与短时性能复核 |
| Vitest | 49 项、7 文件通过 | RPC 11、领域 5、分片 2、设置 6、工作流 9、Pinia 15、文案完整性 1 |
| 三浏览器综合回归 | 78 项通过，6 项按条件跳过 | Chromium / Firefox / WebKit 各 26 项；规模专项独立执行，不计入这里通过数 |
| 真实 RPC | 3.00 / 4.0.0 / 4.0.6 / 4.1.4 全部通过 | `artifacts/rpc-results.json`；握手、文件索引/优先级、Tracker、定位/移动/校验、重命名、启停/删除、会话限速 |
| 认证 | 4.0.6 / 4.1.4 401 后显式 Basic 凭据通过 | 实验端口 19094/19090；生产凭据只存页内内存 |
| 真实本地下载 | 四版通过 | `download-results.json`；本地 Tracker + seeder，URL 添加，1MiB 内容 SHA-256 一致 |
| 真实任务控制 | 四版通过 | `controls-results.json`；magnet 接受、四方向队列、任务限速读回、start-now/stop、reannounce 接受 |
| 真实目录匹配 | 四版通过 | `match-results.json`；partial 等待/后项继续/下一候选；取消不送后项；恢复原目录并等校验结束 |
| 真实诊断 | 四版通过 | `diagnostics-results.json`；本地 blocklist 更新、free-space；配置在 finally 恢复 |
| 稳定真实 5,000 任务 | 通过 | 全部 status=0 且 metadata 完整；浏览器虚拟渲染 15 行，无页面错误；fixture 已清理 |
| 可控性能长测 | 完整 1,800 秒通过 | `soak-1800.json` 与冻结构建摘要 `soak-baseline-build.json` |
| 最终构建短时复核 | 60 秒通过 | `soak-60.json`，33 次实际增量；不冒充最终构建的 30 分钟长测 |
| JS/CSS 资源预算 | 总 gzip 322.1KiB，通过 | `bundle-size.json`；包括全部懒加载和语言分块，比首屏范围更大的上界，预算 800KiB |
| 本机安装器故障注入 | 通过 | `test:installer`；安装/升级/回退/卸载、CLI 优先级、锁、异常路径/摘要/链接/未校验文件拒绝 |
| BusyBox 离线部署 | 最终包通过 | 无网络且无 Node/Python，完整静态包、非 root、只读父目录、新容器读取、服务用户正反例 |
| 运行中 daemon 切换 | 最终包通过 | 4.0.6、UID 12345、只读父目录；A→B→回退 A，无需 daemon 重启；RPC 409/会话头 |
| 双路径反向代理 | 三浏览器通过 | `/ui/`→`/rpc` 与 `/nas/transmission/web/`→`/nas/transmission/rpc` |
| OpenSpec strict / legacy | 收尾复核通过 | `old/` 816 文件，无新增/变更/链接；不修补旧框架 |
| SynoCommunity 接入 | 4.1.4-32 本机模拟通过 | 真实 4.1.4、固定上游启停脚本、BusyBox 1.35；XDG 接入/恢复、真实进程核对、完整资源、拒绝分支及持久化卷重建 |
| DSM 实机 | 待验证 | DSM 7.1、型号原文 DS928、SynoCommunity 4.1.4-32；完整型号/build/架构、实际进程环境、ACL 和生命周期证据待补 |

本轮日志已保存在 `artifacts/*-final.log`，结构化汇总为 `artifacts/validation-summary.json`（含最终资源和归档 SHA-256）。验证结束已执行 `lab:down`，实验镜像和数据卷保留，恢复实验先 `npm run lab:up`。

## 环境与复现

主机 Linux amd64、i5-14600K、20 逻辑 CPU、约 62.5GiB RAM。Node 26.13.1、Docker 29.9.3、Compose 5.7.1。镜像来源与源码固定提交见 [进度记录](implementation-progress.md)；所有实验端口仅映射本机回环，使用自有种子/目录。

```sh
npm ci
npm run lab:up
npm run check
npm run format:check
npm run spec:validate
npm run test:rpc
npm run test:download
npm run test:controls
npm run test:diagnostics
npm run test:match
npm run test:synocommunity
```

下载/匹配/诊断脚本会准备 fixtures profile。三浏览器代理场景先启用 proxy；生成 release 必须在构建完成后：

```sh
docker compose -p twui-lab -f lab/compose.yaml --profile proxy up -d --no-build proxy
TWUI_PROXY=1 npm run test:e2e:docker -- --workers=3
npm run release
npm run test:installer
npm run test:deployment
npm run test:release:live
```

Playwright 固定官方镜像为 `mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579`，提供 Fedora 本机缺失的 WebKit 库，使用宿主 UID。该脚本的 host 网络适用于本机 Linux 实验。BusyBox 固定 `busybox:1.37.0@sha256:a7dbc319b1438115a207e11930dc4bb3e643dcb3ec0bdd694bb36cd8fad289ec`，部署测试使用 `--network none`。

构建与浏览器读取必须顺序执行；不能边重写 dist 边测试。此前并发构建造成暂态空页，顺序执行后通过。长测冻结构建，后续候选在独立目录/端口构建和验证；报告分别记录，不混用。

## 5,000 任务性能结果

| 指标 | 完整 30 分钟冻结构建 | 最终构建 60 秒复核 | 预算 |
| --- | --- | --- | --- |
| JSON 解析后到两帧的初始渲染 | 235.4ms | 227.4ms | ≤1,000ms |
| 500 项增量 P95 | 68.6ms | 66.7ms | ≤150ms |
| 排序 P95 | 152.3ms | 163.1ms | ≤200ms |
| 筛选 P95，含 120ms 防抖 | 280.2ms | 254.7ms | 防抖另记 |
| 筛选 P95，扣除配置防抖 | 160.2ms | 134.7ms | ≤200ms |
| GC 后最大 JS 堆 | 47.26MiB | 47.37MiB | ≤200MiB |
| 对齐 GC 后增长 | 0.516MiB / 30min | 0.155MiB / 60s | 30min ≤20MiB |
| 实际增量次数 | 854 | 33 | 如实记录 |

数据为 5,000 任务、20 个业务列、每轮 500 项变化，刷新间隔配置 2 秒。调度是请求完成后再等待，不声称 1,800 秒恰好 900 次更新。渲染计时从 JSON 已解析至两次 requestAnimationFrame，排除网络；排序/筛选含输入处理和两帧，筛选另报告原始值与扣除配置防抖值。堆每 30 秒经 CDP 显式 GC 后采样，不代表浏览器进程 RSS。

长测构建与最终构建不同：后续增加写后界面保护、批量取消、Tracker 失败重读和格式化；长测资产摘要单列，最终构建使用同流程 60 秒复核。生产轮询/实体更新策略没有在此后更改。原始 JSON 和日志保留，后续性能路径变更需重新完整长测。

复现可控长测（默认 1,800 秒，不能用短测代替）：

```sh
TWUI_SOAK=1 npm run test:e2e:docker -- --project=chromium tests/e2e/soak.spec.ts
# 最终构建短时复核入口
TWUI_SOAK=1 TWUI_SOAK_SECONDS=60 npm run test:e2e:docker -- --project=chromium tests/e2e/soak.spec.ts
```

真实 daemon 规模独立复现：

```sh
npm run lab:seed -- --count 5000 --port 19093 --settle-paused
TWUI_REAL_SCALE=1 npm run test:e2e:docker -- --project=chromium tests/e2e/performance.spec.ts
npm run lab:seed -- --clear --port 19093
```

`--settle-paused` 仅对映射到本机实验端口的服务做正常停止/启动，让 daemon 完成已排队初始校验状态的持久化并核对全部暂停。添加时 paused=true 本身不保证初始校验队列结束。稳定结果见 `stable-5000-daemon.json`；一次真实 Chromium 样本：导航到行可见 424.7ms、筛选含防抖及自动化等待 216.1ms、使用堆 58.58MiB、15 行 DOM，无页面错误。此单次样本与可控 P95/长测分别解释。

`.lab/seed-19093.json` 只记录自有 hash，清理同时校验名称前缀，当前 manifest 已空。前轮初始校验队列下移除较慢，曾按 manifest 离线清理自己的记录；本轮使用稳定暂停基线后通过 RPC 完成全部清理，没有删除其他任务或实验卷。10,000 文件用三浏览器验证虚拟渲染、筛选后原始 RPC index；分片图保持最多 512 画布单元。

## 行为追踪与三浏览器范围

| 历史行为/风险 | 新框架验证 |
| --- | --- |
| B01/B02/B03/B10 | 空快照可用；增量新实体补齐；失败保留缓存和错误；恢复清 stale |
| B08/B09 | 刷新峰值并发 1；HTTP/auth/protocol/business/network/timeout/cancelled 均结算；409 有界，写失败不自动重发 |
| B11 | session 身份变化、旧 generation 快照、晚到详情和成功保存；捕获身份变化拒绝删除；空目标不发命令 |
| B06/B07 | 数值与标签/Tracker 排序；同长度 Peer 内容变化更新；列布局顺序/宽度/可见性持久化 |
| B04/C08 | 真实四版 Tracker 参数；批量预览不写；外部更改冲突；3.00 多步部分失败后重读且不重试写 |
| B05/B12/C02 | URL/文件/magnet、无效 metainfo 后续继续、最后成功标签、重复独立结算；一次性目录不变默认值 |
| C01/C06/C07 | 稳定标签 ID/hash、说明/颜色、悬空索引报告、字典独立导入、事务/跨页同步、endpoint 隔离 |
| C03/C10 | 实际校验等待；partial 后继续其他项；下一目录、超时、取消、恢复后校验；保存作业不自动重放 |
| C05/C11 | wanted number/boolean；名称 HTML 只作文本；启动无第三方请求，手动服务失败可重试 |
| I01–I04 | 归档安全与全文件摘要、目标边界、失败不切换、升级回退/非 root/离线 BusyBox、运行中 daemon 切换 |

每个浏览器 26 项：规模安全文本 1、四版真实添加/详情/删除 4、选择/Shift/右键与移动布局 2、详情/10,000 文件/草稿竞态 3、迁移备份重置 1、添加/身份确认/取消 3、设置跨页/独立 daemon 差异/手动服务/诊断 3、16 语言与异步语言/主题 2、列布局 1、Tracker 批量 1、移动真实 4.0.6/4.1.4 旧入口流程 2、双路径代理 2、匹配窗口重开/partial/恢复 1。语言测试遍历全部 16 个选项并检查回退；不等价于第三方人工完成全部语言校对。

## 真实版本差异与安装边界

| 项目 | 3.00 | 4.0.0 | 4.0.6 | 4.1.4 |
| --- | --- | --- | --- | --- |
| RPC 版本 | 16 | 17 | 17 | 19 |
| wanted JSON | number | boolean | number | number |
| 重复添加 | torrent-duplicate | business: duplicate torrent | torrent-duplicate | torrent-duplicate |
| Tracker 更新 | 扁平位置/URL 对，删除后重编号 | trackerList | trackerList | trackerList |

3.00 先替换后删除/新增，依据 [该版 rpcimpl.c](https://github.com/transmission/transmission/blob/3.00/libtransmission/rpcimpl.c) 和真容器；其他 3.x 衍生版需扩展实测，不推断所有分支相同。4.0.0 若重复错误未返回身份，报告重复但不擅自修改标签。真实校验/移动测试同时核对最终数据内容，reannounce 只声称命令已接受，不保证远端 Tracker 在线。

3.00 原 daemon 在 OpenSSL 3 的 Peer 加密场景曾退出 139；仅实验容器启用 default/legacy provider 后下载通过，保留官方源码。此实验适配不进入 release、不要求 NAS 改加密环境；上游补丁背景见 [Debian Transmission 3.00 补丁记录](https://sources.debian.org/patches/transmission/3.00-2.1%2Bdeb12u1/)。

安装器采用受管理目录、相对链接和标准 mv 能力探测，无 mv -T 前提；GNU/BusyBox 均执行回归。发布包包含安装、迁移和群晖说明，全部在内部 SHA256SUMS 中校验，不含 sourcemap、旧工程、node_modules 或实验 Python。外层摘要与完整包位于 artifacts。安装不会替用户修改 daemon 启动脚本或自动重启服务。

## 依赖审计与未完成事项

开发依赖更新至 Vitest 5.1.0 等兼容版本，先前 critical/high 告警已消除。`npm audit --omit=dev --json` 生产依赖漏洞数为 0。兼容范围内 `npm audit fix` 后仍有 11 项 moderate 开发依赖链告警，涉及 typescript-eslint/minimatch 和 Vue Test Utils/js-beautify/glob/editorconfig；当前未应用 audit --force 提议的依赖降级。它们是实际保留项，不写成全依赖零漏洞。审计是本次联网运行时快照，后续发布前重新核对。

DSM 已提供双路径说明、只读工具/实际服务账户可读性预检和本机正反例；用户已确认 SynoCommunity 4.1.4-32，已补齐真实进程核对后的 XDG 接入和本机上游脚本模拟；尚缺实际 DSM 的有效进程环境、ACL、NAS 重启、套件升级和容器重建记录。型号仅按用户输入 DS928 保存，不推断其他型号/架构。Linux Docker 通过不能代替这些证据。详见 [群晖说明](synology.md)。

正式验收前保留主变更未归档；当前未发布到外部，也未操作真实 NAS。完整规格和实现入口见 [追踪矩阵](traceability.md)。

## 用户定版 SynoCommunity 4.1.4-32 的新增证据

用户补充版本后新增真实 4.1.4 镜像（固定 `a6d907d9ea2313143af714d7830feb6c1b60b84c`，端口 19095）及认证实例（19090）。四版重新执行 RPC/下载/控制/匹配/诊断，4.1.4 保留旧 RPC，实测版本 19；详见各 results.json。三浏览器新增该版本的桌面与移动流程，最新 78 通过、6 专项跳过。生产前端资源与上一轮性能复核构建相同，本轮改动是实验矩阵、安装接入与文档，没有改渲染/同步代码，因此没有重复完整性能长测。

`test:synocommunity` 固定上游 `5e012dab21d616c9f5a41dabab755caf73b660aa` 的 start-stop-status 和 package service-setup，生成通用变量前缀，以真实非 root sc-transmission 启动真实 4.1.4。使用 BusyBox 1.35 静态工具执行接入脚本，版本夹具包含全部预编译前端资源（排除 sourcemap），核对生产入口与 JS 内容摘要。测试中只给自己的容器设置账户与持久化卷，不修改宿主账户或 NAS。

已验证只读身份/环境检测、PID 拒绝、实际服务账户要求、已有非受管 XDG UI 拒绝、幂等接入、运行中 UI 升级与回退、注册未解绑卸载拒绝、新容器重装上游脚本后接入保留、不支持修订号/Web 环境覆盖/临时 XDG 路径拒绝、外部改动链接拒绝删除、解绑重启恢复原 UI 与 RPC 握手。供应方脚本和原 UI 摘要前后保持一致；这些 Error 行是预期拒绝测试，最终结果以脚本退出和 synocommunity-results.json 为准。

实验 Dockerfile.synocommunity 中的 Bash/procps/静态 BusyBox 用于运行上游脚本与忠实回收进程，不进入 release；正式安装器另使用官方 BusyBox 1.37 在无网络、无 Node/Python 环境验证。真实 DSM 的实际账户 HOME/XDG/ACL 可能不同，适配器检查失败时不会改目录或尝试写供应方脚本；NAS 按 synology.md 先做 inspect，再决定 attach。完整设备证据未取得前主 OpenSpec 仍不归档。

## 本机双端口人工对照环境

用户在本轮要求实际部署旧 UI 与重构 UI。twui-compare 使用 19080 / 19081 两入口，共享独立真实 4.1.4。旧源码 old/src 只读；新端使用通过外层/资源摘要检查的预编译 Release 快照，不受随后 dist 重新构建影响。旧版只经已有配置项调整默认全部任务/中文与本地自动更新空结果，未修补旧代码。old/ 816 文件检查继续通过。

新增独立 Playwright 配置 playwright.compare.config.ts，三个浏览器真实打开两端：核对共同任务、RPC 19、从新端开始、等待旧端真实轮询后勾选暂停，观察两边状态；收尾恢复暂停。测试期间发现旧版“看详情”和“勾选操作”本来就是不同状态，且旧端按钮根据已刷新的状态启用，测试按其真实交互等待，不修改 old/。结果/截图见 artifacts/comparison-*，不计入重构主矩阵的 78 项。

compare:check -- --restart-check 对同一 daemon 临时修改一个连接数参数、正常重启后从两入口读回，并恢复原值，验证对照配置不是每次启动都重置。原实验入口保持原默认行为；compare 通过 TR_INITIAL_SETTINGS_ONLY=1 启用持久化启动模式。两个 UI 均为非 root 静态代理，daemon 不向宿主单独暴露端口；只发布本机 127.0.0.1:19080/19081。

现有六个本地样例的真实进度为 100%、0%、50%、50%、0%、100%，均暂停；文件和 config 保存在 twui-compare 卷。另提供未添加的 G 文件/URL。重置只按自己 manifest 的 hash 移除和重建样例，不删其他任务。人工核对项目见 local-comparison.md；空 Peer 数据不代表所有 Peer/外部服务功能已经实际逐项测试。

本轮保留 twui-compare 运行供用户比对，仅停止 twui-lab。截图和当前部署/摘要信息在 artifacts/comparison-results.json、.lab/comparison/deployment.json。不要将本机代理和实验 Python 当作 NAS Release 的额外运行依赖。
