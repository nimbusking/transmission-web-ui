# OpenSpec 与实现追踪

依据：`project_outline.md` 第 17–21 节；规格为 `openspec/changes/rebuild-transmission-web-ui/`。最新执行结果见 [validation.md](validation.md)，系统边界见 [architecture.md](architecture.md)。本机通过不替代 DSM 实机验收。

| 能力规格 | 实现入口 | 已执行验证 | 保留边界 |
| --- | --- | --- | --- |
| rpc-connection | services/rpc.ts、config.ts、stores/app.ts | unit/rpc、store；test:rpc 四版；401 认证；双路径代理三浏览器 | 仅单实例同源，写未知结果不自动重试 |
| torrent-synchronization | domain/torrents.ts、stores/app.ts | 空/增量补齐/失败缓存/刷新合并/旧 generation/session 重连/早期 4.0 全量核对 unit；真实规模与长测 | 会话轮询和核对周期见架构，网络耗时与渲染分开计 |
| torrent-browser | Workspace、TorrentTable | 三浏览器 workspace/selection/layout；真实稳定 5000；20 列可控更新与完整 30 分钟 | 完整长测资产冻结，最终构建另做同流程 60 秒复核 |
| torrent-operations | ActionDialog、AddDialog、stores/app.ts | store unit；e2e/operations；test:rpc/download/controls 四版；真实移动端 | 已送达命令不因取消撤销，逐项 success/duplicate/failed/unknown/cancelled |
| torrent-details | DetailPane、PieceMap | e2e/details 三浏览器：10000 文件原始索引、失败草稿、晚到成功；pieces unit；真实文件/Tracker 参数 | Peer 为详情展示与手动 IP；分片为有界画布 |
| batch-workflows | batch/workflow/match-controller、WorkflowDialog | workflow/store unit；test:match 四版取消/恢复；e2e/workflow/trackers/operations 三浏览器 | daemon 无事务/CAS，冲突需核对，取消与恢复分别处理 |
| settings-migration | settings/session-fields、SettingsDialog | settings/store unit；e2e/migration/settings：备份/重置/跨页/独立 daemon 差异 | 不能修复未知历史标签错位，保留原文；同字段最后提交生效 |
| responsive-interface | Workspace/style、index.mobile.html | 三浏览器 mobile-real 真实 4.0.6/4.1.4 与 selection 移动视口；旧入口查询/hash 保留 | 移动以常用操作为目标，完整高级编辑在桌面 |
| localization-theme | i18n、App | 中英 key 完整性 unit；三浏览器遍历 16 语言、延迟包竞态、主题重载 | 历史语言缺失新文案用英文，不声称全部人工翻译校对 |
| release-installation | release/install、synology-check、release.mjs | 安装器故障注入；最终完整包 BusyBox 无网络/无运行时；非 root 父目录；真实 daemon A/B/回退；代理 | SynoCommunity 4.1.4-32 XDG 接入经 test:synocommunity 的真实 daemon/上游脚本/BusyBox 模拟；真实 ACL/重启/升级待设备证据 |

源文件位于 src/，测试位于 tests/unit 与 tests/e2e；真实协议/下载/安装脚本位于 scripts/。三浏览器各 26 项、共 78 项通过，6 个专项跳过不算通过；专项报告见 validation.md。OpenSpec tasks 按这些执行证据勾选，主变更未归档。

## 已明确的协议与旧行为修正

1. 3.00 Tracker 使用该版本实际的扁平位置/URL 参数，先替换再删除/新增；4.x 使用 trackerList tier。多步部分失败刷新实际状态并保留原始错误，不宣称原子回滚。
2. completeSize 沿用有效旧行为 `max(0, totalSize-leftUntilDone)`；Peer 计数使用非负 Tracker 统计并附当前连接数。标签按名称、Tracker 按主机字符串排序。
3. wanted 的 number/boolean 归一化；4.0.0 重复 business 错误缺身份时只报告重复，不任意补标签。
4. 3.00 OpenSSL 3 legacy provider 仅属于实验容器，前端包不携带或修改目标服务加密环境。
5. B/C/I 追踪验证针对新实现，不修改 old/。详细对应、计时口径和证据局限见 validation.md。
