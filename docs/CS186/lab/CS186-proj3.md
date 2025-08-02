# CS186 Project 3 实现指南

这篇文章是对于CS186的proj3的总结和实现思路。

这个proj有一个不一样的地方是他建议我们阅读一下对应的代码骨架。
那么我们就大致浏览一下，整理一下各个部分的功能。

里面有一个`BacktrackingIterator`接口，对比普通迭代器他多了一个功能就是可以用一个指针来储存想要回溯的地方，等到需要回溯的时候可以通过`reset()`方法回到这个位置。
类`QueryOperator`实现了这个接口，是操作查询的基类。
类`JoinOperator`继承自`QueryOperator`，实现了连接操作。他的主要作用是实现高效的多表连接。
他是一个抽象类，里面实现了多个Operator以提供不同的连接方式，根据对应的关键字有不同的选择。
SequentialScanOperator.java - 接收一个表名，提供该表所有记录的迭代器
 IndexScanOperator.java - 接收一个表名、列名、一个谓词操作符（>、<、<=、>=、=）和一个值。指定的列必须在该列上建立索引，此操作符才能工作。如果建立了索引，索引扫描将利用索引高效地返回满足给定谓词和值的记录（例如 salaries.yearid >= 2000 ）。

这大致就是比较关键的骨架。

## Task1: Blocking Nested Loop join（BNJL）
任务的目标是：
>你应该阅读 BNLJOperator 中的给定骨架代码。迭代器的 next 和 hasNext 方法已经为你填写好了，但你需要实现 fetchNextRecord 方法，该方法应该完成 BNLJ 算法的大部分工作。还有两个建议的辅助方法： fetchNextLeftBlock ，它应该从 leftSourceIterator 获取下一块非空左表页面，以及 fetchNextRightPage ，它应该从 rightSourceIterator 获取下一页非空右表。

里面有一个比较关键的提示

fetchNextRecord 方法如其名称所示，应该获取连接输出的下一条记录。在实现这个方法时，你应该考虑四个重要的情况：

Case 1: 右侧页面迭代器还有记录可以生成。

Case 2: 右侧页面迭代器没有记录可以生成了，但左侧块迭代器还有。

Case 3: 右侧页面和左侧块迭代器都没有记录了，但右关系还有更多页面。

Case 4: 右侧页面和左侧块迭代器都没有记录了，右关系也没有更多页面了，但左关系还有更多块。

### 总结 BNJL 算法的核心思想

BNLJ 的核心在于**块级别的嵌套循环**。它将左关系 (Outer Relation) 分成多个“块”（由 `numBuffers - 2` 页组成），然后对于左关系的每个块，都将其与右关系 (Inner Relation) 的**所有**页面进行匹配。

这个过程可以形象地理解为：

* **外层循环：遍历左关系的块。** 每次读取一个左块到内存中。
* **内层循环：遍历右关系的所有页面。** 对于当前内存中的左块，逐页读取右关系的数据，并进行匹配。
* **最内层循环：记录级别的匹配。** 在内存中，对于左块中的每一条记录，都会遍历当前右页中的所有记录，进行连接条件的比较。

为了实现这种多层嵌套和重复扫描，`BacktrackingIterator` 的 `markNext()` 和 `reset()` 方法至关重要。

让我们用数字范围坐标举例：

假设左关系 $L$ 的记录可以表示为 `(左块起始记录ID, 左块结束记录ID)`，右关系 $R$ 的记录可以表示为 `(右页起始记录ID, 右页结束记录ID)`。

1.  当一个左块，比如范围是 **`[1, 100]`** 的记录加载到内存后，它需要依次与右关系的所有页面进行匹配。
    * 比如，它先与右关系的第一页，范围是 **`[1, 50]`** 的记录进行匹配。
    * 当 `rightPageIterator` 遍历完 `[1, 50]` 中的所有记录后，需要加载右关系的下一页，例如范围是 **`[51, 100]`** 的记录。此时，为了确保左块 `[1, 100]` 中的所有记录都能从头开始和新的右页 `[51, 100]` 进行匹配，`leftBlockIterator` 必须 **重置** 回到左块的起始位置 `1`。
2.  当左块 `[1, 100]` 已经遍历完整个右关系的所有页面后（即匹配完了 `[1, 50]`, `[51, 100]`, `[101, 150]` 等所有右页），会加载左关系的下一个块，比如范围是 **`[101, 200]`** 的记录。此时，`rightSourceIterator` 必须 **重置** 回到整个右关系 $R$ 的起始位置（即 `1`），才能确保 `[101, 200]` 这个左块也能从头开始遍历右关系的所有页面。


这种“重置”操作确保了任何一个左块都能与整个右关系完整地进行连接，避免遗漏任何可能的匹配。

根据这个规律，当我们遍历完右边的一部分，等到下一次fetch新的右侧，我们应当重置左侧的迭代器，这样才能保证左侧部分没有遗漏，举个例子，假设一个块是3x3，一共是3x6 其中3是这个左侧。
当我们便利完最后一个第一个page,最后一个遍历的是[3,3]这个时候左侧迭代器是3,如果我们在fetch下一个右侧的时候不做重置，那么下次就会从[4,3]开始，所有的1和2都被漏掉了。所以我们需要一个重置。那么就需要利用迭代器的reset方法，我们就需要标记一下这个重置。

markNext() 标记的是 `leftBlockIterator` 即将返回的第一个记录的位置。
例如，如果当前获取到的是左块，记录范围是 `[101, 200]`，`markNext()` 会在记录 `101` 的位置打上书签。
这样，当需要重新扫描这个左块时，可以通过 `reset()` 回到 `101` 处，确保从块的开头再次遍历。
以下是实现
```java
private void fetchNextLeftBlock() {
            if(!this.leftSourceIterator.hasNext()){
                this.leftBlockIterator = null;
                this.leftRecord = null;
                return;
            }
            this.leftBlockIterator = QueryOperator.getBlockIterator(
                    this.leftSourceIterator, getLeftSource().getSchema(), numBuffers-2
            );

            if(this.leftBlockIterator.hasNext()){
                
                this.leftBlockIterator.markNext();
                this.leftRecord = this.leftBlockIterator.next();
            } else {
                this.leftRecord = null;
            }
        }
```
同样我们也需要为右迭代器提供回溯功能，以下是实现
```java
 private void fetchNextRightPage() {
            if(!this.rightSourceIterator.hasNext()){
                return;
            }
            this.rightPageIterator = QueryOperator.getBlockIterator(
                    this.rightSourceIterator, getRightSource().getSchema(), 1
            );
            
            if(this.rightPageIterator != null) {
                this.rightPageIterator.markNext();
            }
        }
```
紧接着，我们来处理fetchNextRecord这个关键方法。
ppt中的讲解：
```
 for each rpage in R:
     for each spage in S:
         for each rtuple in rpage:
             for each stuple in spage:
                 if join_condition(rtuple, stuple):
                     add <rtuple, stuple> to result buffer
```
首先仿照SNLJOperator 写一个始终的自旋
首先实现case1的情况，右侧页面迭代器有一个值要生成，最后返回一个包含左右record的合Record。
也就是迭代器不是null同时hasnext。
```java
if(this.rightPageIterator != null && this.rightPageIterator.hasNext()){
                    Record rightRecord = this.rightPageIterator.next();
                    if(this.leftRecord != null && compare(this.leftRecord, rightRecord) == 0){
                        return this.leftRecord.concat(rightRecord);
                    }
                }
```
然后是case2的情况
> **Case 2: 右侧页面迭代器没有值可以生成，但左侧块迭代器有**
>
> 当 `rightPageIterator` 已经遍历完当前右页的所有记录（例如，从记录 `51` 到 `100`），但 `leftBlockIterator` 还有更多记录时，我们需要移动到左块的下一个记录 (`this.leftRecord = this.leftBlockIterator.next();`)。由于新的 `leftRecord` 需要从头开始与**当前的**右页进行匹配，因此我们需要 **重置 `rightPageIterator`** 到该右页的起始位置（即记录 `51`）。
>
> 例如，当前 `leftRecord` 是左块中的记录 `101`，它已经匹配完了右页 `[51, 100]` 中的所有记录。现在 `leftBlockIterator` 移动到左块中的下一条记录 `102`。为了让记录 `102` 能够从头开始匹配 `[51, 100]` 中的所有记录，`rightPageIterator` 必须被重置回 `51`。
```java
else if(this.leftBlockIterator != null && this.leftBlockIterator.hasNext()){
                    this.leftRecord = this.leftBlockIterator.next();
                    //因为左块迭代器做了移动，每一个迭代器的行为应该是匹配右侧每一个值，所以这里要重置右迭代器。
                    if(this.rightPageIterator != null) {
                        this.rightPageIterator.reset();
                    }
                }
```

> **Case 3: 右侧页面和左侧块迭代器都没有值可以生成，但右侧页面还有更多**
>
> 当当前右页（例如 `[51, 100]`）和当前左块（例如 `[1, 100]`）都已遍历完毕，但右关系中还有更多的页面时，我们需要获取下一个右侧页面 (`this.fetchNextRightPage();`)。一旦获取了新的右页（例如，范围从 `[51, 100]` 切换到 `[101, 150]`），为了确保整个当前左块 `[1, 100]` 能与这个新右页 `[101, 150]` 的所有记录进行匹配，我们需要 **重置 `leftBlockIterator`** 到其起始位置（即记录 `1`）。
>
> 例如，当前左块 `[1, 100]` 已经匹配完右页 `[51, 100]` 中的所有记录。现在 `[51, 100]` 已经没有更多记录了，但右关系中还有 `[101, 150]`。我们 `fetchNextRightPage()` 获取 `[101, 150]`。这时，为了让 `[1, 100]` 中的所有记录都能与 `[101, 150]` 中的所有记录从头开始匹配，`leftBlockIterator` 必须被重置回 `1`。
```java
else {
    //case3
                    this.fetchNextRightPage();
                    if(this.rightPageIterator != null && this.rightPageIterator.hasNext()){
                        // 重置左块到开始位置，重新扫描左块
                        if(this.leftBlockIterator != null) {
                            this.leftBlockIterator.reset();
                            if(this.leftBlockIterator.hasNext()) {
                                this.leftRecord = this.leftBlockIterator.next();
                            } else {
                                this.leftRecord = null;
                            }
                        }
                    }
                    //case4
                    else {

                        this.fetchNextLeftBlock();
                        if(this.leftBlockIterator == null || !this.leftBlockIterator.hasNext()){
                            return null;
                        }
                        this.rightSourceIterator.reset();
                        this.fetchNextRightPage();
                    }
}

```
> **Case 4: 右页和左块迭代器都没有值，也没有更多的右页，但仍有左块**
>
> 这是最外层循环的推进：当当前右页和当前左块都已遍历完毕，并且右关系中也没有更多页面可供当前左块匹配时，这意味着当前左块已经完成了它对整个右关系的匹配。此时，我们需要获取左关系的下一个块 (`this.fetchNextLeftBlock();`)。一旦获取了新的左块（例如，从 `[1, 100]` 切换到 `[101, 200]`），为了确保这个新的左块能从头开始与**整个右关系**进行匹配，我们需要 **重置 `rightSourceIterator`** 到右关系的起始位置（即记录 `1`），然后 `fetchNextRightPage()` 来加载右关系的第一个页面。

以上实现完成。

本任务的关键点在于 当一个页或者块结束后，我们需要把fetch到的初始部分做mark标记，以便重置。
当另一个部分需要fetch新的部分，就是我们需要重置的时机。


---

## Task2： Hash Joins

第二个任务是实现**Grace Hash Join (GHJ)**。与BNLJ不同，哈希连接是一种完全不同的连接思路，它利用哈希函数将大问题分解成小问题来解决。

### 为什么需要 Grace Hash Join？

在数据库中，我们经常需要处理比内存大得多的数据。框架中已经提供了一个简单的哈希连接实现 `SHJOperator` (Simple Hash Join)。它的工作方式是：
1.  将整个左关系（Inner Relation）读入内存，并为其建立一个哈希表。
2.  然后逐条读取右关系（Outer Relation）的记录，利用哈希表查找匹配项。

这种方法的**致命弱点**是：它假设整个左关系可以完全装入内存。如果左关系太大，`SHJOperator` 就会因为内存不足而失败。

**Grace Hash Join** 正是为了解决这个问题而设计的。它的核心思想是“分而治之”：如果数据一次性处理不了，就把它切分成若干个小块，直到每一块都小到可以轻松放进内存里进行处理。

GHJ 分为两个主要阶段：

1.  **分区 (Partition) 阶段**：
    *   **目标**：将左关系 R 和右关系 S，根据连接键（Join Key）的哈希值，分别划分到不同的分区（Partition）中。
    *   **过程**：遍历 R 和 S 中的每一条记录，计算其连接键的哈希值，然后根据哈希结果（通常是 `hash % num_partitions`）决定这条记录属于哪个分区。例如，所有哈希到分区 `i` 的 R 记录形成 `Ri`，所有哈希到分区 `i` 的 S 记录形成 `Si`。
    *   **关键保证**：通过这种方式，我们知道 `Ri` 中的记录**只可能**与 `Si` 中的记录匹配，而不可能与任何其他分区 `Sj` (j ≠ i) 的记录匹配。这极大地缩小了搜索范围。

2.  **构建与探测 (Build & Probe) 阶段**：
    *   **目标**：对每一对分区 `(Ri, Si)` 执行连接操作。
    *   **过程**：依次处理每个分区对。对于分区对 `(Ri, Si)`，我们把它当作一个独立的、规模更小的连接问题来处理。我们读取其中一个分区（通常是较小的那个，比如 `Ri`）到内存中，为其建立一个哈希表（**Build**）。然后，我们逐条读取另一个分区 `Si` 的记录，在刚刚建立的哈希表中查找匹配项（**Probe**）。
    *   **内存要求**：这个阶段能成功的前提是，对于每一对分区 `(Ri, Si)`，至少有一个分区的大小小于可用的内存缓冲区（`B-2`页）。

### 任务分析

>您需要实现的功能都将完成在 GHJOperator.java 中。您需要实现函数 partition 、 buildAndProbe、run 。此外，您还需要在 getBreakSHJInputs 和 getBreakGHJInputs 中提供一些输入，这些输入将用于测试 Simple Hash Join 失败但 Grace Hash Join 通过（在 testBreakSHJButPassGHJ 中测试）以及 GHJ 出现错误（在 testGHJBreak 中测试）。

接下来，我们一步步实现这几个关键方法。

### `partition` 方法

`partition` 方法是 GHJ 的基石。我们需要一个通用的分区逻辑，既能处理左关系，也能处理右关系，并且支持多轮分区（这是 GHJ 的“Grace”所在，我们稍后会看到）。

一个很好的起点是参考 `SHJOperator` 中已有的 `partition` 方法：
```java
private void partition(Partition[] partitions, Iterable<Record> leftRecords) {
        for (Record record: leftRecords) {
            // Partition left records on the chosen column
            DataBox columnValue = record.getValue(getLeftColumnIndex());
            int hash = HashFunc.hashDataBox(columnValue, 1);
            // modulo to get which partition to use
            int partitionNum = hash % partitions.length;
            if (partitionNum < 0)  // hash might be negative
                partitionNum += partitions.length;
            partitions[partitionNum].add(record);
        }
    }
```
这个实现只为左关系设计，并且只使用固定的哈希函数（`pass=1`）。为了让它更通用，我们需要进行扩展：
1.  **支持左右关系**：通过一个 `boolean left` 参数来决定是使用左连接键还是右连接键。
2.  **支持多轮哈希**：通过一个 `int pass` 参数来改变哈希函数。这至关重要，因为如果第一轮分区后某个分区仍然太大，我们需要用**不同**的哈希函数在下一轮对它进行再次切分。

这是我们优化后的 `partition` 实现：
```java
private void partition(Partition[] partitions, Iterable<Record> records, boolean left,
 int pass) {
        for(Record record: records){
            int columnIndex = left ? getLeftColumnIndex() : getRightColumnIndex();
            DataBox columnValue = record.getValue(columnIndex);
            int hash = HashFunc.hashDataBox(columnValue, pass);

            int partitionNum = hash % partitions.length;
            if (partitionNum < 0)  
                partitionNum += partitions.length;
            partitions[partitionNum].add(record);
        }
    }
```
这个方法现在可以根据 `left` 参数为任一关系分区，并利用 `pass` 参数在递归分区时改变哈希行为。

### `buildAndProbe` 方法

当分区完成后，我们就得到了一系列成对的、规模更小的分区 `(leftPartitions[i], rightPartitions[i])`。`buildAndProbe` 的任务就是处理这样一对分区。

**设计核心**：为了在内存中构建哈希表，我们必须选择两个分区中较小的一个。这样可以最大化利用有限的内存空间。
*   如果左分区 `leftPartition` 更小（页数 `≤ B-2`），我们就用它来构建哈希表，然后用右分区 `rightPartition` 来探测。
*   反之，如果右分区更小，就用它来构建，用左分区来探测。
*   如果两个分区都大于 `B-2` 页，说明这一轮分区还不够“细”，当前方法无法处理，需要抛出异常（这个异常会在 `run` 方法中被捕获并触发递归分区）。

**举例说明**：假设我们有 `B=20` 个缓冲区，那么可用于构建哈希表的内存是 `B-2 = 18` 页。现在要处理一对分区：`leftPartitions[i]` 大小为 `15` 页，`rightPartitions[i]` 大小为 `100` 页。
1.  我们检查发现 `15 <= 18`，所以选择 `leftPartitions[i]` 作为构建方。
2.  我们将 `leftPartitions[i]` 的所有记录读入内存，并根据连接键的值构建一个哈希表，例如 `Map<DataBox, List<Record>>`。
3.  然后，我们逐条读取 `rightPartitions[i]` 中的记录（探测方），计算其连接键，并在哈希表中查找。
4.  如果找到了匹配的 `DataBox`，就将当前探测记录与哈希表中该 `DataBox` 对应的所有记录进行连接，并将结果存入 `joinedRecords`。

以下是完整的代码实现：
```java
private void buildAndProbe(Partition leftPartition, Partition rightPartition) {
        // probe的数据来自左分区
        boolean probeFirst;
        // build用的records
        Iterable<Record> buildRecords;
        // probe用的records
        Iterable<Record> probeRecords;
        // build用的索引列
        int buildColumnIndex;
        // probe用的索引列
        int probeColumnIndex;

        if (leftPartition.getNumPages() <= this.numBuffers - 2) {
            // 左分区较小
            buildRecords = leftPartition;
            buildColumnIndex = getLeftColumnIndex();
            probeRecords = rightPartition;
            probeColumnIndex = getRightColumnIndex();
            probeFirst = false;
        } else if (rightPartition.getNumPages() <= this.numBuffers - 2) {
            buildRecords = rightPartition;
            buildColumnIndex = getRightColumnIndex();
            probeRecords = leftPartition;
            probeColumnIndex = getLeftColumnIndex();
            probeFirst = true;
        } else {
            throw new IllegalArgumentException(
                "Neither the left nor the right records in this partition " +
                "fit in B-2 pages of memory."
            );
        }

        Map<DataBox, List<Record>> hashTable = new HashMap<>();

        // Building stage
        for(Record buildRecord : buildRecords){
            DataBox joinValue = buildRecord.getValue(buildColumnIndex);
            hashTable.putIfAbsent(joinValue, new ArrayList<>());
            hashTable.get(joinValue).add(buildRecord);
        }

        // Probing stage
        for(Record probeRecord: probeRecords){
            DataBox joinValue = probeRecord.getValue(probeColumnIndex);
            if(hashTable.containsKey(joinValue)){
                for(Record buildRecord: hashTable.get(joinValue)){
                    Record joinedRecord;
                    if(probeFirst){
                        joinedRecord = probeRecord.concat(buildRecord);
                    } else {
                        joinedRecord = buildRecord.concat(probeRecord);
                    }
                    this.joinedRecords.add(joinedRecord);
                }
            }
        }

    }
```

### `run` 方法：递归分区的总指挥

`run` 方法是整个 GHJ 算法的“大脑”，它负责协调 `partition` 和 `buildAndProbe`。它的逻辑体现了算法的“Grace”（优雅）之处——递归处理。

1.  **初始化**：为左右关系创建一组空的分区。
2.  **第一轮分区**：调用我们实现的 `partition` 方法，将 `leftRecords` 和 `rightRecords` 分别散列到 `leftPartitions` 和 `rightPartitions` 中。这是 `pass=1` 的过程。
3.  **检查与执行**：遍历每一对分区 `(leftPartitions[i], rightPartitions[i])`：
    *   **理想情况**：如果 `leftPartitions[i]` 或 `rightPartitions[i]` 至少有一个足够小（`≤ B-2` 页），太棒了！直接调用 `buildAndProbe` 来完成这对分区的连接。
    *   **棘手情况**：如果两个分区都还是太大，怎么办？这就是 GHJ 的精髓所在。我们不能直接对它们进行 `buildAndProbe`，而是将这对“太大”的分区 `(leftPartitions[i], rightPartitions[i])` **作为新的输入，递归调用 `run` 方法**，并把 `pass` 加一（`pass+1`）。
    *   **递归的意义**：`pass+1` 会让 `partition` 方法使用一个新的哈希函数，从而有望将这些之前聚集在一起的数据再次切分开，生成更小的下一级子分区。这个过程会一直持续下去，直到所有子分区都小到可以被 `buildAndProbe` 处理，或者达到最大递归深度（本项目中为5）。

以下是代码实现：
```java
    private void run(Iterable<Record> leftRecords, Iterable<Record> rightRecords, int pass) {
        assert pass >= 1;
        if (pass > 5) throw new IllegalStateException("Reached the max number of passes");

        // Create empty partitions
        Partition[] leftPartitions = createPartitions(true);
        Partition[] rightPartitions = createPartitions(false);

        // Partition records into left and right
        this.partition(leftPartitions, leftRecords, true, pass);
        this.partition(rightPartitions, rightRecords, false, pass);

        for (int i = 0; i < leftPartitions.length; i++) {
            if(leftPartitions[i].getNumPages() <= this.numBuffers - 2|| rightPartitions[i].getNumPages() <= this.numBuffers - 2) {
                buildAndProbe(leftPartitions[i], rightPartitions[i]);
            }
            else{
                run(leftPartitions[i], rightPartitions[i], pass+1);
            }
        }
    }
```

### 构造测试：如何让 Join “失败”？

最后，我们需要构造特定的输入数据来“打破” SHJ 和 GHJ，以证明我们理解了它们的工作极限。

#### 让 Simple Hash Join (SHJ) 失败

**失败原理**：SHJ 只有一轮分区（或者说，它根本没有磁盘上的分区阶段，而是直接在内存里 build）。如果输入的数据经过哈希后，大量记录集中在某一个（或几个）分区，导致该分区所需内存超过 `B-2`，SHJ 就会失败。

**构造方法**：我们只需要创建足够多的记录，并给它们**相同**的连接键值（例如 `0`）。这样，在 `SHJOperator` 内部，所有这些记录都会被哈希到同一个地方。只要记录数量足够多，使得这个隐形的“分区”大小超过 `B-2` 页，SHJ 就会因为无法在内存中为其建立哈希表而失败。

例如，创建 `50` 条 join key 都为 `0` 的记录，足以让一个分区的大小超过默认的缓冲区限制。

```java
public static Pair<List<Record>, List<Record>> getBreakSHJInputs() {
        ArrayList<Record> leftRecords = new ArrayList<>();
        ArrayList<Record> rightRecords = new ArrayList<>();

        for (int i = 0; i < 50; i++) {
            leftRecords.add(createRecord(0)); // 使用相同的join key确保hash到同一分区
        }
        return new Pair<>(leftRecords, rightRecords);
    }
```

#### 让 Grace Hash Join (GHJ) 失败

**失败原理**：GHJ 的强大之处在于递归分区。但如果有一种数据，无论我们用多少种不同的哈希函数（改变 `pass` 值），他们都顽固地聚集在一起，无法被切分，那么 GHJ 最终也会“放弃”。

**构造方法**：最极端的情况就是所有记录的连接键**完全相同**。例如，我们创建 `200` 条左记录和 `200` 条右记录，它们的连接键全部是 `0`。
*   **Pass 1**: 所有记录都被哈希到同一个分区（比如分区 `0`）。这个分区显然大于 `B-2` 页。
*   **Pass 2**: `run` 方法被递归调用，`pass` 变为 `2`。`partition` 方法使用新的哈希函数 `HashFunc.hashDataBox(key, 2)`。但因为所有记录的 `key` 都是 `0`，它们很可能再次被哈希到同一个子分区。
*   **... Pass 5**: 这个过程不断重复。由于数据无法被有效拆分，分区大小始终没有减小。最终，`run` 方法的递归深度达到 `5`，触发 `IllegalStateException`，GHJ 宣告失败。

```java
public static Pair<List<Record>, List<Record>> getBreakGHJInputs() {
        ArrayList<Record> leftRecords = new ArrayList<>();
        ArrayList<Record> rightRecords = new ArrayList<>();
        
        for (int i = 0; i < 200; i++) {
            leftRecords.add(createRecord(0)); 
        }
        
        for (int i = 0; i < 200; i++) {
            rightRecords.add(createRecord(0)); 
        }
        
        return new Pair<>(leftRecords, rightRecords);
    }
```


---

## Task 3: External Sort

第三个任务是实现一个经典的**外部排序 (External Sort)** 算法。当我们要排序的数据量远超内存大小时，就无法像常规排序一样一次性把所有数据读入内存。外部排序正是为了解决这个挑战而设计的，其核心理念是通过“分治”和磁盘的巧妙利用，完成对大型文件的排序。

整个过程可以分为两个主要阶段：

1.  **Pass 0: 排序阶段 (Sorting Pass)**
    *   **目标**: 将庞大的输入文件分割成多个、每个都能在内存中独立排序的小数据块，我们称这些排序好的小块为 **“顺串” (run)**。
    *   **过程**:
        1.  **读取**: 从输入源（一个大表）中，一次性读取 `B` 页（`B` 是可用缓冲区数量）数据到内存中。
        2.  **内存排序**: 对内存中的这 `B` 页数据，使用标准的内存排序算法（如快速排序）进行排序。
        3.  **写回磁盘**: 将排序好的这 `B` 页数据作为一个独立的 “run” 写回到磁盘上。
    *   重复以上步骤，直到输入文件的所有数据都被处理完毕。最终，磁盘上会有一系列内部有序但彼此之间无序的 runs。

2.  **后续 Passes: 合并阶段 (Merging Passes)**
    *   **目标**: 将磁盘上所有已经排好序的 runs 合并成一个单一的、全局有序的 run。
    *   **过程**: 这是一个多路归并的过程。我们每次从磁盘读取 `B-1` 个 runs 的第一页到内存的输入缓冲区中，并预留 `1` 个缓冲区作为输出缓冲区。然后，我们在这 `B-1` 个 runs 中找到全局最小的记录，将其移动到输出缓冲区。当输出缓冲区满了，就将其写回磁盘，形成一个更大的新 run。这个过程会不断重复，每一轮合并都会减少 runs 的数量，直到最后只剩下一个完全排序好的 run。

### 任务分析
>您需要实现 SortOperator 中的 sortRun 、 mergeSortedRuns 、 mergePass 和 sort 方法。

让我们逐一攻克这些方法。

### `sortRun` 方法

`sortRun` 是 Pass 0 的核心。它的职责很简单：接收一个迭代器（代表了一批可以装入内存的记录），将它们完全排序，然后返回一个包含这些有序记录的 run。

**实现思路**:
1.  创建一个空的 `ArrayList` 来存储从迭代器中读取的记录。
2.  遍历迭代器，将所有记录添加到这个 `List` 中。
3.  使用 `List.sort()` 和我们预设的 `comparator` 对列表进行内存排序。
4.  将排序后的列表中的所有记录添加到一个新的 `Run` 对象中并返回。

```java
public Run sortRun(Iterator<Record> records) {
        // TODO(proj3_part1): implement
        Run run = makeRun();
        List<Record> recordList = new ArrayList<>();
        while(records.hasNext()){
            Record record = records.next();
            if (record == null) {
                continue; // Skip null records
            }
            recordList.add(record);

        }
        recordList.sort(comparator);
        run.addAll(recordList);
        return run;

    }
```

### `mergeSortedRuns` 方法

`mergeSortedRuns` 是合并阶段的核心。它接收多个已经排好序的 runs，并将它们合并成一个单一的、完全有序的 run。这正是**多路归并**的经典应用场景。

**设计核心**: 为了高效地在多个 runs 中找到全局最小的记录，**优先队列 (Priority Queue)** 是最理想的数据结构。

**实现思路**:
1.  创建一个优先队列。队列中的每个元素是一个 `Pair<Record, Integer>`，其中 `Record` 是记录本身，`Integer` 是该记录所属的 run 在输入列表中的索引 `runIndex`。这个 `runIndex` 至关重要，因为它告诉我们，当一个 record 被取出后，我们应该从哪个 run 中补充下一条记录。
2.  为输入的每一个 run 创建一个迭代器。从每个 run 的迭代器中取出第一条记录，连同它的 `runIndex` 一起，作为一个 `Pair` 放入优先队列。
3.  循环执行以下操作，直到优先队列为空：
    a. 从优先队列中 `poll()` 出最小的元素（即全局最小的记录）。
    b. 将这条记录添加到我们的结果 `Run` 中。
    c. 根据取出的 `Pair` 中的 `runIndex`，找到对应的 run 迭代器。
    d. 如果该迭代器中还有下一条记录，就将其取出，与 `runIndex` 再次配对，`add()` 回优先队列中。

**场景举例**:
假设我们有3个 runs 需要合并，它们的内容分别是：
*   `run 0`: `[3, 8, 15]`
*   `run 1`: `[2, 6, 10]`
*   `run 2`: `[1, 9, 12]`

1.  **初始化**: 我们从每个 run 中取出第一个元素放入优先队列。队列当前状态（按记录值排序）：`[(1, run_idx=2), (2, run_idx=1), (3, run_idx=0)]`。
2.  **第一次迭代**:
    *   取出 `(1, 2)`。将 `1` 添加到结果中。
    *   从 `run 2` 的迭代器中取出下一个元素 `9`，将其与索引 `2` 配对后放入队列。
    *   队列状态：`[(2, 1), (3, 0), (9, 2)]`。
3.  **第二次迭代**:
    *   取出 `(2, 1)`。将 `2` 添加到结果中。
    *   从 `run 1` 的迭代器中取出下一个元素 `6`，放入队列。
    *   队列状态：`[(3, 0), (6, 1), (9, 2)]`。
4.  这个过程循环往复，直到所有 runs 的所有记录都被处理完毕，最终得到一个完全有序的 run `[1, 2, 3, 6, 8, 9, 10, 12, 15]`。

以下是代码实现：
```java
// ... inside mergeSortedRuns ...
        Run result = makeRun();

        PriorityQueue<Pair<Record,Integer>> pq = new PriorityQueue<>(runs.size(), new RecordPairComparator());

        List<BacktrackingIterator<Record>> iterators = new ArrayList<>();
        for(int i = 0; i < runs.size(); i++) {
            BacktrackingIterator<Record> it = runs.get(i).iterator();
            iterators.add(it);
            
            if (it.hasNext()) {
                Record record = it.next();
                pq.add(new Pair<>(record, i));
            }
        }

        while(!pq.isEmpty()){
            Pair<Record, Integer> pair = pq.poll();
            Record record = pair.getFirst();    
            int runIndex = pair.getSecond();    
            
            result.add(record);

            BacktrackingIterator<Record> iterator = iterators.get(runIndex);
            if (iterator.hasNext()) {
                Record nextRecord = iterator.next();
                pq.add(new Pair<>(nextRecord, runIndex));
            }
        }
        return result;
```

### `mergePass` 方法

`mergePass` 方法负责执行一整轮的合并。它接收一个包含 `N` 个 runs 的列表，并按照每次最多合并 `B-1` 个 run 的规则，将它们合并成更少、更大的新 runs。

**实现思路**:
这是一个简单的分批处理过程。
1.  创建一个空列表 `result` 用于存放这一轮合并后生成的新 runs。
2.  以 `B-1` 为步长，遍历输入的 `runs` 列表。
3.  在每次循环中，取出一批（`batch`） runs，数量最多为 `B-1`。
4.  调用我们刚刚实现的 `mergeSortedRuns` 方法，将这一批 `batch` 合并成一个单一的、更大的 run。
5.  将合并后的 `mergedRun` 添加到 `result` 列表中。
6.  循环结束后，返回 `result` 列表。

**场景举例**:
假设我们有 `B=4` 个缓冲区，并且当前有 `8` 个 runs `[r1, r2, ..., r8]`。
1.  `mergePass` 会先取前 `B-1 = 3` 个 runs `[r1, r2, r3]`，调用 `mergeSortedRuns` 将它们合并成 `R1`。
2.  接着，取 `[r4, r5, r6]`，合并成 `R2`。
3.  最后，取 `[r7, r8]`，合并成 `R3`。
4.  这一轮 `mergePass` 结束后，返回一个新的列表 `[R1, R2, R3]`。原来的 `8` 个 runs 变成了 `3` 个更大的 runs。

```java
    public List<Run> mergePass(List<Run> runs) {
        // TODO(proj3_part1): implement
        List<Run> result = new ArrayList<>();
        for(int i = 0; i < runs.size(); i += this.numBuffers - 1) {
            List<Run> batch = runs.subList(i, Math.min(i + this.numBuffers - 1, runs.size()));
            Run mergedRun = mergeSortedRuns(batch);
            result.add(mergedRun);
        }
        return result;
    }
```

### `sort` 方法：串联所有逻辑者

`sort` 方法是外部排序算法的入口和总指挥。它负责从头到尾完成整个排序过程：从最初的 Pass 0 生成 runs，到后续不断地执行合并 passes，直到最终只剩下一个 run。

**实现步骤**:
1.  **Pass 0: 创建初始 runs**
    *   从源操作符获取记录的迭代器 `sourceIterator`。
    *   循环调用 `getBlockIterator`，每次从 `sourceIterator` 中读取 `B` 页数据块。
    *   对每个数据块，调用 `sortRun` 方法进行内存排序，生成一个有序的 run。
    *   将所有生成的 runs 添加到一个列表中。
2.  **后续 Passes: 循环合并**
    *   使用一个 `while` 循环，条件是 `runs.size() > 1`。
    *   在循环体内，调用 `mergePass` 方法，对当前的 `runs` 列表执行一轮合并，并将返回的新列表赋值回 `runs` 变量。
    *   这个循环会一直进行，每一轮都会减少 runs 的数量（大约减少为原来的 `1 / (B-1)`），直到列表中只剩下一个 run。
3.  **返回结果**: 当循环结束时，列表中唯一的那个 run 就是全局排序的结果，将其返回。

```java
     public Run sort() {
        Iterator<Record> sourceIterator = getSource().iterator();

        //PASS 0 
        List<Run> runs = new ArrayList<>();
        while(sourceIterator.hasNext()){
            BacktrackingIterator<Record> blockIterator = getBlockIterator(sourceIterator, getSchema(), this.numBuffers);
            Run sortedRun = sortRun(blockIterator);
            runs.add(sortedRun);
        }

        // 后续轮次 
        while(runs.size() > 1){
            runs = mergePass(runs);  //更新排序过后的自己
        }

        return runs.get(0);
    }
```

至此，我们就完成了整个外部排序的实现。

---

## Task 4: Sort Merge Join
>任务要求：现在你已经有了可工作的外部排序，你可以实现排序合并连接（SMJ）。为了简化，你的 SMJ 实现在任何情况下都不应使用讲座中讨论的优化（排序的最终合并过程与连接同时发生）。因此，在 SMJ 的排序阶段，你应该使用 SortOperator 进行排序。你需要在 SortMergeOperator 的 SortMergeIterator 内部类中实现 fetchNextRecord() 。

这个 `fetchNextRecord` 的核心是使用“双指针”思想，同时遍历两个已排序的记录列表（`leftIterator` 和 `rightIterator`），高效地找出所有匹配的记录对。由于连接键可能存在重复（例如，多个员工属于同一个部门），我们需要一个巧妙的机制来处理“多对多”的匹配关系，这就是 `mark` 和 `reset` 发挥作用的地方。

让我们用具体的记录和场景来分析 `fetchNextRecord` 的三种主要情况：

假设左表（员工）和右表（部门）已经按 `department_id` 排序：
-   `leftIterator` 指向的员工记录: `[ (emp1, dept_id=10), (emp2, dept_id=20), (emp3, dept_id=20), (emp4, dept_id=30) ]`
-   `rightIterator` 指向的部门记录: `[ (deptA, id=10), (deptB, id=20), (deptC, id=20), (deptD, id=40) ]`

当前 `leftRecord` 是 `(emp1, 10)`，`rightRecord` 是 `(deptA, 10)`。

### Case 1: `leftRecord` == `rightRecord` (键值匹配)

这是最复杂的情况，因为可能存在一对多或多对多的匹配。

- **首次匹配**: `(emp2, 20)` 与 `(deptB, 20)` 匹配。
    1.  **标记右指针**: 我们找到了一个匹配，但右边可能还有其他 `id=20` 的部门（比如 `deptC`）。为了让 `emp2` 也能和它们匹配，我们必须在 `(deptB, 20)` 的位置做一个标记 (`rightIterator.markPrev()`)。这个标记就像一个书签，记录了匹配的起始点。
    2.  **生成结果**: 返回 `(emp2, deptB)`。
    3.  **推进右指针**: `rightIterator` 前进，`rightRecord` 变为 `(deptC, 20)`。
- **后续匹配 (同一左记录)**: `(emp2, 20)` 再次与 `(deptC, 20)` 匹配。
    1.  **生成结果**: 返回 `(emp2, deptC)`。
    2.  **推进右指针**: `rightIterator` 前进，`rightRecord` 变为 `(deptD, 40)`。此时，`compare` 结果将变为 `< 0`，进入 Case 2。
- **后续匹配 (新左记录)**: 当 `leftIterator` 推进到 `(emp3, 20)` 时，它也需要与所有 `id=20` 的部门匹配。
    1.  **重置右指针**: `rightIterator` 通过 `reset()` 回到之前标记的 `(deptB, 20)` 位置。
    2.  **为什么要重置?** 如果不重置，`rightIterator` 将从 `(deptD, 40)` 开始，直接错过了 `(deptB, 20)` 和 `(deptC, 20)`，导致 `(emp3, deptB)` 和 `(emp3, deptC)` 这两条匹配记录 **被完全遗漏**。`reset` 操作确保了每一个匹配的左记录都能与所有匹配的右记录进行连接。

### Case 2: `leftRecord` < `rightRecord` (左指针落后)

- **场景**: `leftRecord` 是 `(emp1, 10)`，`rightRecord` 是 `(deptB, 20)`。
- **逻辑**: 由于列表已排序，`emp1` 不可能与 `deptB` 或之后的任何部门匹配。因此，我们只需安全地推进左指针。
- **操作**: `leftIterator.next()`，`leftRecord` 变为 `(emp2, 20)`。

### Case 3: `leftRecord` > `rightRecord` (右指针落后)

- **场景**: `leftRecord` 是 `(emp4, 30)`，`rightRecord` 是 `(deptC, 20)`。
- **逻辑**: `deptC` 不可能与 `emp4` 或之后的任何员工匹配。因此，我们只需推进右指针。
- **操作**: `rightIterator.next()`，`rightRecord` 变为 `(deptD, 40)`。

通过这三种情况的循环处理，`fetchNextRecord` 可以正确、高效地生成所有连接结果，而不会遗漏任何多对多的匹配。

```java
private Record fetchNextRecord() {
            if (leftRecord == null || rightRecord == null) {
                return null;
            }

            while (true) {
                int cmp = compare(leftRecord, rightRecord);
                
                if (cmp == 0) {
                    // 键值匹配：生成连接结果
                    if (!marked) {
                        // 首次匹配时标记右表位置，用于后续回溯
                        rightIterator.markPrev();
                        marked = true;
                    }
                    
                    Record result = leftRecord.concat(rightRecord);
                    
                    // 右表前进，继续寻找更多匹配
                    if (rightIterator.hasNext()) {
                        rightRecord = rightIterator.next();
                    } else {
                       
                        if (leftIterator.hasNext()) {
                            leftRecord = leftIterator.next();
                            rightIterator.reset();
                            rightRecord = rightIterator.hasNext() ? rightIterator.next() : null;
                        } else {
                            leftRecord = null;
                        }
                    }
                    
                    return result;
                    
                } else if (cmp < 0) {
                    // 左值 < 右值：左表前进
                    if (leftIterator.hasNext()) {
                        leftRecord = leftIterator.next();
                        if (marked) {

                            rightIterator.reset();
                            rightRecord = rightIterator.hasNext() ? rightIterator.next() : null;
                            marked = false;
                        }
                    } else {
                        return null;
                    }
                    
                } else {
                    // 左值 > 右值：右表前进
                    if (rightIterator.hasNext()) {
                        rightRecord = rightIterator.next();
                    } else {
                        return null;
                    }
                    marked = false; 
                }
            }
        }
```

---

# Task 5: Single Table Access Selection
任务要求：
>回想一下，搜索算法的第一部分涉及为每个表单独找到具有最低估计成本的计划（第 i 轮涉及为 i 个表集找到最佳计划，因此第 1 轮涉及为 1 个表集找到最佳计划）。这项功能应该实现在 QueryPlan#minCostSingleAccess 辅助方法中，该方法接收一个表并返回扫描该表的最佳 QueryOperator 方法。在我们的数据库中，我们只考虑两种类型的表扫描：顺序全表扫描（ SequentialScanOperator ）和索引扫描（ IndexScanOperator ），后者需要索引和在列上的过滤谓词。

>你应该首先计算顺序扫描的估计 I/O 成本，因为这是始终可行的（它是默认选项：我们只有在索引扫描既可行又更高效时才会选择偏离它）。
>然后，如果表中的任何列上存在我们具有选择谓词的索引，你应该计算在该列上执行索引扫描的估计 I/O 成本。如果其中任何一种比顺序扫描更高效，就选择最优的一种。

也就是说我们要实现`minCostSingleAccess`这个方法，在实现过程中我们应该考虑顺序权标扫描和索引扫描两种方法，简而言之，就是判断使用索引的情况iocost是否低于顺序扫描的cost,如果低于就使用索引扫描，否则就使用顺序扫描。
然后我们就仿照任务要求中的提示，首先计算顺序的扫描的io成本。然后比较用索引会不会更快，如果更快就换掉，然后返回对应的更优的`QueryOperator`。

以下是实现
```java
  public QueryOperator minCostSingleAccess(String table) {
        QueryOperator minOp = new SequentialScanOperator(this.transaction, table);
        int minCost = minOp.estimateIOCost();
        int chosenIndex = -1; //初始化索引
        List<Integer> eligibleIndices = this.getEligibleIndexColumns(table);
        for(int index: eligibleIndices){
            SelectPredicate p = this.selectPredicates.get(index);
            QueryOperator indexOp = new IndexScanOperator(
                    this.transaction, table, p.column, p.operator, p.value
            );
            int indexCost = indexOp.estimateIOCost();
            if(indexCost < minCost){
                minOp = indexOp;
                minCost = indexCost;
                chosenIndex = index;
            }

        }

        minOp = this.addEligibleSelections(minOp, chosenIndex);
        return minOp;
    }
```

这个selectPredicaes是一个List，存储了所有的选择谓词，getEligibleIndexColumns方法返回一个List，存储了所有可以使用索引的列。然后我们遍历所有的索引列，计算索引扫描的成本，如果成本低于顺序扫描的成本，就选择索引扫描。

---

# Task 6:Join Selection (Pass i > 1)
任务要求：
>回想一下，对于 i > 1，动态规划算法的第 i 趟会接收所有可能的 i - 1 个表组合的优化计划（除了涉及笛卡尔积的组合），并返回所有可能的 i 个表组合的优化计划（同样排除涉及笛卡尔积的组合）。我们将两趟之间的状态表示为一个从字符串集合（表名）到对应最优 QueryOperator 的映射。你需要实现搜索算法第 i 趟（i > 1）的逻辑，在 QueryPlan#minCostJoins 辅助方法中。
>该方法应该，给定一个从 i - 1 个表组合到这些 i - 1 个表组合的优化计划的映射，返回一个从 i 个表组合到所有 i 个表组合（排除涉及笛卡尔积的组合）的最优左深连接计划的映射。你应该使用用户调用 QueryPlan#join 方法时添加的显式连接条件列表来识别潜在的连接。

注释里写道
>回顾一下，对于 i > 1，动态规划算法的第 i 趟会接收所有可能的 i - 1 个表组合的优化计划（除了涉及笛卡尔积的组合），并返回所有可能的 i 个表组合的优化计划（同样排除涉及笛卡尔积的组合）。我们将两趟之间的状态表示为一个从字符串集合（表名）到对应最优 QueryOperator 的映射。你需要实现搜索算法第 i 趟（i > 1）的逻辑，在 QueryPlan#minCostJoins 辅助方法中。
>该方法应该，给定一个从 i - 1 个表组合到这些 i - 1 个表组合的优化计划的映射，返回一个从 i 个表组合到所有 i 个表组合（排除涉及笛卡尔积的组合）的最优左深连接计划的映射。你应该使用用户调用 QueryPlan#join 方法时添加的显式连接条件列表来识别潜在的连接。

>对于 `prevMap` 中的每个表集合：
> 对于 `this.joinPredicates` 中列出的每个连接谓词：
>    获取谓词的左侧和右侧（表名和列）。
>
>    情况 1：如果当前表集合包含左表但不包含右表，则使用 `pass1Map` 获取一个操作符来访问右表。
>    情况 2：如果当前表集合包含右表但不包含左表，则使用 `pass1Map` 获取一个操作符来访问左表。
>    情况 3：否则，跳过此连接谓词并继续循环。
>
>    使用情况 1 或情况 2 中获取的操作符，使用 `minCostJoinType` 计算新表（通过 `pass1Map` 获取操作符的表）与之前已连接表的组合的最便宜连接。然后，如果需要，更新结果映射。

注意这里是最优左深连接计划的映射，所以我们需要使用左深连接的方式来实现。左深连接意味着，处理好的表在左侧，新的表在右侧进行连接。
有几个步骤来实现
首先遍历i-1种组合，然后遍历所有尚未连接的表，尝试将它们与当前组合进行左深连接。
对于每个连接，找出最优的type。选择最优，然后把他加入到我们左手边已经处理好的表中。

prevMap是一个从i-1个表组合到这些i-1个表组合的优化计划的映射，pass1Map是一个从单个表到其最优查询操作符的映射。
joinPredicates是一个连接谓词的列表，包含了所有可能的连接条件。
我们在这个方法中要做的就是把新的想加入的和旧的已经处理好的进行连接，传入的prevMap不变，我们从pass1Map中获取，然后加入到result中。
以下是实现代码：


```java
public Map<Set<String>, QueryOperator> minCostJoins(
            Map<Set<String>, QueryOperator> prevMap,
            Map<Set<String>, QueryOperator> pass1Map) {
        Map<Set<String>, QueryOperator> result = new HashMap<>();
        for(Set<String> tables : prevMap.keySet()){
            for(JoinPredicate jp : joinPredicates){
                String leftTableName = jp.leftTable;
                String leftColumnName = jp.leftColumn;
                String rightTableName = jp.rightTable;
                String rightColumnName = jp.rightColumn;
                
                Set<String> newTableSet = null;
                QueryOperator joinOp = null;

                if(tables.contains(leftTableName) && !tables.contains(rightTableName)){
                    // Case 1: 现有表集合包含左表，需要加入右表
                    Set<String> rightTableSet = Collections.singleton(rightTableName);
                    QueryOperator operator = pass1Map.get(rightTableSet);
                    if(operator != null) {
                        joinOp = minCostJoinType(prevMap.get(tables),operator,
                                leftColumnName, rightColumnName);
                        newTableSet = new HashSet<>(tables);
                        newTableSet.add(rightTableName);
                    }
                }
                else if(!tables.contains(leftTableName) && tables.contains(rightTableName)){
                    // Case 2: 现有表集合包含右表，需要加入左表
                    Set<String> leftTableSet = Collections.singleton(leftTableName);
                    QueryOperator operator = pass1Map.get(leftTableSet);
                    if(operator != null) {
                        joinOp = minCostJoinType(prevMap.get(tables),operator,
                                rightColumnName, leftColumnName);
                        newTableSet = new HashSet<>(tables);
                        newTableSet.add(leftTableName);
                    }
                }
                else{
                    continue;
                }
                
                // 更新result
                if(joinOp != null) {
                    if(!result.containsKey(newTableSet)){
                        result.put(newTableSet, joinOp);
                    }
                    else{
                        QueryOperator existingOp = result.get(newTableSet);
                        if(joinOp.estimateIOCost() < existingOp.estimateIOCost()){
                            result.put(newTableSet, joinOp);
                        }
                    }
                }
            }
        }
        return result;
    }
```

---

# Task 7: Optimal Plan Selection

任务要求：
>你的最终任务是编写优化器的最外层驱动方法 QueryPlan#execute ，该方法应利用你已经实现的两个辅助方法来找到最佳查询计划。
>你需要添加查询中剩余的分组和投影运算符，这些运算符是查询的一部分，但尚未添加到查询计划中（参见为 QueryPlan 类实现的私有辅助方法）。注意： QueryPlan 中的表保存在变量 tableNames 中。

注释中写道：
Pass 1：对于每个表，找到访问该表的最低成本 QueryOperator。构建一个从每个表名到其最低成本操作符的映射。

Pass i：在每一趟中，使用前一趟的结果，找到与 Pass 1 中每个表的最低成本连接。重复此过程，直到所有表都已连接。

将最终操作符设置为最后一趟的最低成本操作符，添加 group by、project、sort 和 limit 操作符，并返回最终操作符的迭代器。

我们首先来实现pass1的逻辑，为每个表找到最低成本，就是使用之前的那个minCostSingleAccess方法。然后把他放入pass1Map当中。
同时创建一个allPlans,这个也就是之后用来迭代的prevmap我们相当于做了一个初始化
```java
 Map<Set<String>, QueryOperator> pass1Map = new HashMap<>();
        for(String table : this.tableNames){
            QueryOperator lowCostOperator = minCostSingleAccess(table);
            pass1Map.put(Collections.singleton(table), lowCostOperator);
        }
        Map<Set<String>, QueryOperator> allPlans = new HashMap<>(pass1Map);
```

按照pass i的语义，我们每一趟相当于添加了一个表，假设有n个表，我们就需要n-1次组合，才能完整组合起来n张表。
思路就是首先用上一次的allplans当作prevmap，找到里面个数和当前轮次一样的表组合，比如说在pass=1的时候，说明这一轮需要组合出两个表，那么就得找之前的allplans当中长度为1的组合，和他们组合，让长度达到2。
```java
for(int pass = 1; pass < this.tableNames.size(); pass++){
            Map<Set<String>, QueryOperator> prevPassResults = new HashMap<>();
            for(Set<String> tableSet : allPlans.keySet()){
                if(tableSet.size() == pass){
                    prevPassResults.put(tableSet, allPlans.get(tableSet));
                }
            }
            
            if(prevPassResults.isEmpty()){
                break;
            }
```

通过在task6中写好的组合方式，找到当前轮次的最优解,然后加入到总计划，给下一轮组合时用。
```java
 Map<Set<String>, QueryOperator> currentPassResults =
                    minCostJoins(prevPassResults, pass1Map);
                    allPlans.putAll(currentPassResults);
}
```

在组合过后，找到所有包含所有表的组合，并将其作为最终操作符。
然后更新finalOperator，并添加必要的 group by、project、sort 和 limit 操作符。
```java
Set<String> allTables = new HashSet<>(this.tableNames);
        finalOperator = allPlans.get(allTables);
        
        addGroupBy();
        addProject();
        addSort();
        addLimit();
        
        return finalOperator.iterator();
        }
        ```

以上，proj3完结。