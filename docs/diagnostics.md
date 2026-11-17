# 2.1.0 本地诊断与离线重放

遇到问题时，可先按[用户故障自查与检测记录检查表](diagnostics-self-check.md)保留现场、逐项排查并填写反馈。该检查表是仓库公开文档，不随生产页面打包。

## 用户采集
登录页面和工作台“关于”中的“诊断信息”使用相同入口。默认仅在当前浏览器收集元数据，不上传日志。关闭采集停止新增记录，清除只删除当前RPC实例的诊断数据，不删除设置或下载。

普通日志适用于启动、登录、请求失败和存储故障。导出JSON后可自行检查，再人工附到问题反馈；同时提供发生了什么、预期结果及大致时间。视觉问题可另附截图。日志不会自动发送给作者。

需要重现具体操作时，在已连接且没有批量操作/目录匹配运行时，点击“开始增强录制”。应用先通过已有刷新链建立全量检查点；等待当前操作结束后，执行一次问题操作，再“停止并保存录制”，导出录制包。范围为列表全量/增量刷新、概览选择/读取、批量开始/暂停、重连及状态协调。其余操作可能令该段不可重放。

增强录制需要HTTPS或localhost提供的WebCrypto；普通HTTP局域网站点仍可导出默认诊断。录制最多5分钟、10000事件、10MiB，单事件512KiB。大型列表响应可能达到单事件上限；此时仍可作为诊断包导出，但不会标为可重放。停止时仍有请求或操作进行，也会标为不完整。请等界面操作结束再停止。

`replayable`表示记录具备进入重放验证的条件，最终是否复现仍以开发工具报告为准；`ineligible`表示缺少必要条件；`diagnostic-only`表示普通摘要。不能仅根据文件名判断资格。

## 保存在哪里
- 当前浏览器、当前站点origin下的IndexedDB：`transmission-web-ui-diagnostics`，版本1。
- `instances`：本机RPC地址到随机实例ID的映射、采集偏好及容量/期限元数据；这些映射不导出。
- `sessions`：按sessionId保存普通诊断包；事件位置为`package.events`，按seq寻址。
- `captures`：按captureId保存故障片段和增强录制包。录制期间异步保存的包保持不完整，不能用于冒充已完成录制。
- 开发者工具：Application/Storage → IndexedDB → 上述数据库。浏览器管理物理文件位置，应用不指定系统磁盘路径，不在NAS下载目录创建日志。
- 手动导出文件由浏览器下载，保存位置由浏览器设置或用户选择；文件名包含版本、diagnostic和UTC时间。

普通记录最多1000条/2MiB、保留30分钟窗口，持久普通包24小时过期；固定故障片段取前100条、后20条或5秒，最多256KiB，实例保留3片；故障片段和增强包7天过期。实例总量20MiB、站点日志总量40MiB。每5分钟及写入后清理，最旧记录先删除。存储失败时退回内存；清除网站数据、浏览器回收或隐私模式可能令日志消失，需及时导出。

密码、Authorization、Cookie、原会话凭证、种子文件内容不进入日志。增强包将任务ID/hash/名称/路径/Tracker地址换成稳定合成值；保留字段类型、0/null/缺失、数组顺序和任务关联。自由错误文字用固定类别代替，堆栈仅保留assets脚本相对路径和行列，不能据此恢复任意字符串相关缺陷。

## 开发者重放
正常生产包不含replay.html及开发控制入口。保留发生故障版本的源码、锁文件及diagnostics-manifest.json，并使用对应源码生成独立开发重放构建：

```sh
npx vite build --mode replay --outDir artifacts/replay-build
node scripts/replay-diagnostics.mjs \
  --input /absolute/path/report.json \
  --build artifacts/replay-build \
  --output artifacts/diagnostics-replay/run-001 \
  --browser chromium
```

开发机器需要项目依赖及对应Playwright浏览器；可使用仓库浏览器容器。重放工具只启动回环地址静态服务，只放行该服务的replay.html和assets；RPC由内存transport消费录制数据。所有其他网络均阻断，未匹配请求立即失败，无真实网络回退。不要把重放入口部署到用户实例。

工具检查schema、容量、深度、摘要、构建标识、事件顺序和引用；恢复检查点后运行真实store/RpcClient动作。逻辑时钟在每个录制因果边界等待原生响应解析任务完成，再推进到下一输入，避免浏览器任务调度差异制造虚假并发。请求按方法、规范参数、操作上下文和同组顺序匹配；操作间依赖来自录制的开始/结束顺序，保留真正重叠的操作。

结果目录包含report.json、events.jsonl和截图。matched要求关键RPC事件全消费、操作结果一致、状态断言通过、无阻断请求及未匹配请求；diverged报告首个差异；ineligible拒绝不完整、损坏或不支持的包。退出码0仅表示验证通过。

验证修复构建必须显式给出独立的正确性期望JSON（顶层为待断言的状态字段，不执行其中任何代码）：

```sh
node scripts/replay-diagnostics.mjs --input report.json \
  --build artifacts/replay-build --output artifacts/diagnostics-replay/fix \
  --candidate --assert expected-state.json
```

默认要求源/目标buildId相同；candidate模式保留两个buildId并使用正确性断言，不能仅要求原故障继续出现。受控故障构建脚本仅用于测试：`node scripts/build-replay-fault-fixture.mjs`，不会修改生产源文件。

## 验证和证据
单元测试为`npm test`；诊断浏览器用例为`tests/e2e/diagnostics*.spec.ts`。真实daemon测试需显式`TWUI_DIAGNOSTICS_LIVE=1`，只连接独立19191/19192/19193/19195实验端口，使用本次合成任务并在finally中清理；禁止指向用户实例。最终矩阵和实际限制见OpenSpec实施记录及证据目录。日志自身不证明服务端发生了什么：超时的写操作必须以后续录制的查询结果协调。


## 构建保留
构建后运行`node scripts/archive-diagnostics-build.mjs`，将生产资源、开发重放资源、source map和明确白名单内的源码归档到`artifacts/diagnostic-builds/<buildId>/`。archive.json保存每个文件的SHA-256，已存在归档不覆盖。使用归档的replay目录作为CLI的--build，可以避免后续源码变化导致构建不匹配。源码归档没有.git；如需重建，将source/SOURCE_COMMIT通过TWUI_SOURCE_COMMIT环境变量传入，并使用锁文件安装依赖。


四版本隔离实验可以用以下命令复现；这些容器不挂载用户配置和下载数据：

```sh
docker compose -p twui-diagnostics -f lab/diagnostics.compose.yaml up -d --build
TWUI_DIAGNOSTICS_LIVE=1 npm run test:diagnostics:replay -- --repeat-each=3
# 性能单独运行，避免并发浏览器测试干扰基线
npm run test:diagnostics:performance
docker compose -p twui-diagnostics -f lab/diagnostics.compose.yaml down
```


性能验收使用5轮交替开关采集、每轮每种模式40次操作（各200个样本），阈值仍为刷新/交互p95回退不超过5%。在本次20核实验主机上使用`TWUI_TEST_CPUSET=16-19`固定测试容器CPU；其他机器应选择自身可用核心。未固定CPU及早期100样本的成功/失败记录均保留，不用单次最好结果替代最终数据。CPU采样按source map归属诊断代码，仅作为该环境的执行时间观测。

## 登录刷新恢复（2.1.1）

登录成功后，当前标签页使用按完整 RPC 地址隔离的 `sessionStorage` 临时保存账号和密码，刷新后重新认证。记录不加密，同源脚本可读；不写入 IndexedDB 设置或诊断日志，不随诊断包导出。关闭标签页通常结束该会话，浏览器恢复会话或复制标签页可能恢复或复制记录。存储不可用时仍可手动登录，但刷新需要重新输入。服务端返回401/403时清除对应记录。此方案用于当前静态站点，不提供服务端会话令牌。
