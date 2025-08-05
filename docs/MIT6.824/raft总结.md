这两天也顺利补完了 Raft 的相关 lab，在最后打算以个人的视角对 Raft 做一些总结。


## Raft 的目的

Raft 的核心目标是提供**强一致性**。在 CAP 理论中，C 代表一致性（Consistency），A 代表可用性（Availability），P 代表分区容忍性（Partition Tolerance）。Raft 在 CAP 理论中选择了 C 和 P。这意味着，如果超过半数以上的节点宕机，集群将无法达成共识，从而不可用。


## 对于脑裂问题的解决方式

脑裂问题指的是在分布式系统中，由于网络分区（Network Partition）导致出现了多个 Leader 的情况。以下是可能出现脑裂的几个场景，以及 Raft 相应的解决方案。

1.  **多个节点同时进行选举，最终选举出多个 Leader。**
    
    Raft 通过使用**随机选举超时时间**来应对这个问题，这可以有效避免所有节点同时发起选举。此外，Raft 使用 **Term** 作为整个系统的逻辑时钟，确保只有拥有更大 Term 的节点才能成为 Leader。最关键的是，只有获得了集群中**半数以上**节点的票数（包括已宕机的节点）才能成为 Leader，这从根本上杜绝了多个 Leader 同时出现的情况。

2.  **Leader 宕机后，其他节点选举出新的 Leader，但旧的 Leader 重新上线。**
    
    在 Raft 中，每次选举都会推进逻辑时钟 `Term`。当旧的 Leader 重新上线时，它会发现自己的 `Term` 小于当前的 `Term`。根据 Raft 协议，它会立即放弃成为 Leader 的资格，降级为 Follower。

3.  **发生网络分区，系统被分为多个分区，例如分区 A（多数派）和分区 B（少数派）。分区 A 选举出了新的 Leader，而分区 B 中也可能出现一个 Leader。**
    
    Raft 规定，任何提案（Proposal）要进行 `Commit`，都必须得到**半数以上**节点的同意。这意味着在网络分区的情况下，只有多数派分区（分区 A）的 Leader 才能成功 `Commit` 日志。而另一个分区（分区 B）的 Leader 由于无法获得多数派的同意，将无法 `Commit` 任何日志。这样就保证了数据的一致性。如果网络分区导致每个分区都无法达到多数派标准，那么整个集群将停止服务。


## 如何保证数据始终统一且向前推进

在 Raft 中，`Commit` 操作**只能由 Leader 发起**，Follower 不可以独立进行 `Commit`。Leader 会将日志复制到多个 Follower 上，只有当日志被**多数派节点**成功复制后，Leader 才会对该日志进行 `Commit`。

在发起日志复制 RPC 时，Leader 会告知 Follower 当前已提交的日志索引，即 `commitIndex`。每个 Follower 都有一个 `lastApplied` 变量，记录了已提交到状态机的日志索引。Follower 会将 Leader 的 `commitIndex` 与自己的 `lastApplied` 进行比较，如果 Leader 的 `commitIndex` 大于自己的 `lastApplied`，它就会持续将未提交的日志提交到状态机，并更新 `lastApplied`。

日志复制 RPC 中还有两个非常重要的参数：`prevLogIndex` 和 `prevLogTerm`。这两个参数提供了一个关键的保证：如果当前日志条目的 `term` 和 `index` 与 Leader 一致，那么它之前的所有数据也必然一致，从而避免了不必要的全量拷贝。

这可以说是分布式系统惯用的手法，我们通过一个例子来阐述这一机制：

假设 A 是 Leader，B 是 Follower。
* **时刻 1：** A 的日志是 `1a`。B 成功复制，日志也变为 `1a`。
* **时刻 2：** A 的日志更新为 `1a, 2b`。B 收到 RPC 后，首先检查 `prevLogIndex=1` 和 `prevLogTerm=a` 是否与自己日志的最后一条匹配。匹配成功后，B 成功应用日志，其日志变为 `1a, 2b`。
* **时刻 3：** 发生故障，A 宕机。B 成为新的 Leader，其日志为 `1a, 2b`。在此期间，B 成功提交了日志 `3c`，其日志变为 `1a, 2b, 3c`。
* **时刻 4：** A 重新上线，发现自己 `Term` 落后，降为 Follower。此时，B 作为 Leader，发送日志 `4d` 给 A。
* **时刻 5：** A 收到日志 `4d`，`prevLogIndex=3`、`prevLogTerm=c`。A 检查自己的日志，发现最后一条是 `2b`，与 Leader B 发来的 `prevLogIndex` 不匹配。根据 Raft 协议，A 会告诉 B 不匹配。B 会将 `nextIndex` 减 1，再次发送日志。这个过程会持续回退，直到找到匹配的日志条目。

**为什么 `commitIndex` 不能简单地直接更新？**

想象一个场景：
1.  Leader A 提交了索引为 5 的日志条目。
2.  在发送心跳包给 Follower B 时，心跳包中包含了 `leaderCommitIndex = 5`。
3.  但由于网络或其他原因，Follower B 的本地日志只同步到了索引 3。
4.  此时，如果 Follower B 直接将自己的 `commitIndex` 更新为 5，它就会错误地认为自己已经成功提交了索引 5 的日志。
5.  然而，Follower B 的本地日志中根本没有索引 4 和 5 的条目。如果它直接提交，就会导致数据不一致。

因此，Follower B 在应用日志时，必须以本地的日志索引为准，`apply` 只能是 `min(leaderCommitIndex, lastLogIndex)`。


### 如何保证日志单调递增

我认为这是整个 Raft 系统最为精妙的核心部分。

首先，如果一个日志条目被 `Commit`，就意味着它已经被**多数派**节点成功复制，因此这个数据是可靠的。因为要成功 `Commit`，就必须成功提交其前面所有的日志。在每一次 `Commit` 的过程中，Raft 都确保了“复制了这条日志的 Follower，其之前的状态都与 Leader 一致”，从而保证了所有已提交数据都是可靠的。

设想一个可能发生数据回退的场景：
Leader A 已经成功提交了日志 `1a, 2b, 3c, 4d`。结果 A 宕机，B 被选举为新的 Leader，而 B 的数据只有 `1a`。如果 B 成了 Leader，其他 Follower 就会和 B 同步，导致日志回退，最终所有数据都变成了 `1a`。如果这是一个 KV 存储，我们尝试 `get b` 或 `get c` 就会失败，因为这些日志被回退了。

Raft 的解决方法非常巧妙。
1.  **`Commit` 必须由多数派完成。**
2.  **选举也必须由多数派完成。**

假设有 5 个节点（A, B, C, D, E）。第一次 `Commit` 日志 1 时，A、B、C 达成共识。这意味着这 3 个节点拥有正确的数据。第二次选举时，A、B 宕机，C、D、E 达成共识并选举出新 Leader。这个新的多数派集合（C, D, E）中，**一定**包含之前达成 `Commit` 的节点（C）。

这个**“交集理论”**提供了一个关键保证：任何已提交的日志条目，都必然存在于未来的 Leader 选举中，至少会有一个节点拥有它。这样，新 Leader 的日志就永远不可能比已提交的日志更旧。

在选举过程中，Raft 还有一条限制：
候选人的日志必须比其他节点**更新**。更新的定义是：
* `LastLogTerm` 更大。
* 或者 `LastLogTerm` 相同，但 `LastLogIndex` 更大（复制了更多日志）。

这确保了在网络分区选举中，拥有最多、最新、最正确日志的节点（例如上述例子中的 C）总能当选。这样就保证了拥有正确数据的节点总能被保留下来，`commitIndex` 是不可回退的。新 Leader 下次发起共识时，一定是在已有日志基础上继续增加。

将整个 Raft 系统看作一个整体，只要它还在提供服务，就说明当前集群中的 Leader 拥有最多、最全的日志，而下一次操作一定是在这个基础上继续进行的。这有效地避免了数据回退的情况。


## Raft 中的性能优化

### 1. 快速回退机制

Raft 论文中，Leader 通过 `nextIndex--` 的方式来回退到需要复制的正确日志条目。这个方案虽然能保证正确性，但效率低下。例如，如果 Leader 有 1000 条日志，而 Follower 只有 1 条，Leader 可能需要进行 999 次 RPC 请求才能找到正确的同步点，这会严重影响性能。

**MIT 824** 课程中介绍了一个优化的快速回退方案。通过在 `AppendEntries` RPC 的**回复**中携带更多信息，Leader 可以一次性跳回到正确的日志条目。

具体的优化规则如下：
在 RPC 回复中，加入 `xTerm`、`xLen`、`xIndex` 这三个字段。
* `xTerm`：冲突日志条目的 `term`。
* `xIndex`：冲突日志条目的索引。
* `xLen`：Follower 日志的长度。

当 Follower 发现自己的日志与 Leader 不一致时，它会返回这些信息。

**举例说明：**
假设 Leader A 有 1000 条日志，Follower B 只有 1 条。
1.  **第一次 RPC 请求（Leader A -> Follower B）：**
    Leader A 想要发送索引 1000 的日志。`nextIndex` 初始值为 1001。它发送一个 `AppendEntries` RPC，`prevLogIndex` 为 1000。
2.  **Follower B 的处理与优化后的回复：**
    Follower B 检查本地，发现根本没有索引 1000 的日志，其 `lastLogIndex` 只有 1。它不会简单回复 `false`，而是返回额外信息：
    * `success = false`
    * `xTerm = nil`（因为索引 1000 处没有日志，所以没有 `Term` 值）
    * `xIndex = 2`（表示 Follower B 冲突的索引是 2，即它日志的下一个可用索引）
    * `xLen = 1`（表示 Follower B 日志的长度）
3.  **Leader A 的快速回退处理：**
    Leader A 收到回复后，根据 `xIndex` 和 `xLen` 快速调整 `nextIndex`。`xIndex = 2` 告诉 Leader A，Follower B 的日志只到索引 1。Leader A 立即将 Follower B 的 `nextIndex` 更新为 `xIndex`，即 2。
    这样，Leader A 一次性跳过了 998 次回退，直接将下一次要发送的日志索引从 1000 调整到 2。
4.  **第二次 RPC 请求（Leader A -> Follower B）：**
    Leader A 发送新的 `AppendEntries` RPC，`prevLogIndex=1`，`prevLogTerm` 为 Leader A 索引 1 处的 `Term`。`entries` 是从索引 2 到 1000 的所有日志条目。Follower B 检查本地索引 1 的日志，发现 `Term` 匹配，就会接受这些日志并追加到本地，最终与 Leader A 保持一致。

通过略微增加 RPC 回复中的信息量，我们将 RPC 次数从 999 次压缩到了 2 次，大大提高了面对严重落后情况的效率。

### 2. 日志压缩

想象一下，如果一个 KV 存储系统反复执行 `set a=1`、`set a=2`、...、`set a=5`，日志会无限增长。尽管 Raft 会在 `votedFor`、`currentTerm`、`log` 发生变化时进行持久化，以保证机器故障重启后的数据安全，但日志无限增长最终会消耗巨大的存储资源。

Raft 提供了**日志压缩**方案，即**快照（Snapshot）**。
其思路是：当前状态 = 内存中的状态 + 存储的快照状态。

当 Leader 发现某个 Follower 落后太多时，它会发送一个 `InstallSnapshot` RPC 给 Follower，携带快照的内容。例如，在 `a=3` 时生成了快照，那么再传输 `a=1`、`a=2` 的日志条目就没有价值了，因为这些日志对最终状态机的应用结果没有影响。Leader 直接传输 `a=3` 的快照即可。

快照有三个关键字段：
* `lastIncludedIndex`：快照包含的最后一个日志条目的索引。
* `lastIncludedTerm`：快照包含的最后一个日志条目的 `term`。
* `lastIncludedData`：快照包含的、直到 `lastIncludedIndex` 为止的完整状态机状态。

Follower 收到快照后，会用这些状态来更新自己的状态机。在获取逻辑日志索引时，它会通过 `lastIncludedIndex + 内存中的索引数量 + 1` 来获取当前的逻辑索引。

### 如何定义“落后太多”

“落后太多”的定义是：**需要传输给 Follower 的日志索引，小于 Leader 上次生成快照的 `lastIncludedIndex`。**

举个例子：
Leader A 有数据：`a=1, b=2, c=3, a=2, a=3, a=4, a=5, b=7`。
在 `a=2` 时生成了快照。快照内容为 `b=2, c=3, a=2`，`lastIncludedIndex = 4`。内存中的内容是 `a=3, a=4, a=5, b=7`。
此时，如果有一个新的 Follower 加入，Leader A 的 `nextIndex` 会被初始化为 1。Leader A 发现要发送的日志索引（1）小于上次生成快照的 `lastIncludedIndex`（4），就会判定这个 Follower 落后太多。

这时，Leader A 会直接发送快照 `b=2, c=3, a=2` 给 Follower。之后，它再将快照之后的日志 (`a=3, a=4, a=5, b=7`) 传输给 Follower。这样就提供了一个从 0 开始快速同步的方式。

以上就是我对Raft的总结。个人感觉是，从宏观上来看，作为一个分布式算法，他确实提供了简洁性和可靠性，是非常伟大的发明。