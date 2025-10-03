## binlog 概览

在mysql当中，binlog通常是被设计用来作为主从同步的日志。
在一个事务提交的时候，InnoDB 会执行两阶段提交（2PC）：先写入 **redo log**，将状态标记为 *prepare* 并刷盘；再写入 **binlog** 并刷盘；最后把 redo log 状态改为 *commit*。只有 redo prepare 和 binlog 都持久化之后，事务才算真正安全。
也就是说，binlog 是主从复制与按时间点恢复的可靠凭据，而事务的持久性更多依赖 redo log 与 binlog 的协同，两者缺一不可。
binlog 的用途有很多，在做 flashback 的时候，形如美团的开源项目 MyFlash，会解析一段时间内的 binlog：对于 UPDATE，读取事件里的 before image 并把它作为新的值覆盖 after image；对于 DELETE，构造 INSERT 把被删行补回来；对于 INSERT，再生成 DELETE 将新插入的行移除，从而实现回档。
不仅如此，在我之前介绍的gh-ost这个在线表结构变更工具当中也使用了这个技术。

由此可见，binlog在mysql当中占有着至关重要的地位，所以了解他对于我们深入理解mysql有非常大的帮助。

## 示例准备

顺应笔者的一贯风格，我还是从例子开始来了解binlog是如何做的。
我们准备的sql是这样的

```sql
USE app_db;

CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO orders (customer, amount, status) VALUES
('Alice', 120.50, 'PENDING'),
('Bob', 87.30, 'PAID'),
('Charlie', 42.00, 'CANCELLED');

UPDATE orders SET status = 'SHIPPED' WHERE customer = 'Alice';
DELETE FROM orders WHERE customer = 'Charlie';

SELECT * FROM orders;
```

我们准备了一个DDL 和一些DML语句来了解binlog的构成。

通过mysqlbinlog 我们来窥见整个binlog的全貌。

## Start 事件与基础信息

首先从USE 和CREATE TABLE两处来看
```
# The proper term is pseudo_replica_mode, but we use this compatibility alias
# to make the statement usable on server versions 8.0.24 and older.
/*!50530 SET @@SESSION.PSEUDO_SLAVE_MODE=1*/;
/*!50003 SET @OLD_COMPLETION_TYPE=@@COMPLETION_TYPE,COMPLETION_TYPE=0*/;
DELIMITER /*!*/;
# at 4
#251002 16:09:47 server id 1  end_log_pos 127 CRC32 0x69b9b695 	Start: binlog v 4, server v 8.4.3 created 251002 16:09:47 at startup
# Warning: this binlog is either in use or was not closed properly.
ROLLBACK/*!*/;
```
首先在这一段 我们可以看到mysql的
serverid，endlogpos，CRC32校验和，binlog的版本 ，server的版本 。

其中 **end_log_pos** 表示“当前事件结束后下一个事件的起始位置”，它是一个绝对偏移量。复制或恢复工具可以直接跳转到该位置，继续从下一个事件读取增量。
而 server_id 是在 my.cnf 这个配置文件当中自定义的，一般是 DBA 自己定的。

## GTID 与事务时间戳
```
# at 127
#251002 16:09:47 server id 1  end_log_pos 158 CRC32 0x6e736880 	Previous-GTIDs
# [empty]
# at 158
#251002 16:12:25 server id 1  end_log_pos 237 CRC32 0x3b37dadc 	Anonymous_GTID	last_committed=0	sequence_number=1	rbr_only=no	original_committed_timestamp=1759392745488705	immediate_commit_timestamp=1759392745488705	transaction_length=404
# original_commit_timestamp=1759392745488705 (2025-10-02 16:12:25.488705 CST)
# immediate_commit_timestamp=1759392745488705 (2025-10-02 16:12:25.488705 CST)
/*!80001 SET @@session.original_commit_timestamp=1759392745488705*//*!*/;
/*!80014 SET @@session.original_server_version=80403*//*!*/;
/*!80014 SET @@session.immediate_server_version=80403*//*!*/;
SET @@SESSION.GTID_NEXT= 'ANONYMOUS'/*!*/;
# at 237
#251002 16:12:25 server id 1  end_log_pos 562 CRC32 0x25278342 	Query	thread_id=8	exec_time=0	error_code=0	Xid = 6
use `app_db`/*!*/;
SET TIMESTAMP=1759392745/*!*/;
SET @@session.pseudo_thread_id=8/*!*/;
SET @@session.foreign_key_checks=1, @@session.sql_auto_is_null=0, @@session.unique_checks=1, @@session.autocommit=1/*!*/;
SET @@session.sql_mode=1168113696/*!*/;
SET @@session.auto_increment_increment=1, @@session.auto_increment_offset=1/*!*/;
/*!\C latin1 *//*!*/;
SET @@session.character_set_client=8,@@session.collation_connection=8,@@session.collation_server=255/*!*/;
SET @@session.lc_time_names=0/*!*/;
SET @@session.collation_database=DEFAULT/*!*/;
SET @@session.explicit_defaults_for_timestamp=1/*!*/;
/*!80011 SET @@session.default_collation_for_utf8mb4=255*//*!*/;
/*!80013 SET @@session.sql_require_primary_key=0*//*!*/;
CREATE TABLE IF NOT EXISTS orders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    customer VARCHAR(100) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

在这里我们可以看到 Previous-GTIDs，这里是在说明在这个文件前，源数据库执行过哪些 GTID，这里显示 empty 说明之前没有执行过。GTID（Global Transaction Identifier）是全局事务标识符。它的格式是 **source_id:transaction_id**，其中 source_id 为生成该事务的 MySQL 实例 UUID，冒号后的 transaction_id 为该实例上递增的事务序号。之所以称为“全局”，是因为在整个复制集群里这个 ID 只能出现一次，任何节点看到同样的 GTID 都能判断该事务是否已经执行。借助 GTID，从库只要告知主库自己执行到哪个 GTID，主库就会自动补齐缺失的事务，切换主从或故障恢复时也不再需要 file + position 这种坐标；而 **last_committed/sequence_number** 的组合则记录了事务之间的依赖关系，是并行复制调度的依据。

Anonymous_GTID 事件标记接下来这一组事件属于同一个事务/语句，这个为零的 last_committed 代表它没有依赖前序事务，而 sequence_number=1 表示当前事务的全局事务编号为 1。last_committed 指向它依赖的最近一次提交，当多个事务的 last_committed 值相同且都已提交时，从库的 worker 线程便可并发重放它们。rbr_only=no 说明事务里包含了 Query Event 等非纯行格式的事件（例如后面的 DDL），DDL 在 RBR 模式下依然以 Query Event 写入。transaction_length=404 给出整个事务事件组的字节大小，用于复制进度和截取。
紧接着设置了 original_commit_timestamp=1759392745488705 的时间戳，同时还有 **SET TIMESTAMP=1759392745**，它会把当前 Session 的逻辑时间固定在主库执行该语句时的值，确保从库执行包含时间函数的语句时能得到一致的结果。对基于语句的复制（SBR）来说，这一步尤为关键，UPDATE/INSERT 里若包含 NOW()、CURRENT_TIMESTAMP 等非确定性时间函数，正是依赖 SET TIMESTAMP 才能在主从节点写出完全一致的时间字段。
最后 SET @@SESSION.GTID_NEXT= 'ANONYMOUS'
告诉我们下一个事务是一个匿名事务。

## DDL 事务解析

接下来我们可以看到 USE app_db 这个操作被视为一个 Query 操作，它的执行线程是 thread_id，在 MySQL 当中我们可以通过这个 thread_id 查询具体是哪个连接发出的语句。Query Event 行尾的 **Xid=6** 表明这条 DDL 也运行在一个 Server 层事务里，Server 在提交时会把 Xid 写入 binlog 作为该事务的标识。Xid Event 是 MySQL Server 层在事务提交时写入 binlog 的事件，表示一个事务的结束；InnoDB 层维护的是内部的 Transaction ID，两者不要混淆。
在 MySQL 当中，DDL 语句之所以必须隐式提交，是因为大多数 DDL 在 Server 层无法回滚，会修改数据字典并触发存储引擎的物理结构变化。为保证元数据一致性，Server 在执行 DDL 之前会强制提交当前事务、释放持有的元数据锁，并获取 **LOCK_open/MDL EXCLUSIVE** 等全局元数据锁，期间其它会话对该对象的 DML 会被阻塞。正因为 DDL 被视作一个单独的事务，它才以 Query Event + Xid 的组合出现在 binlog 里，即便我们看不到 BEGIN/COMMIT，也完成了一次原子提交。

紧接着的这些 SET 语句是在为 CREATE TABLE 做执行前的铺垫：先固定当前 session 的逻辑时间、sql_mode、自增步长等语句环境。
`SET @@session.character_set_client=8, ...; /*!\C latin1 */` 用来指定客户端字符集为 latin1。
随后 `SET @@session.lc_time_names=0`、`SET @@session.explicit_defaults_for_timestamp=1` 以及 /*!80011 ...*/, /*!80013 ...*/ 这类带版本号的注释语句，会同步区域化时间名称、时间戳默认值策略和 utf8mb4 默认排序等更细粒度的 session 选项；只有在目标版本支持时它们才会实际生效。


## INSERT 事务

紧接着我们执行了
```sql
INSERT INTO orders (customer, amount, status) VALUES
('Alice', 120.50, 'PENDING'),
('Bob', 87.30, 'PAID'),
('Charlie', 42.00, 'CANCELLED');
```

他对应的binlog是这一段
```
/*!*/;
# at 562
#251002 16:12:25 server id 1  end_log_pos 641 CRC32 0x6a19f487 	Anonymous_GTID	last_committed=1	sequence_number=2	rbr_only=yes	original_committed_timestamp=1759392745492537	immediate_commit_timestamp=1759392745492537	transaction_length=378
/*!50718 SET TRANSACTION ISOLATION LEVEL READ COMMITTED*//*!*/;
# original_commit_timestamp=1759392745492537 (2025-10-02 16:12:25.492537 CST)
# immediate_commit_timestamp=1759392745492537 (2025-10-02 16:12:25.492537 CST)
/*!80001 SET @@session.original_commit_timestamp=1759392745492537*//*!*/;
/*!80014 SET @@session.original_server_version=80403*//*!*/;
/*!80014 SET @@session.immediate_server_version=80403*//*!*/;
SET @@SESSION.GTID_NEXT= 'ANONYMOUS'/*!*/;
# at 641
#251002 16:12:25 server id 1  end_log_pos 718 CRC32 0xd84eddb7 	Query	thread_id=8	exec_time=0	error_code=0
SET TIMESTAMP=1759392745/*!*/;
BEGIN
/*!*/;
# at 718
#251002 16:12:25 server id 1  end_log_pos 788 CRC32 0xb01e7061 	Table_map: `app_db`.`orders` mapped to number 85
# has_generated_invisible_primary_key=0
# at 788
#251002 16:12:25 server id 1  end_log_pos 909 CRC32 0x25e464b1 	Write_rows: table id 85 flags: STMT_END_F
### INSERT INTO `app_db`.`orders`
### SET
###   @1=1 /* INT meta=0 nullable=0 is_null=0 */
###   @2='Alice' /* VARSTRING(400) meta=400 nullable=0 is_null=0 */
###   @3=120.50 /* DECIMAL(10,2) meta=2562 nullable=0 is_null=0 */
###   @4='PENDING' /* VARSTRING(80) meta=80 nullable=0 is_null=0 */
###   @5=1759392745 /* TIMESTAMP(0) meta=0 nullable=1 is_null=0 */
### INSERT INTO `app_db`.`orders`
### SET
###   @1=2 /* INT meta=0 nullable=0 is_null=0 */
###   @2='Bob' /* VARSTRING(400) meta=400 nullable=0 is_null=0 */
###   @3=87.30 /* DECIMAL(10,2) meta=2562 nullable=0 is_null=0 */
###   @4='PAID' /* VARSTRING(80) meta=80 nullable=0 is_null=0 */
###   @5=1759392745 /* TIMESTAMP(0) meta=0 nullable=1 is_null=0 */
### INSERT INTO `app_db`.`orders`
### SET
###   @1=3 /* INT meta=0 nullable=0 is_null=0 */
###   @2='Charlie' /* VARSTRING(400) meta=400 nullable=0 is_null=0 */
###   @3=42.00 /* DECIMAL(10,2) meta=2562 nullable=0 is_null=0 */
###   @4='CANCELLED' /* VARSTRING(80) meta=80 nullable=0 is_null=0 */
###   @5=1759392745 /* TIMESTAMP(0) meta=0 nullable=1 is_null=0 */
# at 909
#251002 16:12:25 server id 1  end_log_pos 940 CRC32 0xff7407e5 	Xid = 7
COMMIT/*!*/;
```


last_committed 表明了他上一个事务是 1 也就是我们的 use 和 create table 这一个事务。然后他自己的 sequence_number 也就是他自己的全局事务编号是 2。
接下来我们看到了一个 Query 类别的操作，操作的具体内容是 BEGIN，由于默认是 RC，所以这里自动创建了一个事务。随后出现的 **Table_map** 事件会为本次事务中的行事件提供表的元数据（库名、表名、列定义等），同时分配一个临时的 table id，后续 Row Event 通过这个 id 才能正确解析数据，因此通常在每个 DML 事务的开头先出现一次。
紧接着是我们的 Write_rows 操作，insert 进入了表，然后就是设置了 5 列数据，再重复两次这个步骤，最后给出这次操作一个事务的 Xid，最后做提交。Write_rows 事件上的 **STMT_END_F** 标志位表示这是该语句的最后一个 Row Event，有助于复制在语句模式与行模式之间正确划定语句边界。行事件里具体记录哪些列由系统变量 **binlog_row_image** 控制：默认 FULL 会把所有列都写入；选择 MINIMAL 时只会写出主键/唯一键以及真正发生变化的列，可以显著降低 binlog 体积，但也对恢复工具提出了更高要求。

## UPDATE 事务

然后是
```sql
UPDATE orders SET status = 'SHIPPED' WHERE customer = 'Alice';
```

```
# at 940
#251002 16:12:25 server id 1  end_log_pos 1019 CRC32 0xdb2de3ae 	Anonymous_GTID	last_committed=2	sequence_number=3	rbr_only=yes	original_committed_timestamp=1759392745493547	immediate_commit_timestamp=1759392745493547	transaction_length=360
/*!50718 SET TRANSACTION ISOLATION LEVEL READ COMMITTED*//*!*/;
# original_commit_timestamp=1759392745493547 (2025-10-02 16:12:25.493547 CST)
# immediate_commit_timestamp=1759392745493547 (2025-10-02 16:12:25.493547 CST)
/*!80001 SET @@session.original_commit_timestamp=1759392745493547*//*!*/;
/*!80014 SET @@session.original_server_version=80403*//*!*/;
/*!80014 SET @@session.immediate_server_version=80403*//*!*/;
SET @@SESSION.GTID_NEXT= 'ANONYMOUS'/*!*/;
# at 1019
#251002 16:12:25 server id 1  end_log_pos 1105 CRC32 0x121d4555 	Query	thread_id=8	exec_time=0	error_code=0
SET TIMESTAMP=1759392745/*!*/;
BEGIN
/*!*/;
# at 1105
#251002 16:12:25 server id 1  end_log_pos 1175 CRC32 0x2c3eafe6 	Table_map: `app_db`.`orders` mapped to number 85
# has_generated_invisible_primary_key=0
# at 1175
#251002 16:12:25 server id 1  end_log_pos 1269 CRC32 0xb82b6046 	Update_rows: table id 85 flags: STMT_END_F
### UPDATE `app_db`.`orders`
### WHERE
###   @1=1 /* INT meta=0 nullable=0 is_null=0 */
###   @2='Alice' /* VARSTRING(400) meta=400 nullable=0 is_null=0 */
###   @3=120.50 /* DECIMAL(10,2) meta=2562 nullable=0 is_null=0 */
###   @4='PENDING' /* VARSTRING(80) meta=80 nullable=0 is_null=0 */
###   @5=1759392745 /* TIMESTAMP(0) meta=0 nullable=1 is_null=0 */
### SET
###   @1=1 /* INT meta=0 nullable=0 is_null=0 */
###   @2='Alice' /* VARSTRING(400) meta=400 nullable=0 is_null=0 */
###   @3=120.50 /* DECIMAL(10,2) meta=2562 nullable=0 is_null=0 */
###   @4='SHIPPED' /* VARSTRING(80) meta=80 nullable=0 is_null=0 */
###   @5=1759392745 /* TIMESTAMP(0) meta=0 nullable=1 is_null=0 */
# at 1269
#251002 16:12:25 server id 1  end_log_pos 1300 CRC32 0x9d4d7ff4 	Xid = 8
COMMIT/*!*/;
```

可以看到和一开始的 insert 类似，只不过操作类型是 Update_rows，在 binlog 中的存储方式是保存 before image 和 after image。做 flashback 时，需要解析事件，把 before image 作为新的数据重新生成一次 DML 覆盖掉 after image，不能简单地把 before/after 顺序互换。如果把 binlog_row_image 调整为 MINIMAL，这里记录的 before image 只会包含定位行所需的主键/唯一键，after image 也只保留被修改的列，进一步减少传输量。最后同样分配一个全局 Xid 8 再做提交。

## DELETE 事务

```sql
DELETE FROM orders WHERE customer = 'Charlie';
```

```
# at 1300
#251002 16:12:25 server id 1  end_log_pos 1379 CRC32 0xaa464b06 	Anonymous_GTID	last_committed=2	sequence_number=4	rbr_only=yes	original_committed_timestamp=1759392745494268	immediate_commit_timestamp=1759392745494268	transaction_length=325
/*!50718 SET TRANSACTION ISOLATION LEVEL READ COMMITTED*//*!*/;
# original_commit_timestamp=1759392745494268 (2025-10-02 16:12:25.494268 CST)
# immediate_commit_timestamp=1759392745494268 (2025-10-02 16:12:25.494268 CST)
/*!80001 SET @@session.original_commit_timestamp=1759392745494268*//*!*/;
/*!80014 SET @@session.original_server_version=80403*//*!*/;
/*!80014 SET @@session.immediate_server_version=80403*//*!*/;
SET @@SESSION.GTID_NEXT= 'ANONYMOUS'/*!*/;
# at 1379
#251002 16:12:25 server id 1  end_log_pos 1456 CRC32 0x6f63b45c 	Query	thread_id=8	exec_time=0	error_code=0
SET TIMESTAMP=1759392745/*!*/;
BEGIN
/*!*/;
# at 1456
#251002 16:12:25 server id 1  end_log_pos 1526 CRC32 0x8c6aa150 	Table_map: `app_db`.`orders` mapped to number 85
# has_generated_invisible_primary_key=0
# at 1526
#251002 16:12:25 server id 1  end_log_pos 1594 CRC32 0x6fabb3ba 	Delete_rows: table id 85 flags: STMT_END_F
### DELETE FROM `app_db`.`orders`
### WHERE
###   @1=3 /* INT meta=0 nullable=0 is_null=0 */
###   @2='Charlie' /* VARSTRING(400) meta=400 nullable=0 is_null=0 */
###   @3=42.00 /* DECIMAL(10,2) meta=2562 nullable=0 is_null=0 */
###   @4='CANCELLED' /* VARSTRING(80) meta=80 nullable=0 is_null=0 */
###   @5=1759392745 /* TIMESTAMP(0) meta=0 nullable=1 is_null=0 */
# at 1594
#251002 16:12:25 server id 1  end_log_pos 1625 CRC32 0x1a6e940e 	Xid = 9
COMMIT/*!*/;
```

紧接着我们做了 DELETE，可以看到同样是先有 Table_map，它定义了后续 Row Event 所需要的表元数据，然后在具体的 Delete_rows 当中通过前面分配的 table id 85 引用该定义，记录了被删除那行数据的具体值。Delete_rows 只有 before image，因为它不需要写出新的行值；在 MINIMAL 模式下同样只会保留定位信息。最后分配 Xid 然后 commit。

```sql
SELECT * FROM orders;
```

## SELECT 与复制模式

binlog 本身只关心复制必须知道的数据变化，所以普通的 SELECT 这种只读查询不会被记录在 binlog 当中。但在基于语句或 Mixed 模式下，如果一个事务里出现了会影响后续 DML 分支的 SELECT（例如依赖 FOUND_ROWS()、ROW_COUNT() 或存储过程中读取结果以决定下一步逻辑），或者事务内调用了非确定性函数导致服务器切换到行模式，它就可能被写成 Query Event，目的是让从库具备同样的执行上下文并得到一致的决策结果。

