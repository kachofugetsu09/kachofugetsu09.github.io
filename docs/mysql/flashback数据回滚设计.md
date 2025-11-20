---
outline: [2, 3]
---

# flashback数据回滚设计

## 平台侧提单
- 发起请求，至少包含 目标database backward/forward 起始时间-> 结束时间

## 后端处理
- 把当前请求存到一张表做留存，我们命名为flash_request_tab
- 处理请求，通过元数据库查询到database对应的host和port，至少将 以下信息存到flash_record_tab中：
  - uuid(使用requesthash生成唯一id),对应的最后sql上传到的s3的路径表,目标db集群的master的host和port，目标db名称，目标表名称，backward/forward，起始时间，结束时间，执行状态。
  - 至此，落库。

## 任务调度与执行器
- 通过一个manager,扫描表flash_record_tab中状态不是success和fail的记录，拿到多个对应任务的uuid。
- 起多个flashback执行器pod，通过configmap挂载上去要执行的目标uuid以及元数据库。
- 执行器启动，读取配置文件，拿到uuid，连接元数据库通过元数据库查询到flash_record_tab中的对应记录，至此执行器拿到所有需要的信息，可以执行flashback操作。

## 以时间戳flashback路径为例

### 初始化与连接
1. 连接元数据库，拿到flash_record_tab中对应uuid的记录，存到内存当中。至此，初始化流程结束。
2. 执行process流程，解析起始时间，终止时间。
3. 连接目标db，通过从record表中拿到的host port以及从元数据库中查询到的用户名密码。
4. 使用LocateUsingTimestamp方法根据起始时间获取binlog起始位点。返回结构为：

```go
offset := &MasterStatus{
	BinFile: pos.Name,
	Pos:     int64(pos.Pos),
}
```

拿到一个对应的from offset，同时将end时间封装为until offset。

### 数据处理流程
5. 开始dumpData，处理数据，传入初始offset、结束时间、是否是gtid路径。
6. 新建一个binlogsyncer，传入ServerID(随机生成)、flavor为mysql、host port user password、心跳间隔(1分钟)、recv缓冲区大小(128MB)、最大重试次数(16次)。同时新建一个SqlWriter。
7. SqlWriter内部根据order(backward/forward)创建对应的Executor：
   - backward模式：创建Recorder，使用本地leveldb存储，key为事务id+事件索引的json结构(TrxKey)，value为对应的sql语句。
   - forward模式：创建Forward，直接写入文件不做逆序。
8. 根据是否gtid路径选择不同的同步方式：
   - 非gtid：使用StartSync从指定的binlog文件名和位点开始同步
   - gtid：使用StartSyncGTID从指定的gtid开始同步

### 事件处理与终止
9. 从初始offset位置开始循环读取binlog事件(GetEvent)，超时时间30秒。事件处理逻辑：
   - ROTATE_EVENT：更新位点的文件名和位置
   - GTID_EVENT：检查gtid是否超出until范围，未超出则写入GTID_NEXT注释，并初始化统计行
   - ANONYMOUS_GTID_EVENT：写入GTID_NEXT='ANONYMOUS'注释
   - QUERY_EVENT：处理BEGIN/COMMIT/DDL/SAVEPOINT等，SAVEPOINT不切事务，其他DDL语句会提交当前事务
   - TABLE_MAP_EVENT：通过查询information_schema.columns和show index获取表结构和索引信息，存到内存tdc map中
   - WRITE/UPDATE/DELETE_ROWS_EVENT：
     - 先判断是否需要过滤(检查database、table、sql_type、label等)
     - 根据backward/forward模式生成对应sql(insert<->delete互转，update保持)
     - where条件优先使用主键，其次唯一索引，最后全列(根据where_pk_col配置)
     - 通过Executor.Write写入，isCommit=false
   - XID_EVENT：写入COMMIT，isCommit=true，表示事务结束
   - HEARTBEAT_EVENT：非gtid模式下表示dump结束
10. 终止条件：
    - 非gtid模式：当前事件时间戳 > until时间戳
    - gtid模式：当前gtid不包含在until gtid set中
    - 接收到HEARTBEAT_EVENT(非gtid模式)

### 输出与收尾
11. dump结束后，调用SqlWriter.Flush()：
    - backward模式：Recorder将leveldb中的事务按trxID从大到小逆序读取，每个事务内部的sql语句也逆序输出，最终写入sql文件
    - forward模式：Forward直接sync文件即可
12. 最后，将生成的sql文件和stats统计文件上传到S3，并更新元数据库中的状态和url链接。

### 其他说明
- 注：发生ddl表结构变更时，如果表列数和内存中存的schema结构不一致，报错。
- 使用manager模式调度器的优势：
  1. 故障是隔离的,如果遇到某个task oom，不会影响到manager本身。
  2. 易于扩展，可以根据任务数量动态调整执行器pod的数量。
  3. 执行器本身是无状态的。
