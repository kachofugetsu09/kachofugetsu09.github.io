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

# Task1: Blocking Nested Loop join（BNJL）
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
    * 当 `rightPageIterator` 遍历完 `[1, 50]` 中的所有记录后，需要加载右关系的下一页，例如范围是 **`[51, 100]`** 的记录。此时，为了确保左块 `[1, 100]` 中的所有记录都能从头开始与新的右页 `[51, 100]` 进行匹配，`leftBlockIterator` 必须 **重置** 回到左块的起始位置 `1`。
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

# Task2: Hash Joins