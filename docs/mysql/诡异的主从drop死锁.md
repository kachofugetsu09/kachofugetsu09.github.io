# 诡异的 DROP 死锁

在了解故事背景之前要先介绍几个东西。

## DDL、DCL、DML

### DDL（Data Definition Language）
**DDL** 是定义或者修改数据结构的语句。例如：
- `CREATE TABLE`
- `ALTER TABLE`
- `DROP TABLE`

### DCL（Data Control Language）
**DCL** 是控制数据访问权限和事务的语句。例如：
- `GRANT`
- `REVOKE`
- `COMMIT`
- `ROLLBACK`

### DML（Data Manipulation Language）
**DML** 是操作数据的语句。例如：
- `INSERT`
- `UPDATE`
- `DELETE`

## MDL 锁的诞生

因为 MySQL 本身想尽量榨干资源，所以它肯定需要并发，需要锁控制。它内部的锁远远不止行锁、表锁这样的，还有各种各样的锁。其中，有一种锁叫做 **MDL锁**（Metadata Lock），它是针对于 DDL 这种表修改语句的。

MySQL 早期版本的一个著名 bug：如果在查询一个表的过程中，即使是 RR 级别，如果另一个会话当中删除了这个表，那么这两次查询结果就不一致了，不满足可重复读的标准。

MDL 应运而生。你可以理解为在 DDL 语句执行前，先获取 MDL 锁，这样其他会话就不能修改表结构，从而避免了上述 bug。但是今天我们要说的 bug 也是因此诞生的。

## sequence_number 的分配逻辑

在理解主从同步的组提交机制之前，需要先了解 `sequence_number` 是如何分配的。

### sequence_number 的分配时机

**关键点：sequence_number 是在事务提交过程中，binlog 缓存刷盘时分配的，而不是在事务开始时分配。**

具体的分配流程如下：

```mysql-server/sql/binlog.cc#L2373-2374
trn_ctx->sequence_number = mysql_bin_log.m_dependency_tracker.step();
```

这个分配发生在 `binlog_cache_data::flush()` 方法中，该方法是在事务准备写入 binlog 文件时调用的。

### step() 方法的实现

`sequence_number` 的生成是通过逻辑时钟（Logical_clock）的原子递增实现的：

```cpp
int64 Logical_clock::step() {
  static_assert(SEQ_UNINIT == 0, "");
  DBUG_EXECUTE_IF("logical_clock_step_2", ++state;);
  return ++state;
}
```

这是一个简单的原子递增操作，确保每个事务都获得一个唯一的序列号。

### 分配的具体时序

1. **事务执行阶段**：事务在执行 SQL 语句时，`sequence_number` 尚未分配，此时为 `SEQ_UNINIT`（值为 0）
2. **准备提交阶段**：当事务准备提交时，调用 `binlog_cache_data::flush()`
3. **分配时刻**：在 flush 方法中，通过 `m_dependency_tracker.step()` 分配 `sequence_number`
4. **依赖计算**：紧接着计算 `last_committed`，如果是第一次分配则设为 `sequence_number - 1`

```cpp
if (trn_ctx->last_committed == SEQ_UNINIT)
  trn_ctx->last_committed = trn_ctx->sequence_number - 1;
```

### 为什么不在事务开始时分配

这种设计有以下考虑：

1. **避免浪费序列号**：如果事务回滚，就不会消耗 sequence_number
2. **保证顺序性**：sequence_number 的分配顺序与事务实际提交到 binlog 的顺序一致
3. **简化逻辑**：只有真正需要写入 binlog 的事务才会获得序列号

这个设计对于我们要讨论的死锁问题至关重要：**两个 DROP 语句即使几乎同时进入 flush 阶段，也会获得不同的 sequence_number（因为是原子递增），真正的问题在于 last_committed 的计算逻辑。**

## gh-ost

**gh-ost** 是一个在线的表修改工具，它会通过复制、重命名的方式提供在线修改表结构的能力。

### 主要流程：

1. **创建一个临时的幽灵表**
2. **数据复制阶段**
   - 2.1 复制监控点前的行数据到临时表
   - 2.2 持续复制监控点后的 binlog 数据到临时表
3. **验证数据一致性**
4. **替换原表**
5. **删除临时表**

## MySQL 的主从同步

可能很多人都和我一开始一样，只知道可以主从同步，但其实完全没了解，这就是八股害人的地方了。

在 5.7 之前，主库在处理事务的时候每个事务都需要独立完成 binlog 写入，然后 fsync。为了减少这个刷盘次数，你肯定就需要 IO 聚合成批次。每一个批次是一个组，组内事务的 binlog 写入是串行的，组间是并行的。

### 第一阶段：Prepare
这些线程会竞争一个 binlog 提交的锁，获取到锁的线程将 binlog 从内存写入到磁盘，但不进行 fsync。

在这个过程中会生成一个 `sequence_number`，它是一个自增的序列号，用来标识组内事务的顺序。

### 第二阶段：Commit
一整个组进行一次 fsync，将 binlog 写入到磁盘。更新一个名为 `last_committed` 的变量，它是一个组提交的 ID。

### 第三阶段：Slave 并行复制
从库提供并行复制的能力，如果`last_committed`事务相同，同时执行。

**并行复制的核心判断逻辑：**

1. **相同 last_committed 的事务可以并行执行**
   - 如果多个事务有相同的 `last_committed` 值，说明它们在主库是并行提交的
   - 从库认为这些事务之间没有依赖关系，可以并行复制

2. **sequence_number 用于确定执行顺序**
   - 即使可以并行执行，`sequence_number` 小的事务仍需要先开始
   - 这保证了事务的逻辑顺序不会完全颠倒

3. **依赖关系的传递**
   - 如果事务 B 的 `last_committed` 等于事务 A 的 `sequence_number`
   - 说明事务 B 必须等待事务 A 完成后才能开始

**具体的调度算法：**

```cpp
ptr_group->sequence_number = sequence_number =
    static_cast<Gtid_log_event *>(ev)->sequence_number;
ptr_group->last_committed = last_committed =
    static_cast<Gtid_log_event *>(ev)->last_committed;
```

从库的多线程复制协调器会根据这些值来决定：
- 哪些事务可以分配给同一个工作线程池
- 哪些事务必须等待其依赖的事务完成

通过这个方式，每一个具有相同 `last_committed` 的事务组就是一个逻辑上可以被并行处理的集合。

## 事故发生

在正常流程当中，主库执行 `DROP a`，再执行 `DROP a`。由于在 DROP 的过程中有 MDL 锁进行对元数据唯一的修改，导致两个操作是串行执行的，存在等待关系，第二个 DROP 会等待第一个操作，然后获得 MDL 锁。所以肯定是被放到两个不同的复制组当中，它们肯定会被串行执行。

但是有一个很诡异的情况。假设我们使用如下语句：

```sql
LOCK TABLES a WRITE, b WRITE;
```

锁住两张表，我们会获得一个 MDL 锁。

然后我们在会话1当中，执行：
```sql
DROP TABLE a;
```

**关键问题：这个时候它会直接释放所有的 MDL 锁！**

这是 MySQL MDL 锁的一个设计特点：当执行 `DROP TABLE` 时，会释放当前会话持有的所有相关 MDL 锁，而不仅仅是针对被删除表的锁。

在会话2当中，我们同样执行：
```sql
DROP TABLE a;
```

由于在会话1当中释放了 MDL 锁，所以会直接获取这个锁。也就是说，第二个 DROP 动作不需要等待 `DROP TABLE a` 对于锁的释放，二者被视作处于并行关系。

### 悲剧由此酿成：错误的并行分组

让我们详细分析真正的问题所在。关键在于 MySQL 5.7 中的组提交逻辑缺陷。

**正确的分配流程应该是：**

```cpp
trn_ctx->sequence_number = mysql_bin_log.m_dependency_tracker.step();

if (trn_ctx->last_committed == SEQ_UNINIT)
  trn_ctx->last_committed = trn_ctx->sequence_number - 1;
```

**第一个 DROP 语句的执行：**
1. 获得 sequence_number = N（通过原子递增）
2. 由于 last_committed 初始为 SEQ_UNINIT，设置 last_committed = N-1
3. 执行 DROP TABLE a，释放所有 MDL 锁

**第二个 DROP 语句的执行：**
1. 获得 sequence_number = N+1（原子递增，与第一个不同）
2. **关键问题**：由于没有等待第一个 DROP 完成，last_committed 仍被设置为 (N+1)-1 = N

但是，这里还有更深层的问题！

**实际上真正的问题在于组提交的批处理逻辑：**

在 MySQL 5.7 的组提交中，如果两个事务在很短时间内连续进入 flush 阶段，并且没有明显的锁冲突，它们可能会被归到同一个提交批次中。在这种情况下：

- 两个 DROP 都获得了不同的 sequence_number（N 和 N+1）
- 但在组提交过程中，**后面的事务会被重新标记为与前面事务有相同的 last_committed**
- 最终 binlog 记录：
```
# 第一个 DROP TABLE a
last_committed=N-1  sequence_number=N
# 第二个 DROP TABLE a - 被错误地标记为可并行  
last_committed=N-1  sequence_number=N+1  # 错误！应该是 last_committed=N
```

这种错误分组的根本原因是 MySQL 5.7 只基于 MDL 锁的物理等待关系来判断依赖，没有考虑资源访问的逻辑依赖关系。

### 从库并发执行导致死锁

在从库复制的过程当中，由于 `last_committed` 相同，调度器认为这两个事务可以并行执行：

```cpp
// 从库解析到相同的 last_committed，分配给并行工作线程
ptr_group->last_committed = last_committed = N-1;  // 相同值
```

**死锁产生的具体机制：**

当两个工作线程同时执行 `DROP TABLE a` 时，需要获取 MySQL 内部的多个资源锁，包括：
- 数据字典锁（Dictionary lock）
- 表定义缓存锁（Table definition cache lock）
- 表空间锁（Tablespace lock）

在底层会有一系列的锁需要在执行的过程中获取，然后释放。

假设说 `DROP a` 一共需要用到 MySQL 内部的多个锁，比如说 x、y：
- 第一个复制线程进来拿到了 x，要去获取 y
- 第二个复制线程获取了 y，要去获取 x

二者就会发生循环等待，造成死锁。

**锁排序问题：**

你可能会觉得，为什么不先拿到A再拿到B再拿到C这样的排序方案，强制必须拿到前面一个锁再拿后一个锁，来避免这个循环等待的场景。
**锁排序（Lock Ordering）** 确实是死锁预防的经典方法。如果所有线程都按照相同的顺序获取锁（比如先A锁，再B锁，最后C锁），就不会出现循环等待。

但是在这个 DROP TABLE 的场景下，问题比想象的复杂：

1. **MySQL 内部锁的复杂性**：DROP TABLE 操作涉及数百种不同类型的锁，跨越 SQL 层、存储引擎层、操作系统层
2. **动态锁获取顺序**：锁的获取顺序依赖于表的具体状态、存储引擎类型、缓存状态等，不是静态固定的
3. **性能权衡**：强制全局锁排序会严重影响并发性能

MySQL 选择了"死锁检测+回滚"的方式来处理底层死锁，而在复制层面通过依赖跟踪来避免这种冲突场景的发生。

**MySQL 错误日志中的典型表现：**
```
[ERROR] Slave SQL: Deadlock found when trying to get lock; 
try restarting transaction, Error_code: 1213
[ERROR] Error in Xid_log_event: Commit could not be completed, 
'Deadlock found when trying to get lock'
```

这个时候从库就会因为这两次 DROP 导致无法进入下一步，进入一个超高延时的状态，谁也无法完成 DROP。

## MySQL 新版本是如何修复这个问题的

MySQL 8.0 及更新版本通过增强的**依赖跟踪器 (Transaction Dependency Tracker)** 机制，从根本上解决了这个主库组提交分组错误的问题。

### 问题的本质回顾

5.7 版本的问题本质在于：**主库的组提交分组逻辑有缺陷**。

在我们的例子中：
```sql
-- 会话1: LOCK TABLES a WRITE, b WRITE;
-- 会话1: DROP TABLE a;  -- 这里释放了所有MDL锁
-- 会话2: DROP TABLE a;  -- 不需要等待，直接获取锁
```

由于第二个 DROP 不需要等待第一个 DROP 释放锁，主库误认为它们可以并行执行，给了它们相同的 `last_committed`，导致从库并行执行时发生死锁。

### 新版本的核心修复：智能依赖跟踪


**旧版本(MySQL 5.7)的分配逻辑：**
- **只看当前锁状态**：判断 `last_committed` 时，只检查"现在是否持有锁"
- **忽略历史访问**：不会检查之前是否有事务访问过相同的资源
- **简单粗暴的判断**：如果当前没有锁冲突，就认为可以并行执行，分配相同的 `last_committed`

在我们的例子中：
- 第一个 DROP 执行后释放了所有锁
- 第二个 DROP 检查时发现"当前没有锁冲突"
- 错误地被分配了相同的 `last_committed`

**新版本(MySQL 8.0+)的改进逻辑：**
- **资源访问历史追踪**：会检查"在更小的 sequence_number 时，是否有事务访问过相同资源"
- **逻辑依赖检测**：即使当前没有物理锁冲突，也能识别逻辑上的依赖关系
- **智能依赖计算**：通过 writeset_history 记录资源访问历史

MySQL 新版本引入了依赖跟踪器，它不再仅仅依赖 MDL 锁的物理等待关系，而是通过多种机制来正确识别事务间的依赖关系。

#### 1. 资源访问历史追踪

新版本的依赖跟踪器会记住哪些事务访问了哪些资源，即使没有物理锁冲突也能识别逻辑依赖：

```cpp
class Transaction_dependency_tracker {
 public:
  void get_dependency(THD *thd, bool parallelization_barrier,
                      int64 &sequence_number, int64 &commit_parent);
 private:
  Commit_order_trx_dependency_tracker m_commit_order;
  Writeset_trx_dependency_tracker m_writeset;
};
```

#### 2. 针对我们例子的具体修复逻辑

让我们看看在我们的例子中，新版本是如何工作的：

**第一个 DROP TABLE a (会话1)**：
- 获得 sequence_number = 100
- 由于是第一个操作，last_committed = 99 (前一个已提交事务)
- **关键**：依赖跟踪器记录到 `writeset_history` 中：**表 a 被 sequence_number=100 的事务访问过**

**第二个 DROP TABLE a (会话2)**：
- 获得 sequence_number = 101  
- **新版本的智能检查**：
  ```cpp
  // 检查writeset_history，发现表a在sequence_number=100时被访问过
  if (hst->second > last_parent && hst->second < sequence_number)
    last_parent = hst->second; // last_parent = 100
  
  // 设置依赖关系
  commit_parent = std::min(last_parent, commit_parent); // = 100
  ```
- 结果：last_committed = 100（而不是错误的99）

这样，即使物理上没有锁冲突，从库也会看到：
- 第一个 DROP: last_committed=99, sequence_number=100  
- 第二个 DROP: last_committed=100, sequence_number=101

从库识别出依赖关系，**串行执行**这两个 DROP，避免了死锁

#### 3. 核心代码实现

主库在写 binlog 时的依赖计算：

```cpp
int64 sequence_number, last_committed;
/* Generate logical timestamps for MTS */
m_dependency_tracker.get_dependency(thd, parallelization_barrier,
                                    sequence_number, last_committed);
```

依赖跟踪器的核心逻辑：

```cpp
void Transaction_dependency_tracker::get_dependency(
    THD *thd, bool parallelization_barrier, int64 &sequence_number,
    int64 &commit_parent) {
  // 首先通过提交顺序计算基础依赖
  m_commit_order.get_dependency(thd, parallelization_barrier, sequence_number,
                                commit_parent);
  // 然后通过写集合进一步优化依赖关系  
  m_writeset.get_dependency(thd, sequence_number, commit_parent);
}
```

#### 4. 两层保护机制

新版本实际上有两层保护：

**第一层 - 提交顺序依赖跟踪**：
- 跟踪资源访问历史，确保对同一资源的操作有正确依赖关系
- 即使没有锁等待，也能识别逻辑依赖

**第二层 - 写集合依赖优化**：
- 对于 DML 操作，通过行级写集合进一步优化并行度
- 对于 DDL，保持保守的依赖关系

### 修复效果总结

通过这个智能依赖跟踪机制：

1. **解决了根本问题**：主库能够正确识别事务间的依赖关系，不再仅依赖物理锁等待
2. **保持高性能**：对于真正无冲突的事务，仍然可以并行执行
3. **向后兼容**：不影响现有应用的使用方式

在我们的 `LOCK TABLES` + `DROP TABLE` 例子中，新版本主库会正确地将两个 DROP 标记为有依赖关系，从库串行执行，彻底避免了死锁问题。

## 解决方案

因为这个场景会出现在使用 gh-ost 进行在线修改表的场景，在机理上就是重复执行了 DROP 操作。因为ghost表也就是新建出来要替换原表的表和原表要进行drop操作，所以这个情况是非常非常容易发生的。

治标不治本的解决方案是在ghost执行DROP操作的时候加入 `sync.Once` 字段，确保 DROP 操作整个流程当中只会执行一次。

但是总的来说，由于受到 5.7 版本的桎梏，所以只能修改 gh-ost。这是个治标不治本的办法，最好的办法还是更新 MySQL 版本，如果条件允许。
