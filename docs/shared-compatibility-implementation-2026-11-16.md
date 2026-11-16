# 共用兼容性修复实施与验收（2026-11-16）

依据既有 OpenSpec 第30节、D1–D9、C1–C11实施。用户本轮明确解除G0的“只设计”限制；不恢复任务配置tab，不归档主变更，不提交或推送git。19081发布仍须单独满足G4，本轮不发布。

## 实际修改

- 勾选由store捕获id/hash/generation，checkedIds为派生视图；表格/全选/Shift/移动使用统一入口。工具栏取冻结选择，右键冻结打开时的范围，文件操作从已加载详情身份取得目标。动态读取增加hash，换身份替换实体；缺hash先使旧选择失效，补齐按hash优先且检查generation/行对象修订。详情按hash读取并核对返回身份/请求序号。已观察到删除又重加时，以仅内存Symbol修订令旧窗口失效；不更改持久化schema或目录匹配恢复格式。
- 已完成统一为haveValid+haveUnchecked，严格校验安全整数、求和及元数据就绪后的可信总量。只清本轮明确请求但缺失的字段；基础读取不清动态数据。磁力元数据就绪时沿现有批量补齐重新取得总量。
- Tracker人数仍是报告合计，10+10=20，部分未知为未知，活动连接独立；列表/概览提示非去重。下载进度和校验进度仍各自使用daemon字段。文件wanted严格识别bool/0/1，未知可从同index备用数组回退，低优先级-1保留。
- 传输限制读取真实基线，下载/上传各自保持/关闭/限制三模式，默认保持。预检整批后才写，已达到目标优先列无需修改；只比较触及字段并发送最小patch。关闭只写Limited=false；显式0有阻断方向提示。回读匹配才算保存，失败/未知/取消逐项保留，不自动重放、回滚或改全局字段。
- Tracker编辑/批量预览采用完整id/URL/顺序/标准化分组基线，忽略scrape变化。4.x完整trackerList及分组编辑保留；回读允许重新分配id。历史已有重复URL在编辑其他成员时保持，新增重复冲突才拒绝。3.00仅单类操作：纯URL替换、独立追加、独立删除；任意分组/混合计划UI与提交层同时拒绝，0次修改RPC。没有事务模拟或清空重建。输入变化/换连接/关闭后晚到批量预览失效。
- 保存锁从预检开始取得归属token，单项/批量复用执行层；旧generation不能解除新锁或覆盖新结果。重新提交需要明确重新读取/预览。新增表单提示和关键冲突/未知结果有中英文，其他语言沿用英文回退。

## 支持边界

| 能力 | 3.00 | 4.0.0 / 4.0.6 / 4.1.4 |
| --- | --- | --- |
| 核心读取、身份保护、真实持有量、文件操作、独立限速 | 已实现；真实数据与受控故障分层核对 | 已实现；同样核对，4.1.4为必测基线 |
| Tracker纯URL替换、独立新增、独立删除 | 已支持，单个修改RPC后回读 | 已支持，完整列表保存后回读 |
| 任意分组、混合替换/删除/新增 | 挡板受限，UI/提交层零修改RPC | 保留完整编辑，不传播3.00限制 |
| 临时连接失败 | 不永久降级；按session/generation重新判定 | 相同 |
| 分块截断、复杂正则、超大文件首载、磁盘轮询重构 | 延期 | 延期 |

真实隔离验证确认3.00的4,294,967 KB/s可回读，4,294,968会变为0。保护上限只用于3.00，不采用此前推算的4,194,303。4.x本机64位构建核对相同临界点及JS最大安全整数，均按输入回读；这不是所有定制/32位构建或实际吞吐的保证。已有大值仍可保持或仅关闭Limited，不夹断重写。

源码依据：[3.00 torrent.c](https://raw.githubusercontent.com/transmission/transmission/3.00/libtransmission/torrent.c)的unsigned int B/s保存及KB/s转换、[3.00 rpcimpl.c](https://raw.githubusercontent.com/transmission/transmission/3.00/libtransmission/rpcimpl.c)的输入映射、[4.0.6 transmission.h](https://raw.githubusercontent.com/transmission/transmission/4.0.6/libtransmission/transmission.h)的size_t速度类型。数值结论以本轮隔离回读为限，不由版本字符串猜平台位宽。

## 验证与证据

- 单测：122项通过，含身份复用/已观察删除重加/补齐及详情晚到、持有量/未知/文件哨兵、方向独立最小patch、全批冲突零写入、取消与旧锁隔离、Tracker完整基线、3.00挡板/独立操作、连接能力重算。`tests/unit/shared-compatibility.test.ts`与新增store用例。
- 四版真实daemon：`validation-evidence/shared-compatibility-daemons.json`；脚本`test-shared-compatibility-isolated.mjs`创建唯一容器，无网络/宿主端口/挂载，只操作32KB自建样例并finally清理。核对16KB持有/100%所选进度、限速保持上传/关闭保留值/显式0/极值、Tracker替换与独立增删、4.x完整分组及只改组、文件原始index与-1。此层为真实RPC回读；ID复用、故障和并发窗口由受控store/浏览器验证，不伪称真实站点故障或吞吐验收。
- 短时性能：`validation-evidence/shared-compatibility-performance.json`，相同5000行/20列30次同步更新+排序样本。旧P95约6.63ms，新约10.28ms；动态请求体345→386字节，合成5000行响应约1.09→1.55MB。增加hash/持有量有实际代价，仍低于200ms模型预算。另有浏览器虚拟行及刷新选择稳定性检查。不是帧率/30分钟压力认证；13.12保持开放。
- 静态检查：lint、format、typecheck、OpenSpec strict、git diff --check通过，old/ 816文件完整，JS/CSS gzip约382KiB低于800KiB预算；详见`validation-evidence/shared-compatibility-checks.json`。
- 最终浏览器：Chromium/Firefox/WebKit串行各71项，共213项相关用例通过（同一冻结构建）；`validation-evidence/shared-compatibility-browsers.json`及对应日志/三个独立报告。包括最后新增的3.00纯替换/独立增删、挡板、4.1.4分组、限速最小提交、旧预览失效、四皮肤明暗窄屏及5000行稳定选择。原过时Daemon分类用例按下述历史边界单列，未计入213项。
- 冻结构建：`validation-evidence/shared-compatibility-build.json`记录全部78个dist文件（含开发source maps）的SHA-256，`shared-compatibility-build.log`记录构建。候选包排除source maps；从冻结dist打包，不触发build。
- 对照只读：`validation-evidence/shared-compatibility-readonly.json`，19080/19081各7任务，身份摘要相同，修改RPC=0，静态入口摘要记录。未重启/重建容器、卷或改变任务状态。

### 既有测试失效与调整记录

1. 两项旧store测试原本要求3.00混合替换/删除分多步执行；D9/C11明确撤回这一契约。本轮用混合计划零写入以及纯替换未知结果不重试用例替代，属于已授权能力边界，不是放宽4.x断言。
2. 旧完成量单测的`totalSize-leftUntilDone`是本轮明确修复对象，改为真实持有字段；表格正常512B断言保留，fixture补haveValid/haveUnchecked。数字ID专用详情/文件mock补hash寻址；Tracker mock写入更新实际状态，原期望断言保持。
3. `details.spec.ts`中“task configuration tab is removed...”最后仍查找已在前轮移除的Daemon设置分类/旧config-grid。它在本轮候选和`.lab/settings-state-verified-release/web`均同位置失败，当时保留原测试未修改。单列历史失败报告`.lab/shared-compatibility-baseline-report`；首轮正式相关组排除该过时整项，并加入现行七分类`settings-parity`。此前该项的四详情tab/无配置读取断言已到达；其他详情、文件、主题与现行设置有独立回归。不能声称整个仓库浏览器套件全绿。
4. 首轮mock/新测试定位器失败的报告保留，不累计其中通过数到最终通过数。最终三个浏览器组均仅使用最后一次冻结构建。

## 剩余边界

协议无CAS；预检后外部修改仍存在竞争窗口，回读只能发现不符。未被任何刷新观察到的“同hash同ID删除并重加”无法识别；已观察到移除则会使旧选择和窗口失效。真实daemon数据验证和受控UI/故障验证分别列证，不声称所有网络情形已实测。未做DSM实机、30分钟压力测试或分块算法重构。

## 候选与发布

离线候选：`artifacts/transmission-web-ui-2.0.0-shared-compatibility-20261116.tar.gz`，旁边`.sha256`记录归档摘要，归档内`SHA256SUMS`记录所有文件摘要；静态资源由最后冻结的dist直接复制，未再次构建。包括本地资源、安装脚本、manifest和文档，运行不依赖Node/Python或CDN。

本轮不更新19081；G4、主变更归档和git提交均未执行。30.1–30.26按上述支持/挡板及明确的历史测试边界验收，30.27保持未完成。

## 阻碍项后续收口（2026-11-16）

旧详情测试已维护为现行七分类设置：保留四详情tab、无任务配置控件、无任务配置字段读取与无写RPC的隔离断言；将已撤销的Daemon分类/config-grid布局断言改为七分类完整列表、真实下载目录可读可编辑、初始保存禁用和零写RPC。未扩大功能挡板。冻结dist未重新构建，三浏览器该文件6项全部通过（含原先排除的测试各1项）；报告`.lab/blockers-details-report`。此为补充结果，不把重复用例累计进前述213项，也不宣称全仓库套件已全绿。

新增`test-blockers-runtime.mjs`与`tests/runtime/blockers.spec.ts`，只复核38.5历史阻碍：3.00/4.1.4队列1→2→关闭后显式普通启动，4.0.6/4.1.4真实分钟时段进入/退出、实际字节速率和未保存草稿保护。唯一临时容器/专用网络，64MiB私有本地样例，冻结dist只读挂载，finally清理；端口19891–19893/19896，不触碰19080/19081任务。为避免覆盖证据，脚本发现`.lab/blockers-runtime`已存在会退出；再次运行须先保留重命名该目录及对应报告/结果/JSON。

首轮1通过/2失败保留于`.lab/blockers-runtime-*-attempt1`：4.0.6时段通过；队列采样早于peer连接，零字节失败。第二轮2通过/1失败保留于`*-attempt2`：4.0.6、4.1.4时段与草稿通过，4.1.4队列通过；3.00三任务status=4，但90秒内仅两任务建立实际传输（只读诊断第三任务无peer）。不能据此声称默认uTP网络效果完成。最终脚本改用每版独立swarm，并通过UI显式禁用uTP，限定为TCP队列复核；没有改变生产默认值或降低实际字节增量断言。

最终独立运行3项全部通过（3.5分钟）：3.00与4.1.4 TCP队列三任务在10秒内分别均增加约0.39–0.46MB；4.0.6约131→32.8→131 KB/s，4.1.4约128→32.8→128 KB/s，均通过真实时段进入/退出、界面同步及端口草稿隔离。机器证据`validation-evidence/blockers-followup.json`同时保存首两轮失败及最终结果，不覆盖失败历史。对照任务、设置、三个容器启动时间/重启次数前后相同，临时容器及网络已清理。lint、typecheck、目标文件格式、OpenSpec strict、diff检查及old/816文件校验通过。

本次仅测试维护与证据补齐，无生产源码新增修改；78个冻结dist文件与原摘要一致，原离线候选归档SHA256校验通过，无重新构建、重新打包或19081发布。补充报告位于工作区，不回写旧候选包内的历史报告。38.5公网/默认传输模式/扩展时段矩阵、13.12压力、DSM及30.27发布继续开放。

## 最新封板范围决定（2026-11-16，用户收敛）

本轮优先保障已覆盖的4.0.0、4.0.6、4.1.4，依据现有冻结构建及已有证据结束兼容性修复的开发/验证循环，候选按本轮范围封板。没有新缺陷或源码变化，不重复跑已通过测试、不重新构建，也不为补全所有网络组合扩大本轮范围。这不是所有设置/网络场景的全面认证，不包含未测试的其他4.x版本。

3.00按当前能力挡板和已知边界放行；尚未定位的默认传输模式单任务peer连接失败暂缓处理，不阻挡本轮候选。现有证据未确认该现象为严重UI阻塞，不能写成已经修复；后续只有发现误操作任务、数据破坏、核心功能持续不可用等严重问题才重新列为阻断。

38.5扩展网络/时段矩阵、DSM及13.12长测保留为后续待办，不作为本轮封板前置条件。4.0.0既有uTP限速风险提示与已验证TCP路径继续保留。4.x已正常功能的已确认退化仍会阻断对应改动，不能用挡板绕过。

封板不等于发布或主变更归档：沿用现有离线候选及摘要，19081发布仍按G4和届时授权执行，30.27保持未完成；不自动commit、push或归档。

## G4发布准备（尚未发布）

已记录当前19081实际运行的378个静态文件摘要、部署记录、19080/19081各7项任务身份/状态和三个容器生命周期信息，见`validation-evidence/shared-compatibility-publication-preflight.json`。现存`.lab/settings-state-verified-release/web`的43个文件全部与当前运行目录对应文件一致，可作为当前版本的既有静态候选参照；没有把更早的settings-contrast版本冒充当前版本，没有新增备份。冻结候选归档摘要再次匹配`83900acada1ae2aebe642cd80c0bfde69f539e3e995fdc0dac041e95e8ab89aa`。

待执行的具体动作：仅将候选静态资源更新到19081，资源先行、HTML入口最后，保留旧哈希分块，更新部署记录并做只读验收；不重建、不重启容器、不修改daemon设置或任务数据、不提交推送。按用户此前单独保留的G4发布边界，等待对19081发布的明确授权；30.27未勾选。准备记录不是发布结果，实际执行时须核对当前状态未变化。

## G4实际发布结果（取代前述待发布状态）

用户明确确认发布19081并沿用现存回退资源、不新增备份后，已将冻结候选发布到`.lab/comparison/modern-web`。归档SHA256仍为`83900acada1ae2aebe642cd80c0bfde69f539e3e995fdc0dac041e95e8ab89aa`；先资源后HTML，逐文件原子替换，保留旧哈希分块，没有重建或重新打包。44个候选web文件的磁盘及HTTP摘要全部匹配，部署信息返回同一归档摘要。

19080入口不变，7项对照任务及daemon设置、三个容器启动时间/重启次数前后完全相同，修改RPC为0。现存`.lab/settings-state-verified-release`为核验过的发布前静态版本参照，没有新增备份。浏览器只读加载连接正常、七分类设置正常、无页面异常，所有修改RPC均设置拦截且未发生；截图`artifacts/shared-compatibility-live.png`。证据见`validation-evidence/shared-compatibility-publication.json`及`shared-compatibility-live-browser.json`。

30.27已完成。本轮范围内开发、验证、候选交付与19081发布已收口；3.00非严重连接问题及扩展矩阵等延期边界不变，不据此宣称全场景认证。没有commit、push或归档主变更。

## 版本封板与源码交付

用户确认当前版本封板，并授权提交全部本版本源码、测试、规格、文档与验证证据到远程。此前“不commit/push”的记录属于历史阶段，由本次授权取代；OpenSpec主变更不自动归档。沿用已发布冻结资源，不重建、不重跑兼容性矩阵。后续NAS联机与实际使用另行开展，本次不修改NAS或对照任务。离线包、运行目录、依赖、截图与浏览器原始报告保留在本机既有忽略目录，git纳入可追踪的实现及摘要证据。
