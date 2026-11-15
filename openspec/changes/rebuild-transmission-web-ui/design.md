# Design

## Context
以 project_outline.md 第 17–21 节为行为证据；old/ 是用户移入的参考代码，不修补、不重新生成其 min 文件。实施目标、取舍已由用户确认。

## Goals / Non-Goals
**Goals:** 桌面有效功能完整、移动常用操作、5,000 任务、单实例同源、Transmission 3.00/4.0.x/4.1.4、Linux/Docker/群晖、可迁移和回退。
**Non-Goals:** 多实例聚合、自建认证后端、SSR、旧主题逐像素复刻、旧 bug 兼容、第三方服务自动访问。

## Decisions
1. 单应用 Vue 3 + TypeScript + Naive UI + Pinia + Vite；hash 路由；Vue I18n；Zod 边界校验；IndexedDB/idb；Vitest + Vue Test Utils + Playwright。所有依赖固定于锁文件。
2. app → features/components → services/domain → RPC；组件不直接请求或写持久化。RPC call 返回 Promise；错误区分 HTTP/auth/business/protocol/network/timeout/cancelled。默认 20s 超时，409 最多重发两次，其他写操作失败不自动重试。
3. TorrentTarget={id,hashString,generation}；写操作冻结目标并校验当前 generation；禁止空数组成为全局操作。实体缓存、详情、选择、草稿和请求状态独立。
4. 浅层实体映射，变更时替换对应实体，其他引用保持不变。快照、增量、缺失基础补齐串行；详情仅当前页请求。列表默认5s、最低2s，会话30s；全量核对60s，4.0.0–4.0.5为15s；后台30s且暂停普通详情。
5. RPC 3.00 按当前列表的位置执行 Tracker 编辑，trackerReplace 使用扁平位置/URL数组，先替换再删除/新增以避免重新编号；4.0 使用 trackerList 并保留 tier。wanted 的0/1与boolean统一。文件添加统一metainfo；URL/magnet用filename。普通写操作返回后刷新目标；超时结果标记unknown。
6. 任务表默认200条分页，支持连续列表与虚拟滚动；32px行高。按字段key保存列宽、顺序、可见性。详情与勾选分离；Shift按页内排序序列；切分类/页清勾选。右键已勾行使用集合，否则使用该行。
7. 标签保留本地，使用稳定ID和hash映射；设置v2按RPC origin+pathname隔离。IndexedDB事务字段级更新，BroadcastChannel通知同源页面。迁移先备份和预览，保留旧key。只重置UI不删除标签/字典；daemon配置导入独立确认。
8. 自动匹配仅暂停且元数据完整任务，move=false；串行校验并等待结束。完整文件集验证成功才matched；partial暂停该项等待选择，其他项继续；30分钟超时waiting-user。取消不撤销已送达daemon命令，显式恢复原目录需重新校验。持久化日志不自动重放。
9. 普通批量并发3，移动和匹配串行；每项独立结算。异常时保留草稿和缓存。一次性添加参数不隐式改变daemon默认值。
10. <768px移动列表和底部操作，768–1023px折叠导航；桌面左导航+表格+可伸缩底部详情。中英完整，其他语言迁移、英文回退。light/dark/system主题；外部服务仅手动触发。
11. JSON运行配置默认../rpc；同源校验，认证仅会话内。生产静态包含manifest和摘要。独立prefix/releases/version，current相对软链切换；不覆盖官方资源。Docker挂载父目录而非单个软链。
12. 容器从官方版本源码构建3.00、4.0.0、4.0.6、4.1.4。固定源码摘要和基础镜像；隔离目录、回环端口、本地数据、Tracker和seed，无真实用户数据。分别提供RPC、浏览器、安装和性能证据。
13. Release 是预编译、资源完整的离线静态包；安装和运行不依赖 Node.js、npm、Python、编译器或外部 CDN。安装只使用 POSIX sh 和目标系统已有文件/摘要工具；在线下载时才需要 curl/wget。Docker 是本机验证环境的依赖，不是套件版或普通 Linux 安装 Web UI 的依赖。
14. 群晖目标基线为用户提供的 DSM 7.1（型号原文 DS928，完整标识和架构待核对），分套件版 Transmission 和 Docker 套件容器版两条路径；较新 DSM 另保留 Container Manager 说明。DSM 7.1 不以 Container Manager 项目/Compose 作为安装前提。安装前检测实际服务用户、Web 根目录和工具能力，不硬编码 volume1、root 或套件目录。静态包与 CPU 架构无关；套件已确认 SynoCommunity 4.1.4-32，提供真实 daemon 环境核对后的 XDG public_html→prefix/current 接入，不改供应方脚本和资源；套件生命周期与 ACL 必须按实际 DSM 验证。容器挂载受管理父目录，验证非 root 读取、相对软链、重建/重启、升级与回滚。保留套件自带 UI 和配置，不自动修改供应方启动脚本。真实 DSM 无法在本机 Docker 中替代验证，报告中明确区分模拟测试和 NAS 实机证据。

15. SynoCommunity 接入仅对明确验证的 4.1.4-32 自动开放，inspect 不执行 INFO/服务脚本；attach 需要实际服务账户、进程二进制/config-dir/启动身份与有效数据路径核对，拒绝 Web 环境覆盖和非受管 XDG UI。注册后卸载前必须 detach；不自动重启。4.1.4 保留旧 RPC，本版继续用四版实测的兼容协议，不推断未来 5.x 支持。

## Risks / Trade-offs
- Naive UI列宽事件不稳定 → 应用自有列头尺寸/顺序控制，不依赖内部DOM。
- 早期4.0 recently-active遗漏 → 周期全量核对，写操作后定向重读。
- daemon无跨命令事务或CAS → 捕获目标、写前核对、逐项报告和unknown状态，不声称原子回滚。
- 旧标签历史错位无法推断 → 原始备份，按现有位置迁移并报告悬空项。
- 移动端高级功能不在首版 → 明确功能矩阵，业务核心共享。
- 性能结果依赖环境 → 生产构建、固定数据与浏览器记录，预算不通过不标完成。

## Migration Plan
规格与baseline → 工程/实验环境 → RPC/同步 → 表格 → 普通业务 → 迁移/工作流 → 移动/语言 → 发布验收。各阶段同时提交测试和文档。仅新版本完成准备后切current；安装失败保留当前版本。旧浏览器存储不删除，回退旧UI仍可读取。

## Performance budgets
5000任务/20业务列：响应收到到可交互≤1s；排序筛选P95≤200ms（防抖另记）；2s更新500项P95≤150ms；JS堆≤200MiB；30min对齐GC增长≤20MiB；首屏JS/CSS gzip≤800KiB。大文件详情10000项虚拟渲染，关闭释放。真实daemon规模和可控高频fixture均需验证。
