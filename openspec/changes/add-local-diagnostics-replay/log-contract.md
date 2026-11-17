# 2.1.0 日志数据契约

## 1. 本地位置与生命周期
浏览器按origin隔离的IndexedDB数据库`transmission-web-ui-diagnostics`，数据库版本1；对象仓库`instances`、`sessions`、`captures`。`instances`保存RPC origin+pathname到随机instanceId的本机映射、`preference:{instanceId}`采集偏好，以及`@log:{store}:{id}`容量/期限元数据。映射不导出。`sessions`以sessionId为主键保存普通包，逻辑事件位置为`sessions/{sessionId}/package/events/{seq}`；`captures`以captureId保存增强包与固定故障片段。每行含instanceId用于隔离。多标签各有独立sessionId，不把多标签事件拼成同一可重放流；其他标签改变业务设置时增强段标记external-change。

实施决策：事件以有界包聚合存储，元数据与包原子写入，清理只扫描元数据而不反复反序列化历史大包。原设计的逐事件`events`仓库取消；旧开发构建如遗留该空仓库不读取。此调整解决5,000任务性能实测回退，外部JSON协议、容量、期限和实例隔离不变。

这里不是NAS或下载目录上的日志文件，浏览器管理实际磁盘位置，产品不承诺操作系统物理路径。DevTools的Application/Storage→IndexedDB可查看上述库。导出使用浏览器下载机制，保存路径由浏览器/用户决定，建议文件名`transmission-web-ui-2.1.0-diagnostic-20261117T080000Z-<captureId>.json`；时间使用UTC。禁止自动写入服务器目录。

默认每会话最多1000条/2MiB，时间窗口30分钟，先达上限先淘汰最旧普通事件。固定故障片段取前100条、后20条或5秒（先到为准），单片最多256KiB，实例保留最近3片。普通持久记录24小时过期；用户停止的增强包及固定片段7天过期。启动及每5分钟清理，实例最多20MiB，全库最多40MiB，先删过期和最旧已结束记录。活动增强段无法容纳时停止并标记quota，不删当前检查点后继续声称完整。

增强最多5分钟、10000事件、10MiB序列化UTF-8数据（含检查点）；单事件最多512KiB，超过则不保存残缺响应，记录oversize元数据并将段判为不可重放。单字段诊断消息最多2KiB，栈最多16KiB。导入上限12MiB，嵌套深度32；拒绝重复序号、原型污染键、非法引用及未知schema主版本。对象键顺序不具有业务含义；数组顺序必须保留。

## 2. 收集字段白名单
|事件/数据|默认|增强增量|不得收集|
|---|---|---|---|
|environment|buildId、版本、UA、locale/timezone、视口/DPR、online/visibility、能力布尔值、daemon/RPC版本|检查点配置的已批准UI字段|完整页面URL、查询字符串、IP、凭据|
|operation|固定动作枚举、operationId、目标数量、结果类别|start/stop/select/refresh的合成目标引用与参数|输入框内容、密码、文件字节|
|rpc.start/attempt/end|requestId、method、字段名集合、计数、attempt、状态码、耗时、errorId|支持方法的脱敏参数与响应、返回顺序|Authorization、Cookie、原session-id、完整HTTP头|
|state|generation、刷新类型、丢弃原因、任务数量、stale|检查点与断言投影|整个Pinia对象、完整设置备份|
|error/resource|固定错误类别、脱敏消息/栈、脚本相对路径|结构化故障注入描述|HTML响应原文、外站URL参数|
|storage/lifecycle|降级原因类别、隐藏/恢复、丢失计数|可重放的调度事件|浏览器其他存储内容|

支持方法限定session-get、session-stats、torrent-get（列表/概览所需字段）、torrent-start、torrent-stop、free-space。每个方法实施时必须有静态请求/响应字段注册表和测试；新字段默认不采集。未知字段仅保留字段名/类型摘要且标记coverage-gap，不能作为重放输入。session-get只保留业务实际读取且非凭据的白名单；会话身份变化转换成合成epoch。默认不记录参数值。

hash映射为包内稳定的40位合成十六进制串，数字id映射为稳定正整数；不使用可逆编码或无盐原值hash。名称映射`task-001`，路径映射`/redacted/path-001`，Tracker保留白名单数值/布尔状态及数组结构，announce/host/scrape换为包内一致的`.invalid`合成地址，原地址/passkey不保存；Peer不在自动重放范围，仅保留数量摘要。映射只在内存，不持久化原值、不导出映射表；页面刷新结束增强段，不能接续缺失映射的录制。嵌套自由文本不透传，采用模板化错误类别；用户主动填写的描述独立存放并提示自查。合法响应保留白名单内字段的类型、缺失/null/0、数组位置和数值。必要字段因隐私被替换且影响本次业务分支时记录losses并拒绝可重放资格。

## 3. 导出封装
单文件UTF-8 JSON，无BOM；schemaVersion=1，与产品版本分开。顶层固定字段：schemaVersion、app、capture、environment、checkpoint、events、observed、privacy、integrity。capture含mode、id、sessionId、start/end UTC、complete、eligibility、reasons、droppedEvents、limits。eligibility为diagnostic-only/replayable/ineligible；由规则计算，不允许用户手动勾选伪装。

事件通用字段seq（当前段严格递增整数）、at（UTC ISO）、monoMs（当前段单调相对时间）、type、level、data；operationId/requestId/errorId位于data中（适用时）。普通包seq以页面会话递增，增强包从1开始，capture.sessionId关联页面会话。顺序以seq和显式因果关系为准，不依赖墙上时钟；2.1.0不进行时间旅行重放；墙上时钟异常变化导致请求时序或分支不同，重放必须返回diverged，不能伪造成功。

checkpoint包含capture起点对应的安全session投影、完整支持字段的任务集合、UI白名单、同步代次/身份索引、定时器相对截止时间；恢复适配器负责重建Map等运行态，不恢复凭据、Promise或AbortController。检查点补充operationCounter和refreshDueMs：前者恢复操作关联编号，后者恢复下一次自动轮询截止时间；wallTime在同步脱敏完成后重新取值，同时调整会话/快照年龄及计时器余量。检查点有缺字段或超限时不可重放。observed包含事件边界与预期状态投影，不能拿它替代输入数据。

integrity为去除integrity字段后按键排序规范JSON的SHA-256；用于发现损坏，不作来源真实性认证。privacy记录规则版本、替换计数和信息损失。没有WebCrypto时允许导出无摘要普通诊断，注明原因，不判为replayable。

## 4. 事件明细样例
以下是由真实记录器生成的“暂停→超时→重新查询确认暂停”录制包中抽取的事件片段，省略了attempt/response/end等中间事件，不是可直接导入的完整fixture；完整fixture必须由真实记录器在验证中产出，包含以上所有封装和检查点。

```json
[
  {
    "seq": 1,
    "at": "2026-11-16T17:43:36.499Z",
    "monoMs": 1.0999999940395355,
    "type": "operation.start",
    "level": "info",
    "data": {
      "action": "execute",
      "operationId": 3,
      "method": "torrent-stop",
      "ids": [
        1
      ]
    }
  },
  {
    "seq": 2,
    "at": "2026-11-16T17:43:36.500Z",
    "monoMs": 1.3999999910593033,
    "type": "rpc.start",
    "level": "info",
    "data": {
      "requestId": "req-6",
      "method": "torrent-stop",
      "arguments": {
        "ids": [
          "0000000000000000000000000000000000000001"
        ]
      },
      "context": "command",
      "operationId": 3,
      "timeoutMs": 20000
    }
  },
  {
    "seq": 3,
    "at": "2026-11-16T17:43:56.500Z",
    "monoMs": 20001.5,
    "type": "rpc.error",
    "level": "warn",
    "data": {
      "requestId": "req-6",
      "kind": "timeout"
    }
  },
  {
    "seq": 5,
    "at": "2026-11-16T17:43:56.500Z",
    "monoMs": 20001.69999998808,
    "type": "rpc.start",
    "level": "info",
    "data": {
      "requestId": "req-7",
      "method": "torrent-get",
      "arguments": {
        "fields": [
          "id",
          "hashString",
          "name",
          "downloadDir",
          "totalSize",
          "isPrivate",
          "trackers",
          "addedDate",
          "metadataPercentComplete",
          "haveValid",
          "haveUnchecked",
          "status",
          "percentDone",
          "sizeWhenDone",
          "rateDownload",
          "rateUpload",
          "uploadRatio",
          "uploadedEver",
          "downloadedEver",
          "error",
          "errorString",
          "queuePosition",
          "eta",
          "activityDate",
          "doneDate",
          "recheckProgress",
          "leftUntilDone",
          "trackerStats",
          "peersSendingToUs",
          "peersGettingFromUs"
        ]
      },
      "context": "refresh",
      "operationId": 3,
      "timeoutMs": 20000
    }
  },
  {
    "seq": 9,
    "at": "2026-11-16T17:43:56.503Z",
    "monoMs": 20004.29999999702,
    "type": "rpc.start",
    "level": "info",
    "data": {
      "requestId": "req-8",
      "method": "session-stats",
      "arguments": {},
      "context": "refresh",
      "operationId": 3,
      "timeoutMs": 20000
    }
  },
  {
    "seq": 13,
    "at": "2026-11-16T17:43:56.505Z",
    "monoMs": 20006.5,
    "type": "operation.end",
    "level": "info",
    "data": {
      "operationId": 3,
      "outcome": "resolved"
    }
  },
  {
    "seq": 14,
    "at": "2026-11-16T17:43:56.506Z",
    "monoMs": 20007.69999998808,
    "type": "capture.stop",
    "level": "info",
    "data": {}
  }
]
```
实际刷新还会产生session-stats等请求，完整包必须逐一包含，不能从此片段推断缺省响应。unknownWriteOutcome只表示客户端不知道写入结果，之后的status=0来自真实录制的查询，不能由重放器自行假定。

## 5. 开发侧文件路径与结果
实际命令：`node scripts/replay-diagnostics.mjs --input <包路径> --build <本地构建目录> --output artifacts/diagnostics-replay/<runId>`。只接受本地路径，禁止从包提供的URL加载脚本。输出report.json（资格、两个buildId、消费事件数、未匹配请求、首个状态差异、网络拦截统计）、events.jsonl（重放执行轨迹）、必要截图。candidate修复验证增加`--candidate`，必须指明验证用例的修复断言。正式证据索引位于docs/validation-evidence/diagnostics-2.1.0/；原始用户包不自动加入Git，测试只提交合成数据生成的脱敏fixture。


## 6. 实际事件与重放结果补充
`rpc.start.data`包含requestId、method、arguments、context、operationId（业务动作存在时）、timeoutMs；`rpc.attempt`包含attempt/status/challenge，不包含真实协商头；`rpc.response`包含脱敏envelope或invalidJson；`rpc.end`与`rpc.error`引用requestId。合法tag转成`$request`，错误tag转成`$wrong`，重放时映射到当前请求编号，不把合法tag误当旧请求。`operation.end`含outcome=resolved/rejected及拒绝kind。`state.discard`记录generation/reason，重放必须再次触发并消费。`capture.stop`为完整增强包的最后事件。

默认包mode=diagnostic、checkpoint/observed=null，固定片段mode=fault；模块无法启动时由独立脚本导出mode=startup，app.version=startup且buildId来自构建注入。它们统一为diagnostic-only，不具备增强包的导入资格。增强包只在停止时无未完成请求/操作、无信息缺口且SHA-256可生成时成为replayable；这是重放入场条件，最终成功以matched报告为准。HTTP普通局域网地址可能不提供WebCrypto，增强录制要求HTTPS或localhost，普通日志仍可导出。

离线工具对每个rpc.end/operation.end因果边界先推进逻辑时间，再等待浏览器原生任务完成，之后推进到下一边界；避免Firefox的Response.json任务与假时钟脱节。录制中已结束的操作构成后续操作依赖，真正重叠的取消/重连不被串行化。重放在capture.stop之后不再安排轮询。修复对照保留sourceObserved，同时使用显式正确性期望作为candidate断言。
