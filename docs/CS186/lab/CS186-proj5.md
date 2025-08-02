## Task 1: 事务状态管理

**任务目标:** 实现恢复管理器（`RecoveryManager`）对事务状态的跟踪和记录。当事务提交、中止或结束时，我们需要更新其在事务表`transactionTable`）中的状态，并向日志中追加相应的记录。

> **任务要求:**
> 你需要实现 `commit`、`abort` 和 `end` 三个方法。在这些方法中，你需要保持事务表更新，设置正确的事务状态，并写入适当的日志记录。每次为事务追加日志时（包括状态变更、数据更新、CLR），都必须更新事务表中的 `lastLSN` 字段。

---

### 1.1 `commit` 方法：提交事务

**目标:** 将一个事务的“提交”决定持久化，使其在系统崩溃后依然有效。

**逻辑解析:**
`commit` 方法是实现**持久性 (Durability)** 的关键。根据预写日志（WAL）协议，一个事务不能被认为是成功提交的，除非它决定提交的日志记录（`CommitTransactionLogRecord`）已经被写入到稳定的存储（如磁盘）上。

1.  **创建提交记录**: 创建一个 `CommitTransactionLogRecord`，它包含了事务号和该事务之前的最后一条日志序列号（`prevLSN`），以维持日志链的连续性。
2.  **追加并刷盘 (Flush)**: 将这条提交记录追加到日志中。最关键的一步是，**必须立即调用 `flushToLSN` 将日志刷到磁盘**。如果在刷盘前系统崩溃，这条提交记录就会丢失，该事务在恢复后将被视为未完成，其所有修改都会被回滚。这确保了“提交”这个行为本身是原子且持久的。
3.  **更新状态**: 只有在日志成功刷盘后，才能安全地将事务状态更新为 `COMMITTING`。同时，更新事务表中的 `lastLSN`，指向刚刚写入的提交记录。

**代码实现:**

```java
@Override
public long commit(long transNum) {
    // TODO(proj5): implement
    TransactionTableEntry transactionEntry = transactionTable.get(transNum);
    if (transactionEntry == null) {
        throw new IllegalArgumentException("Transaction " + transNum + " not found.");
    }

    long prevLSN = transactionEntry.lastLSN;
    LogRecord commitRecord = new CommitTransactionLogRecord(transNum, prevLSN);
    long commitLSN = logManager.appendToLog(commitRecord);

    flushToLSN(commitLSN);

    transactionEntry.lastLSN = commitLSN;
    Transaction transaction = transactionEntry.transaction;
    transaction.setStatus(Transaction.Status.COMMITTING);

    return commitLSN;
}
```

---

### 1.2 `abort` 方法：中止事务

**目标:** 标记一个事务需要被回滚。

**逻辑解析:**
与 `commit` 不同，`abort` 方法的实现相对简单。当中止发生时，我们只需要记录下“中止”这个意图即可，实际的回滚操作可以推迟到 `end` 方法或系统恢复时进行。

1.  **创建中止记录**: 创建一个 `AbortTransactionLogRecord` 并追加到日志中。
2.  **无需刷盘**: 这里**不需要**立即刷盘。因为即使这条中止记录在崩溃中丢失，事务在恢复时也会因为没有对应的 `COMMIT` 记录而被视为“loser” transaction，其修改同样会被回滚。
3.  **更新状态**: 将事务状态更新为 `ABORTING`，并更新其 `lastLSN`。

**代码实现:**
```java
@Override
public long abort(long transNum) {
    // TODO(proj5): implement
    TransactionTableEntry transactionEntry = transactionTable.get(transNum);
    if (transactionEntry == null) {
        throw new IllegalArgumentException("Transaction " + transNum + " not found.");
    }

    long prevLSN = transactionEntry.lastLSN;
    LogRecord abortRecord = new AbortTransactionLogRecord(transNum, prevLSN);
    long abortLSN = logManager.appendToLog(abortRecord);

    transactionEntry.lastLSN = abortLSN;
    Transaction transaction = transactionEntry.transaction;
    transaction.setStatus(Transaction.Status.ABORTING);
    return abortLSN;
}
```

---

### 1.3 `end` 方法与 `rollbackToLSN` 辅助方法

`end` 方法负责终结一个事务，并将其从事务表中移除。对于一个已中止的事务，`end` 必须先执行回滚。这个回滚逻辑由辅助方法 `rollbackToLSN` 实现。

#### `rollbackToLSN` 辅助方法

**目标:** 将一个事务的所有修改撤销，直到指定的 `LSN`。

**逻辑解析:**
这是 ARIES 算法中**撤销 (Undo)** 逻辑的核心体现。它通过反向遍历事务的日志链来撤销每一个可撤销的操作。

1.  **反向遍历**: 从事务的 `lastLSN` 开始，通过日志记录中的 `getPrevLSN()` 方法，沿着日志链向后追溯。
2.  **补偿日志记录 (CLR - Compensation Log Record)**:
    *   当遇到一个可撤销的记录（如 `UpdatePageLogRecord`）时，我们调用它的 `undo()` 方法。这个方法会生成一个**补偿日志记录 (CLR)**。
    *   **CLR 的作用**: CLR 描述了撤销操作本身（例如，将页面的某个区域恢复为“before image”）。它有两个至关重要的特性：
        1.  **CLR 是重做优先的 (redo-only)**: CLR 自身不能被撤销，避免了“撤销一个撤销操作”的无限循环。
        2.  **包含 `undoNextLSN`**: CLR 中包含一个指针 (`undoNextLSN`)，指向**下一个需要被撤销的、更早的日志记录**。这使得在回滚过程中可以跳过已经被撤销的操作，提高了效率。
3.  **写入并应用 CLR**: 生成的 CLR 被追加到日志中，并**立即应用**到数据页上。同时，事务的 `lastLSN` 必须更新为这条新 CLR 的 LSN。因为CLR日志也是日志。

**代码实现:**

```java
private void rollbackToLSN(long transNum, long LSN) {
    TransactionTableEntry transactionEntry = transactionTable.get(transNum);
    LogRecord lastRecord = logManager.fetchLogRecord(transactionEntry.lastLSN);
    long lastRecordLSN = lastRecord.getLSN();
    
    long currentLSN = lastRecord.getUndoNextLSN().orElse(lastRecordLSN);

    while (currentLSN > LSN) {
        LogRecord logRecord = logManager.fetchLogRecord(currentLSN);
        if (logRecord.isUndoable()) {

            LogRecord clr = logRecord.undo(transactionEntry.lastLSN);
            long clrLSN = logManager.appendToLog(clr);


            clr.redo(this, diskSpaceManager, bufferManager);


            transactionEntry.lastLSN = clrLSN;
        }
        // 移动到前一个日志记录
        currentLSN = logRecord.getPrevLSN().orElse(0L);
    }
}
```

#### `end` 方法

**目标:** 终结一个事务，清理其状态，并将其从事务表中移除。

**逻辑解析:**
1.  **回滚中止的事务**: 如果事务的状态是 `ABORTING`，首先调用 `rollbackToLSN(transNum, 0)` 将其所有修改完全撤销。
2.  **写入结束记录**: 创建并追加一条 `EndTransactionLogRecord`。这条记录在恢复时非常重要，它明确地告诉恢复系统：这个事务已经彻底完成，不需要再对它进行任何分析或处理。
3.  **清理**: 调用 `transaction.cleanup()` 释放事务持有的内存资源，并将其状态设置为 `COMPLETE`。
4.  **移除事务**: 最后，将该事务从活跃事务表 (`transactionTable`) 中移除。

**代码实现:**
```java
@Override
public long end(long transNum) {
    // TODO(proj5): implement
    TransactionTableEntry transactionEntry = transactionTable.get(transNum);
    if (transactionEntry == null) {
        throw new IllegalArgumentException("Transaction " + transNum + " not found.");
    }
    Transaction transaction = transactionEntry.transaction;
    
    if (transaction.getStatus() == Transaction.Status.ABORTING) {
        rollbackToLSN(transNum, 0);
    }

    EndTransactionLogRecord endRecord = new EndTransactionLogRecord(transNum, transactionEntry.lastLSN);
    long endLSN = logManager.appendToLog(endRecord);
    
    transaction.cleanup();
    transaction.setStatus(Transaction.Status.COMPLETE);

    transactionTable.remove(transNum);
    return endLSN;
}
```

---

## Task 2: 记录页面写入

**任务目标:** 在缓冲管理器（`BufferManager`）将页面写入磁盘之前，实现 `logPageWrite` 方法来记录页面的修改，严格遵循预写日志（WAL）协议。

> **任务要求:**
> 当缓冲管理器尝试写入页面时，`logPageWrite` 会被调用。你需要创建并追加相应的日志记录，并更新事务表和脏页表（Dirty Page Table）。

**逻辑解析:**
这个方法是 **预写日志 (Write-Ahead Logging, WAL)** 协议的核心体现。WAL 规定：**在将一个被修改过的（“脏”）数据页写入磁盘之前，描述该修改的日志记录必须先被写入磁盘。** 这个规则是确保原子性和持久性的基石。

1.  **获取 `prevLSN`**: 从事务表中找到当前事务，并获取其 `lastLSN` 作为新日志记录的 `prevLSN`，以维护日志链。
2.  **创建更新记录**: 创建一个 `UpdatePageLogRecord`。这条记录包含了修改前（`before`）和修改后（`after`）的页面内容。`before` image 用于**撤销 (Undo)** 操作，`after` image 用于**重做 (Redo)** 操作。
3.  **追加日志**: 将更新记录追加到日志中，获得其 LSN。
4.  **更新 `lastLSN`**: 更新事务表中的 `lastLSN` 为新记录的 LSN。
5.  **标记脏页**: 调用 `dirtyPage(pageNum, LSN)` 将该页面加入脏页表DPT）。DPT 跟踪了哪些页面的磁盘版本落后于内存版本。`LSN` 参数在这里是 `recLSN`（Recovery LSN），它记录了**第一次**使该页面变脏的日志记录的 LSN。这在恢复的重做阶段至关重要，因为它决定了重做扫描的起点。

**代码实现:**

```java
@Override
public long logPageWrite(long transNum, long pageNum, short pageOffset, byte[] before,
                         byte[] after) {
    assert (before.length == after.length);
    assert (before.length <= BufferManager.EFFECTIVE_PAGE_SIZE / 2);
    // TODO(proj5): implement
    TransactionTableEntry transactionEntry = transactionTable.get(transNum);
    if (transactionEntry == null) {
        throw new IllegalArgumentException("Transaction " + transNum + " not found.");
    }

    long prevLSN = transactionEntry.lastLSN;
    LogRecord record = new UpdatePageLogRecord(transNum, pageNum, prevLSN, pageOffset, before, after);
    
    long LSN = logManager.appendToLog(record);
    transactionEntry.lastLSN = LSN;
    
    dirtyPage(pageNum, LSN);
    return LSN;
}
```

---

## Task 3: 保存点 (Savepoints)

**任务目标:** 实现 `rollbackToSavepoint` 方法，允许事务进行部分回滚，即只撤销到某个先前定义的保存点之后的操作。

> **任务要求:**
> `rollbackToSavepoint` 的撤销逻辑与 `end()` 中的非常相似。如果你已经实现了 `rollbackToLSN`，你应该能够在这里重用它。

**逻辑解析:**
保存点为长事务提供了灵活性，允许它们在不完全中止的情况下撤销部分工作。

1.  **获取保存点 LSN**: 事务在创建保存点时，会将其当时的 `lastLSN` 与一个名称关联并存储。`transactionEntry.getSavepoint(name)` 就是用来检索这个 LSN。
2.  **重用回滚逻辑**: 实现这个功能的关键在于认识到“回滚到保存点”和“完全回滚”本质上是同一个操作，区别仅在于回滚的终点不同。我们已经构建了通用的 `rollbackToLSN` 方法，它接受一个目标 LSN 作为参数。
3.  **调用辅助方法**: 因此，我们只需调用 `rollbackToLSN(transNum, savepointLSN)` 即可。所有复杂的撤销逻辑，包括 CLR 的处理，都由 `rollbackToLSN` 完美胜任。

**代码实现:**
```java
@Override
public void rollbackToSavepoint(long transNum, String name) {
    TransactionTableEntry transactionEntry = transactionTable.get(transNum);
    assert (transactionEntry != null);

    long savepointLSN = transactionEntry.getSavepoint(name);

    // TODO(proj5): implement
    rollbackToLSN(transNum, savepointLSN);

    return;
}
```

---

## Task 4: 检查点 (Checkpoints)

**任务目标:** 实现 `checkpoint` 方法，定期将系统状态（脏页表和事务表）持久化到日志中，以缩短系统崩溃后的恢复时间。

> **任务要求:**
> 方法概述如下。请注意，部分实现代码已经提供给你；你需要负责编写未在给定代码中涵盖的结束检查点记录。
>
> 首先，向日志中添加一个开始检查点记录。
>
> 然后，我们写入结束检查点记录，考虑到我们可能需要将结束检查点记录拆分，因为 DPT/Xact 表条目过多。
>
> 即使所有表都是空的，也应该写入一个结束检查点记录，并且只有在必要时才应该写入多个结束检查点记录。
>
> 这是如何完成的：
>
> 遍历 dirtyPageTable 并复制条目。如果在任何时候，复制当前记录会导致结束检查点记录过大，则应在日志中追加一个包含复制的 DPT 条目的结束检查点记录。
>
> 遍历事务表，并复制状态/最后 LSN，仅在需要时输出结束检查点记录。
>
> 输出一个最终的结束检查点。
>
> 最后，我们必须用新成功检查点的开始检查点记录的 LSN 重写主记录。

---

### 逻辑解析:

检查点是 ARIES 恢复算法中一个至关重要的机制，其核心目标是**缩短系统崩溃后的恢复时间**。如果没有检查点，系统在恢复时可能需要从日志的起始点开始扫描，这对于长时间运行的数据库来说是不可接受的。检查点通过定期将系统在某个时间点的状态（特别是脏页表 DPT 和活跃事务表 Transaction Table）记录到日志中，为恢复过程提供一个“快速启动”点。

ARIES 检查点通常分为两个阶段：

1.  **开始检查点 (Begin Checkpoint)**:
    *   写入一条 `BeginCheckpointLogRecord` 到日志中。这条记录本身不包含任何数据，但它的 LSN 将被记录在主记录 (Master Record) 中，作为最新成功检查点的起点。
    *   在写入 `BeginCheckpointLogRecord` 之后，系统可以继续正常操作，不需要暂停所有活动。

2.  **结束检查点 (End Checkpoint)**:
    *   这是检查点的核心部分，它捕获了检查点发生时系统的关键状态信息：
        *   **脏页表 (Dirty Page Table, DPT)**: 记录了哪些页面在内存中被修改过，但尚未写入磁盘。DPT 中的每个条目还包含一个 `recLSN` (Recovery LSN)，表示该页面第一次变脏的日志记录的 LSN。这个 `recLSN` 在恢复的重做阶段至关重要，它指示了从日志的哪个位置开始重做该页面的修改。
        *   **活跃事务表 (Transaction Table)**: 记录了所有当前活跃事务的状态和它们的 `lastLSN`。这些信息在恢复的撤销阶段用于识别需要回滚的事务。
    *   **分段写入**: 由于 DPT 和事务表可能非常大，一个 `EndCheckpointLogRecord` 可能无法容纳所有信息。因此，`EndCheckpointLogRecord` 被设计为可以分段写入。`fitsInOneRecord` 方法用于判断当前收集到的 DPT 和事务表条目是否能够放入一个日志记录中。如果不能，就需要写入当前的 `EndCheckpointLogRecord`，并清空缓存 (`chkptDPT`, `chkptTxnTable`)，然后继续收集剩余的条目，直到所有信息都被记录。即使 DPT 和事务表都为空，也至少需要写入一个 `EndCheckpointLogRecord` 来表示检查点的完成。
    *   **刷盘 (Flush)**: 最后一个 `EndCheckpointLogRecord` 必须被刷到磁盘，以确保检查点本身是持久的。
    *   **更新主记录 (Master Record)**: 最后，主记录会被更新，指向这个新完成的检查点的 `BeginCheckpointLogRecord` 的 LSN。主记录是日志文件中的一个固定位置，它总是指向最新成功检查点的开始位置，这是系统恢复时找到最新检查点的入口。

通过这种两阶段和分段写入的方式，检查点操作对系统正常运行的影响被最小化，同时为崩溃恢复提供了高效的起点。`chkptDPT` 和 `chkptTxnTable` 在代码中充当了临时缓存，用于在生成 `EndCheckpointLogRecord` 之前收集和暂存 DPT 和事务表的快照数据。

### 代码实现:

以下是 `checkpoint` 方法的实现，它遵循了上述逻辑，负责生成开始检查点记录、分段生成结束检查点记录，并最终更新主记录。

```java
@Override
    public synchronized void checkpoint() {
        // Create begin checkpoint log record and write to log
        LogRecord beginRecord = new BeginCheckpointLogRecord();
        long beginLSN = logManager.appendToLog(beginRecord);

        Map<Long, Long> chkptDPT = new HashMap<>();
        Map<Long, Pair<Transaction.Status, Long>> chkptTxnTable = new HashMap<>();

        // TODO(proj5): generate end checkpoint record(s) for DPT and transaction table

        //iterate through the dirtyPageTable and copy the entries.
        for (Map.Entry<Long, Long> entry : dirtyPageTable.entrySet()) {
            // 检查是否还能添加更多条目
            if (!EndCheckpointLogRecord.fitsInOneRecord(chkptDPT.size() + 1, chkptTxnTable.size())) {
                //If at any point, copying the current record would cause the end checkpoint record to be too large,
                // an end checkpoint record with the copied DPT entries should be appended to the log.
                LogRecord endRecord = new EndCheckpointLogRecord(chkptDPT, chkptTxnTable);
                logManager.appendToLog(endRecord);

                chkptDPT.clear();
            }

            chkptDPT.put(entry.getKey(), entry.getValue());
        }

        //iterate through the transaction table,
        for (Map.Entry<Long, TransactionTableEntry> entry : transactionTable.entrySet()) {
            // and copy the status/lastLSN,
            Long transNum = entry.getKey();
            Transaction.Status status = entry.getValue().transaction.getStatus();
            Long lastLSN = entry.getValue().lastLSN;

            // outputting end checkpoint records only as needed.
            if (!EndCheckpointLogRecord.fitsInOneRecord(chkptDPT.size(), chkptTxnTable.size() + 1)) {

                LogRecord endRecord = new EndCheckpointLogRecord(chkptDPT, chkptTxnTable);
                logManager.appendToLog(endRecord);


                chkptDPT.clear();
                chkptTxnTable.clear();
            }
            
            chkptTxnTable.put(transNum, new Pair<>(status, lastLSN));
        }


        // Last end checkpoint record
        LogRecord endRecord = new EndCheckpointLogRecord(chkptDPT, chkptTxnTable);
        logManager.appendToLog(endRecord);
        // Ensure checkpoint is fully flushed before updating the master record
        flushToLSN(endRecord.getLSN());

        // Update master record
        MasterLogRecord masterRecord = new MasterLogRecord(beginLSN);
        logManager.rewriteMasterRecord(masterRecord);
    }
```



---



## Task 5: 恢复分析 (Analysis)

**任务目标:** 实现 `restartAnalysis` 方法，该方法执行重启恢复的分析过程。其核心目标是在系统崩溃后，通过扫描日志来重建数据库在崩溃前的关键状态信息：脏页表（Dirty Page Table, DPT）和活跃事务表（Transaction Table）。

这里任务目标太长了就不贴了。只做复述。

---

### 5.1 逻辑解析: 分析阶段 (Analysis Phase)

数据库系统在发生崩溃后，为了恢复到一致性状态，通常会遵循 ARIES 恢复算法。ARIES 恢复过程分为三个主要阶段：**分析 (Analysis)**、**重做 (Redo)** 和 **撤销 (Undo)**。`restartAnalysis` 方法正是实现了这三个阶段中的第一个——分析阶段。

分析阶段是整个恢复过程的起点，其主要目标是：
1.  **确定重做起点 (Redo LSN)**：找到日志中需要开始重做操作的最早点。
2.  **重建脏页表 (DPT)**：恢复崩溃时内存中所有脏页的状态，包括它们的 `recLSN`（Recovery LSN，即该页第一次变脏的日志记录的LSN）。
3.  **重建活跃事务表 (Transaction Table)**：恢复崩溃时所有活跃事务的状态（RUNNING, COMMITTING, ABORTING/RECOVERY_ABORTING）和它们的 `lastLSN`。

这些重建出的信息将作为后续重做和撤销阶段的基础，确保数据的一致性和持久性。

---

### 5.2 实现 `restartAnalysis`

分析阶段的核心是**从前向后扫描日志**，从最后一个检查点开始，直到日志末尾。在扫描过程中，我们根据遇到的不同日志记录来逐步重建 DPT 和事务表。

#### 步骤 1: 初始化分析

分析从读取主记录（Master Record）开始，该记录位于日志的固定位置（LSN 0），并指向最新检查点的起始 LSN。我们从这个 LSN 开始扫描。

```java
void restartAnalysis() {
    // Read master record
    LogRecord record = logManager.fetchLogRecord(0L);
    // Type checking
    assert (record != null && record.getType() == LogType.MASTER);
    MasterLogRecord masterRecord = (MasterLogRecord) record;
    // Get start checkpoint LSN
    long LSN = masterRecord.lastCheckpointLSN;
    // Set of transactions that have completed
    Set<Long> endedTransactions = new HashSet<>();
    
    Iterator<LogRecord> logIterator = logManager.scanFrom(LSN);
```

#### 步骤 2: 遍历日志记录

我们遍历从检查点开始的每一条日志记录，并根据其类型进行处理。

```java
    while(logIterator.hasNext()){
        LogRecord logRecord = logIterator.next();
```

##### a) 处理事务相关记录

对于任何与事务相关的记录（如页面更新、分配等），我们都需要确保该事务存在于我们的事务表中，并更新其 `lastLSN`。如果事务是第一次出现，我们会使用 `startTransaction` 创建并添加它。

```java
        // 1. 处理事务操作日志记录：更新事务的lastLSN，如果事务不存在则创建并添加到事务表
        if(logRecord.getTransNum().isPresent()){
            long transNum = logRecord.getTransNum().get();
            if (!transactionTable.containsKey(transNum)) {
                Transaction transaction = newTransaction.apply(transNum);
                startTransaction(transaction);
            }
            transactionTable.get(transNum).lastLSN = logRecord.getLSN();
        }
```

##### b) 处理页面操作记录

对于修改页面的记录，我们需要更新脏页表（DPT）。
- `UpdatePageLogRecord` 和 `UndoUpdatePageLogRecord`：这些操作使页面变“脏”，因为修改发生在内存中。我们调用 `dirtyPage` 将页面添加到 DPT，如果它尚不存在，则其 `recLSN` 被设置为当前日志记录的 LSN。
- `FreePageLogRecord` 和 `UndoAllocPageLogRecord`：这些操作会立即将更改写入磁盘，因此如果页面在 DPT 中，应将其移除。

```java
        // 2. 处理页面操作的日志记录：更新脏页表
        if(logRecord.getPageNum().isPresent()) {
            long pageNum = logRecord.getPageNum().get();
            LogType type = logRecord.getType();
            
            if (type == LogType.UPDATE_PAGE || type == LogType.UNDO_UPDATE_PAGE) {
                // UpdatePage/UndoUpdatePage 可能使内存中的页面变脏
                dirtyPage(pageNum, logRecord.getLSN());
            } else if (type == LogType.FREE_PAGE || type == LogType.UNDO_ALLOC_PAGE) {
                // FreePage/UndoAllocPage 会立即将变化写入磁盘，相当于从DPT中移除
                dirtyPageTable.remove(pageNum);
            }
            // AllocPage/UndoFreePage 不需要特殊处理
        }
```

##### c) 处理事务状态变更记录

当遇到明确改变事务状态的记录时，我们更新事务表中的状态。
- `COMMIT_TRANSACTION`: 事务进入 `COMMITTING` 状态。
- `ABORT_TRANSACTION`: 事务进入 `RECOVERY_ABORTING` 状态（在恢复期间，我们使用这个特殊状态）。
- `END_TRANSACTION`: 事务已完成。我们清理它，将其标记为 `COMPLETE`，从事务表中移除，并将其 ID 添加到 `endedTransactions` 集合中，以供后续处理检查点时使用。

```java
        // 3. 处理事务状态变化的日志记录
        LogType type = logRecord.getType();
        if(type == LogType.COMMIT_TRANSACTION){
            long transNum = logRecord.getTransNum().get();
            TransactionTableEntry transactionEntry = transactionTable.get(transNum);
            transactionEntry.transaction.setStatus(Transaction.Status.COMMITTING);
        }
        else if(type == LogType.ABORT_TRANSACTION){
            long transNum = logRecord.getTransNum().get();
            TransactionTableEntry transactionEntry = transactionTable.get(transNum);
            transactionEntry.transaction.setStatus(Transaction.Status.RECOVERY_ABORTING);
        }
        else if(type == LogType.END_TRANSACTION){
            long transNum = logRecord.getTransNum().get();
            TransactionTableEntry transactionEntry = transactionTable.get(transNum);
            transactionEntry.transaction.cleanup(); // 清理事务资源
            transactionEntry.transaction.setStatus(Transaction.Status.COMPLETE);
            endedTransactions.add(transNum); // 记录已结束事务
            transactionTable.remove(transNum); // 从活跃事务表中移除
        }
```

##### d) 处理检查点记录

`EndCheckpointLogRecord` 包含了检查点发生时 DPT 和事务表的快照。我们需要将这些快照信息合并到我们正在构建的当前状态中。
- **合并 DPT**: 检查点中的 `recLSN` 被认为是更准确的，因此我们直接用它来更新 DPT。
- **合并事务表**:
    - 如果一个事务在检查点中，但我们已经通过 `END_TRANSACTION` 记录知道它已结束，我们就忽略它。
    - 否则，我们更新事务的 `lastLSN`（取检查点和当前记录中的较大值）和状态。
    - 状态更新必须遵循 ARIES 的状态推进规则（例如，`RUNNING` -> `COMMITTING`），不能回退。我们使用一个辅助方法 `canChange` 来检查这一点。

```java
        // 4. 处理检查点记录
        else if(type == LogType.END_CHECKPOINT){
            EndCheckpointLogRecord checkpointRecord = (EndCheckpointLogRecord) logRecord;

            // 合并 DPT
            for(Map.Entry<Long, Long> entry : checkpointRecord.getDirtyPageTable().entrySet()) {
                // 检查点中的recLSN总是更准确，直接使用
                dirtyPageTable.put(entry.getKey(), entry.getValue());
            }

            // 合并事务表
            for(Map.Entry<Long, Pair<Transaction.Status, Long>> entry : checkpointRecord.getTransactionTable().entrySet()) {
                long transNum = entry.getKey();
                Transaction.Status checkpointStatus = entry.getValue().getFirst();
                long checkpointLastLSN = entry.getValue().getSecond();

                // 跳过已在日志扫描中确认结束的事务
                if (endedTransactions.contains(transNum)) {
                    continue;
                }

                // 如果当前内存事务表中没有此事务，则创建并添加
                if (!transactionTable.containsKey(transNum)) {
                    Transaction transaction = newTransaction.apply(transNum);
                    startTransaction(transaction);
                }

                TransactionTableEntry tableEntry = transactionTable.get(transNum);

                // 更新 lastLSN：使用检查点中的lastLSN与当前内存中lastLSN的较大值
                if (checkpointLastLSN >= tableEntry.lastLSN) {
                    tableEntry.lastLSN = checkpointLastLSN;
                }

                // 更新状态：根据canChange辅助方法判断是否可以进行状态转换
                Transaction.Status currentStatus = tableEntry.transaction.getStatus();
                if (canChange(currentStatus, checkpointStatus)) {
                    // 如果检查点显示事务正在中止，应设置为RECOVERY_ABORTING
                    if (checkpointStatus == Transaction.Status.ABORTING) {
                        tableEntry.transaction.setStatus(Transaction.Status.RECOVERY_ABORTING);
                    } else {
                        tableEntry.transaction.setStatus(checkpointStatus);
                    }
                }
            }
        }
    } // end of while loop
```

这里是 `canChange` 辅助方法的实现，它定义了合法的状态转换路径：
```java
private boolean canChange(Transaction.Status currentStatus, Transaction.Status checkpointStatus) {
    if (currentStatus == checkpointStatus) {
        return false;
    }

    switch (currentStatus) {
        case RUNNING:
            return checkpointStatus == Transaction.Status.COMMITTING ||
                    checkpointStatus == Transaction.Status.ABORTING;

        case COMMITTING:
            return checkpointStatus == Transaction.Status.COMPLETE;

        case ABORTING:
        case RECOVERY_ABORTING:
            return checkpointStatus == Transaction.Status.COMPLETE;

        case COMPLETE:
            return false;

        default:
            return false;
    }
}
```

#### 步骤 3: 结束分析

在扫描完所有日志记录后，事务表中可能还剩下一些未完成的事务。我们需要根据它们的状态进行最终处理：
- `COMMITTING`: 这些事务已经决定提交，我们将其标记为 `COMPLETE`，写入 `EndTransactionLogRecord`，并从事务表中移除。
- `RUNNING`: 这些事务在崩溃时仍未决定提交或中止，因此它们必须被回滚。我们将它们的状态改为 `RECOVERY_ABORTING`，并写入一条 `AbortTransactionLogRecord`，以便在后续的 Undo 阶段进行处理。
- `RECOVERY_ABORTING`: 这些事务已经处于中止流程中，无需额外操作，等待 Undo 阶段处理即可。

```java
    // 5. 扫描结束后，处理事务表中剩余的事务
    Iterator<Map.Entry<Long, TransactionTableEntry>> iterator = transactionTable.entrySet().iterator();
    while (iterator.hasNext()) {
        Map.Entry<Long, TransactionTableEntry> entry = iterator.next();
        long transNum = entry.getKey();
        TransactionTableEntry tableEntry = entry.getValue();
        Transaction.Status status = tableEntry.transaction.getStatus();

        if (status == Transaction.Status.COMMITTING) {
            // 处于COMMITTING状态的事务，表示其提交记录已写入日志但可能未完全刷盘，
            // 在恢复时应视为已提交，并清理其状态。
            tableEntry.transaction.cleanup();
            tableEntry.transaction.setStatus(Transaction.Status.COMPLETE);
            // 写入EndTransactionLogRecord，表示事务彻底完成
            long endLSN = logManager.appendToLog(new EndTransactionLogRecord(transNum, tableEntry.lastLSN));
            iterator.remove(); // 从事务表中移除
        } else if (status == Transaction.Status.RUNNING) {
            // 处于RUNNING状态的事务，表示其在崩溃时未完成，应被回滚。
            // 将其状态设置为RECOVERY_ABORTING，并写入AbortTransactionLogRecord。
            tableEntry.transaction.setStatus(Transaction.Status.RECOVERY_ABORTING);
            long abortLSN = logManager.appendToLog(new AbortTransactionLogRecord(transNum, tableEntry.lastLSN));
            tableEntry.lastLSN = abortLSN;
        }
        // 对于处于RECOVERY_ABORTING状态的事务，无需执行任何操作，它们将在Undo阶段被处理。
    }
    return;
}
```



---



## Task 6: 重做恢复 (Redo)

> **任务要求:**
> 本节仅涉及 `restartRedo` 方法，该方法执行重启恢复的重做过程。回顾课程内容可知，重做阶段从脏页表中的最低 recLSN 开始。从该点开始扫描，如果记录可重做且属于以下任一情况，则重做该记录：
>
> 一个分区相关记录（AllocPart，UndoAllocPart，FreePart，UndoFreePart）
>
> 一个分配页面的记录（AllocPage，UndoFreePage）
>
> 一个修改页面的记录（UpdatePage，UndoUpdatePage，UndoAllocPage，FreePage），且满足以下所有条件：
>
> 1.  页面位于 DPT 中
> 2.  记录的 LSN 大于或等于该页面 DPT 的 recLSN。
> 3.  页面本身的 pageLSN 严格小于记录的 LSN。
>
> 要检查页面的 pageLSN，您需要从缓冲区管理器中获取它。我们建议您使用以下模板：
>
> ```java
> Page page = bufferManager.fetchPage(new DummyLockContext(), pageNum);
> try {
>     // Do anything that requires the page here
> } finally {
>     page.unpin();
> }
> ```
>
> 务必考虑在空日志上调用 `restartRedo` 的情况！

---

### 6.1 逻辑解析: 重做阶段 (Redo Phase)

重做 (Redo) 阶段是 ARIES 恢复算法的第二步，紧跟在分析 (Analysis) 阶段之后。其核心目标是**“重复历史” (Repeating History)**，将数据库恢复到崩溃发生瞬间的状态。这确保了所有已提交事务的修改都会被持久化，即使它们在崩溃时还未被写入磁盘。

**为什么需要重做？**
重做阶段是实现**持久性 (Durability)** 的关键。在系统运行时，为了性能，修改过的数据页（脏页）并不会立即写入磁盘。如果此时发生崩溃，这些修改就会丢失。重做阶段通过扫描日志，将所有记录在案的修改重新应用一遍，确保数据库能够恢复到崩溃前的最新状态。

**重做的基本原则：**
1.  **起点**: 重做扫描并非从日志的开头开始，而是从**脏页表 (DPT) 中最小的 `recLSN`** 开始。
    *   **原因**: 在分析阶段重建的 DPT 告诉我们哪些页在崩溃时是脏的。`recLSN` 是指一个页面**第一次**变脏时的日志序列号。任何 LSN 小于最小 `recLSN` 的日志记录，其对应的页面修改一定已经在上一个检查点或更早的时候被安全地刷回了磁盘。因此，从最小 `recLSN` 开始扫描可以极大地减少不必要的工作。

2.  **幂等性 (Idempotency)**: 重做操作必须是幂等的，即多次执行同一个重做操作应与只执行一次产生相同的结果。这通过一个关键的检查来实现。

**对于页面修改记录，必须同时满足以下三个条件才能重做：**

1.  **页面位于 DPT 中 (Page is in the DPT)**
    *   **原因**: DPT 包含了所有在崩溃时可能未被持久化的脏页。如果一个页面不在 DPT 中，说明它在磁盘上的版本在崩溃时就是最新的，无需对它进行任何重做操作。

2.  **记录的 LSN ≥ 页面的 recLSN (Record's LSN ≥ Page's recLSN in DPT)**
    *   **原因**: `recLSN` 记录了该页面变脏的“起点”。我们只关心从这个起点开始的所有修改。任何在此之前的日志记录所描述的修改，都属于该页面“变脏”前的历史，早已被持久化。

3.  **页面本身的 pageLSN < 记录的 LSN (Page's on-disk pageLSN < Record's LSN)**
    *   **原因**: 这是实现**幂等性**的关键。`pageLSN` 是存储在每个数据页头部的一个特殊字段，记录了**最后一次成功应用到该页的修改所对应的 LSN**。在重做时，我们首先从磁盘读取页面，检查它的 `pageLSN`。如果 `page.getPageLSN()` 大于或等于当前日志记录的 LSN，就意味着这条日志所描述的修改（甚至可能包括后续的修改）**已经在本轮恢复就被刷回磁盘了**。此时我们必须跳过重做，否则会错误地重复应用一个修改。只有当页面的 `pageLSN` 小于日志记录的 LSN 时，才证明这个修改是“新”的，需要被应用。

对于分区和页面分配/释放的记录，它们属于数据库物理结构的变更，通常被设计为可以安全地重复执行，因此不需要上述复杂的检查，只要遇到就直接重做。

---

### 6.2 实现 `restartRedo`

`restartRedo` 的实现严格遵循上述逻辑。

#### 步骤 1: 处理特殊情况 (Handle Edge Cases)

如果分析阶段结束后，DPT 为空，说明在崩溃时没有任何脏页。这意味着所有修改都已成功写入磁盘，无需进行任何重做操作。因此，我们首先检查 DPT 是否为空，如果是，则直接返回。

#### 步骤 2: 确定重做起点 (Determine Redo Start Point)

我们从 DPT 中找出所有 `recLSN` 的最小值。这个值就是我们向前扫描日志的起点 `startLSN`。

#### 步骤 3: 向前扫描并重做 (Scan Forward and Redo)

我们从 `startLSN` 开始遍历日志。对于每一条可重做 (`isRedoable`) 的记录：
- **分区和页面分配记录**: 如果是 `AllocPart`、`FreePart`、`AllocPage` 等改变存储结构的操作，我们无条件调用其 `redo()` 方法。
- **页面修改记录**: 如果是 `UpdatePage`、`FreePage` 等改变页面内容的操作，我们执行三条件检查：
    1.  检查该页是否存在于 DPT 中。
    2.  检查记录的 LSN 是否不小于该页在 DPT 中的 `recLSN`。
    3.  从缓冲管理器中获取该页面，并检查其 `pageLSN` 是否严格小于当前记录的 LSN。
        - **注意**: 获取页面必须使用 `try-finally` 结构，以确保页面在使用后一定会被 `unpin`，避免造成死锁或资源泄露。

只有当所有条件都满足时，才调用记录的 `redo()` 方法，将修改应用到页面上。

以下是完整的代码实现，它精确地执行了上述所有步骤。

```java
void restartRedo() {

        if (dirtyPageTable.isEmpty()) {
            return;
        }
        // TODO(proj5): implement
        long startLSN = Collections.min(dirtyPageTable.values());
        Iterator<LogRecord> logIterator = logManager.scanFrom(startLSN);
        while(logIterator.hasNext()){
            LogRecord record = logIterator.next();
            if(record.isRedoable()){
                if(record.getType() == LogType.ALLOC_PART|| record.getType() == LogType.FREE_PART ||
                        record.getType() == LogType.UNDO_ALLOC_PART || record.getType() == LogType.UNDO_FREE_PART) {

                    record.redo(this, diskSpaceManager, bufferManager);
                } else if (record.getType() == LogType.ALLOC_PAGE || record.getType() == LogType.UNDO_FREE_PAGE) {

                    record.redo(this, diskSpaceManager, bufferManager);
                }
                else if(record.getType() == LogType.UPDATE_PAGE|| record.getType() == LogType.UNDO_UPDATE_PAGE ||
                        record.getType() == LogType.UNDO_ALLOC_PAGE || record.getType() == LogType.FREE_PAGE ){
                    if(record.getPageNum().isPresent() && dirtyPageTable.containsKey(record.getPageNum().get())) {
                        if(record.getLSN() >= dirtyPageTable.get(record.getPageNum().get())) {
                            long pageNum =record.getPageNum().get();

                            Page page = bufferManager.fetchPage(new DummyLockContext(),pageNum);
                            try{
                                if(page.getPageLSN() < record.getLSN()){
                                    record.redo(this, diskSpaceManager, bufferManager);
                                }
                            }finally {
                                page.unpin();
                            }
                        }
                    }
                }
            }
        }
        return;
    }

```



---



------



## Task 7: 撤销恢复 (Undo)



> 任务要求:
>
> 本节仅涉及 restartUndo 方法，该方法执行重启恢复的撤销过程。回想一下讲座内容，在撤销阶段，由于大量随机 I/O 的产生，我们不中止并逐个撤销事务。相反，我们反复撤销需要撤销的具有最高 LSN 的日志记录，直到完成，仅对日志进行一次遍历。
>
> 撤销阶段从每个处于 (RECOVERY_ABORTING 状态) 的中止事务的 lastLSN 集合开始。
>
> 我们反复获取这些 LSN 中最大的日志记录，并：
>
> - 如果记录可撤销，我们写出 CLR 并撤销它*
>
> - 如果记录有 `undoNextLSN`，就用它的 `undoNextLSN` 替换集合中的 LSN；否则用 `prevLSN` 替换。
>
> - 如果前一步的 LSN 为 0，则结束事务，将其从集合和事务表中移除。有关结束事务的更全面概述，请参阅分析任务中的“结束事务”小节。
>
>   \* undo 方法实际上不会撤销更改——它返回补偿日志记录。要实际撤销更改，您需要追加返回的 CLR，然后对其调用 redo 。

------



### 逻辑解析: 撤销阶段 (Undo Phase)



撤销 (Undo) 阶段是 ARIES 恢复算法的第三步，也是最后一步。它紧跟在重做 (Redo) 阶段之后，其主要目标是**撤销所有未提交事务（即在崩溃时处于 `RUNNING` 或 `ABORTING`/`RECOVERY_ABORTING` 状态的事务）所做的修改**，从而将数据库恢复到一个逻辑上一致的状态。

为什么需要撤销？

在重做阶段，我们“重复历史”，将数据库恢复到崩溃前的物理状态。但这其中包含了所有事务的修改，包括那些未提交的事务。根据数据库事务的原子性原则，未提交的修改必须被回滚。撤销阶段就是专门处理这些“loser”事务，确保它们对数据库的影响被完全消除。

**撤销的关键原则：**

1. **反向日志遍历**: 不同于分析和重做阶段的正向扫描，撤销阶段需要**反向遍历**事务的日志链。这是因为要撤销一个操作，通常需要知道其“修改前”的状态，而这个状态的信息通常存在于原始操作的日志记录中。
2. **单一遍历优化**: 为了避免大量随机 I/O（反向遍历意味着可能需要频繁跳转到日志中相距较远的位置），ARIES 算法采用了一种优化策略：它维护一个优先级队列，其中包含了所有需要撤销的事务的当前 `lastLSN`。每次总是从队列中取出**最大的 LSN**（即最近的日志记录）进行处理。这种方式使得对日志文件的访问尽可能地顺序化，从而提高了效率。
3. **补偿日志记录 (CLR)**: 每当撤销一个操作时，ARIES 都会生成一个补偿日志记录 (CLR)。CLR 有以下重要特性：
   - **重做优先**: CLR 自身是“重做优先”的，这意味着它们不会被再次撤销，避免了无限循环。
   - **`undoNextLSN`**: CLR 包含一个 `undoNextLSN` 指针，指向下一个需要被撤销的、更早的日志记录。这个指针允许我们在撤销过程中跳过已经通过其他 CLR 撤销过的操作，优化了回滚路径。
   - **写入并重做 CLR**: 生成的 CLR 必须被追加到日志中，并且**立即将其 `redo()` 方法应用到数据页上**。`redo()` 方法在这里实际上执行的是撤销操作所造成的物理更改（例如，将页面恢复到 `before image`）。这一步是确保撤销操作本身也是持久化的，并且在二次崩溃后能够正确地重演。
4. **事务结束**: 当一个事务的所有修改都被撤销完毕（即其需要撤销的 LSN 追溯到 0 时），该事务就被视为完成。此时，我们会为其写入一个 `EndTransactionLogRecord`，将其从活跃事务表中移除，并清理其资源。



### 实现 `restartUndo`



`restartUndo` 的实现遵循上述逻辑，利用一个优先队列来高效地处理所有需要撤销的事务。



#### 步骤 1: 初始化撤销队列



我们创建一个**逆序**的优先级队列 (`PriorityQueue`)，它将根据 `lastLSN` 降序排列。我们将所有在分析阶段被标记为 `RECOVERY_ABORTING` 状态的事务（这些是需要回滚的“loser”事务）的 `(lastLSN, TransactionTableEntry)` 对添加到队列中。



```java
void restartUndo() {
    // 1. 初始化优先队列：包含所有处于 RECOVERY_ABORTING 状态的事务及其 lastLSN
    PriorityQueue<Pair<Long, TransactionTableEntry>> undoQueue = new PriorityQueue<>(
            new PairFirstReverseComparator<>()); // 逆序，优先处理最大的LSN
    for (TransactionTableEntry entry : transactionTable.values()) {
        if (entry.transaction.getStatus() == Transaction.Status.RECOVERY_ABORTING) {
            undoQueue.add(new Pair<>(entry.lastLSN, entry));
        }
    }
```



#### 步骤 2: 循环撤销直到队列为空



只要队列不为空，我们就持续从队列中取出 LSN 最大的日志记录进行处理。

```Java
    // 2. 反复处理队列中 LSN 最大的日志记录
    while (!undoQueue.isEmpty()) {
        Pair<Long, TransactionTableEntry> pair = undoQueue.poll();
        long currentLSN = pair.getFirst();
        TransactionTableEntry entry = pair.getSecond();
        LogRecord record = logManager.fetchLogRecord(currentLSN);
```



#### 步骤 3: 处理可撤销记录



如果当前日志记录是可撤销的 (`isUndoable()`):

1. **生成 CLR**: 调用 `record.undo(entry.lastLSN)` 方法生成一个补偿日志记录 (CLR)。这里的 `entry.lastLSN` 作为 CLR 的 `prevLSN`，确保日志链的连续性。
2. **追加 CLR**: 将 CLR 追加到日志中，并获取其 LSN (`clrLSN`)。
3. **更新事务表**: **立即**更新该事务在 `transactionTableEntry` 中的 `lastLSN` 为新的 `clrLSN`。这是 ARIES 中的“脏页表 / 事务表中的 LSN 总是当前最新的 LSN”的体现。
4. **执行重做**: **关键一步**：调用 `clr.redo(this, diskSpaceManager, bufferManager)`。尽管是撤销阶段，CLR 的应用是通过 `redo` 方法完成的。这是因为 CLR 本身描述了将页面恢复到某个状态的操作，这个“恢复”动作在恢复过程中是需要“重做”的，以确保数据库的物理状态与日志记录一致。

```Java
        if (record.isUndoable()) {
            // 如果记录可撤销，生成 CLR
            LogRecord clr = record.undo(entry.lastLSN);
            long clrLSN = logManager.appendToLog(clr);

            // 立即更新事务的 lastLSN
            entry.lastLSN = clrLSN;

            // 应用 CLR 的修改（通过 redo 方法实现实际的撤销操作）
            clr.redo(this, diskSpaceManager, bufferManager);
        }
```

**关于 `clr.redo()` 的顺序重要性：**

如果 `clr.redo()` 在 `entry.lastLSN = clrLSN;` 之前执行，可能会导致不一致。在 `redo()` 方法执行时，它可能会访问 `RecoveryManager` 内部的其他状态（例如，通过 `bufferManager` 获取页面，并可能更新 `pageLSN`）。如果此时 `entry.lastLSN` 还未更新为 `clrLSN`，那么后续的日志操作或者进一步的恢复逻辑，可能会看到一个不正确的 `lastLSN`，从而导致日志链断裂或状态不一致的问题。**正确的顺序是先将 CLR 写入日志并更新事务的 `lastLSN`，然后再应用 CLR 描述的物理修改。** 这样确保了日志记录和内存状态的同步，遵循了 WAL 的原则。



#### 步骤 4: 确定下一个撤销点



获取下一个需要撤销的 LSN：优先使用 `record.getUndoNextLSN()`（如果存在，这是 CLR 特有的优化），否则使用 `record.getPrevLSN()`。

```Java
        // 3. 确定下一个需要撤销的 LSN
        long nextLSN = record.getUndoNextLSN().orElse(record.getPrevLSN().orElse(0L));
```



#### 步骤 5: 事务终结

如果 `nextLSN` 为 0，表示该事务的所有可撤销操作都已处理完毕。

1. **清理事务**: 调用 `entry.transaction.cleanup()` 释放事务资源。
2. **设置状态**: 将事务状态设置为 `COMPLETE`。
3. **写入 `EndTransactionLogRecord`**: 为该事务写入一条 `EndTransactionLogRecord`。这表示事务已彻底完成，无论是通过提交还是中止。
4. **移除事务**: 将该事务从 `transactionTable` 中移除。

如果 `nextLSN` 不为 0，则将 `(nextLSN, entry)` 对重新添加到优先级队列中，以便继续处理该事务的更早日志记录。

```Java
        // 4. 判断事务是否完成撤销
        if (nextLSN == 0) {
            // 事务已完全撤销，进行清理和状态更新
            entry.transaction.cleanup();
            entry.transaction.setStatus(Transaction.Status.COMPLETE);
            // 写入 EndTransactionLogRecord
            logManager.appendToLog(new EndTransactionLogRecord(entry.transaction.getTransNum(), entry.lastLSN));
            // 从事务表中移除
            transactionTable.remove(entry.transaction.getTransNum());
        } else {
            // 继续撤销该事务的更早记录
            undoQueue.add(new Pair<>(nextLSN, entry));
        }
    }
    return;
}
```



以上，我们CS186中的proj结束。
