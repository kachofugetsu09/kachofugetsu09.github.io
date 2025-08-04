# Lab 3B: 日志复制 (Log Replication)

我们先来看一遍需求：

> 请实现领导者和跟随者代码，以追加新的日志条目，从而通过 `go test -run 3B` 测试。运行 `git pull` 以获取最新的实验软件。
>
> 您的第一个目标应该是通过 `TestBasicAgree3B()`。首先实现 `Start()`，然后按照图 2 的指示，编写通过 `AppendEntries` RPC 发送和接收新日志条目的代码。您需要实现选举限制（论文第 5.4.1 节）。
>
> 在早期的 Lab 3B 测试中，即使领导者存活也反复进行选举，这可能导致无法达成一致。请检查选举计时器管理中的错误，或者在赢得选举后未立即发送心跳的问题。
>
> 您的代码中可能存在反复检查某些事件的循环。不要让这些循环无休止地执行而不暂停，因为那会减慢您的实现速度，导致测试失败。请使用 Go 的条件变量，或者在每个循环迭代中插入 `time.Sleep(10 * time.Millisecond)`。
>
> 为了您未来的实验，请编写（或重写）干净清晰的代码。您可以重新访问我们的结构、锁定和指南页面来获取灵感。

---

## `AppendEntries` RPC 实现

首先我们去完成 `AppendEntries`。之前我们已经实现了一个简陋版本的 `AppendEntries`，它没有完全实现。我们看看论文中描述的规则：

1.  **Reply `false` if `term < currentTerm`**
2.  **Reply `false` if log doesn't contain an entry at `prevLogIndex` whose term matches `prevLogTerm`**
3.  **If an existing entry conflicts with a new one (same index but different term), delete the existing entry and all that follow it**
4.  **Append any new entries not already in the log**
5.  **If `leaderCommit > commitIndex`, set `commitIndex = min(leaderCommit, index of last new entry)`**

这就是主要步骤。我们一块一块来实现。

### 1. 检查任期 (Term Check)

这是第一层最基础的判断。如果 Leader 的任期小于 Follower 的当前任期，则拒绝请求。

```go
if args.Term < rf.currentTerm {
    reply.Term = rf.currentTerm
    reply.Success = false
    return
}

// 如果发现更高的任期，则更新自己的状态
if args.Term > rf.currentTerm {
    DPrintf("[%d] 任期更新: %d->%d", rf.me, rf.currentTerm, args.Term)
    rf.currentTerm = args.Term
    rf.state = Follower
    rf.votedFor = -1
}

// 收到合法 Leader 的心跳/日志，重置选举计时器
rf.lastHeartbeat = time.Now()
if rf.electionTimer != nil {
    rf.electionTimer.Reset(rf.getRandomElectionTimeout())
}

rf.state = Follower
reply.Term = rf.currentTerm
```

### 2. 检查日志一致性 (Log Consistency Check)

如果当前节点的日志在 `prevLogIndex` 位置没有条目，或者条目的任期与 `prevLogTerm` 不匹配，那么就回复 `false`。

```go
if args.PrevLogIndex >= len(rf.log) {
    reply.Success = false
    return
}

if args.PrevLogTerm != rf.log[args.PrevLogIndex].Term {
    reply.Success = false
    return
}
```

**关键点补充：** 在这两种失败情况下，为了实现**快速回退优化**，Follower 必须在 `AppendEntriesReply` 中提供额外的冲突信息（`XTerm`、`XIndex`、`XLen`）。这些信息将帮助 Leader 更高效地调整 `nextIndex`，避免逐条回退。

### 3 & 4. 处理日志截断和追加

首先，找到需要插入新条目的位置 (`insertIndex`)。然后，遍历 Leader 发来的新条目，检查是否与本地日志冲突。

-   如果发现冲突（相同索引但任期不同），则截断本地日志，删除冲突点及其之后的所有条目。
-   截断后，将 Leader 发来的新条目追加到日志末尾。
-   如果本地日志没有冲突，但比 Leader 发来的条目长，也需要截断多余的部分。

**关键点补充：**
当 Follower 发现与 Leader 的日志存在冲突并进行截断时 (`rf.log = rf.log[:conflictIndex]`)，它还需要检查并调整 `lastApplied` 和 `commitIndex`。 如果 `lastApplied` 或 `commitIndex` 指向的索引在截断后变得无效（即它们的值大于或等于 `conflictIndex`），那么它们必须被调整为 `conflictIndex - 1`。这是为了防止 Follower 应用或提交已经被截断的、不再存在的日志条目，从而维护状态机的一致性。

此外，即使 `args.Entries` 为空（即这是一个心跳消息），Follower 也可能需要截断其日志。如果 Follower 的日志长度超过了 `args.PrevLogIndex + 1`，则意味着 Follower 拥有 Leader 不期望的额外日志条目，这些条目也应该被截断。 这样可以确保 Follower 的日志始终是 Leader 日志的前缀，即使没有新的日志需要追加。

```go
if len(args.Entries) > 0 {
    insertIndex := args.PrevLogIndex + 1 

    for i, newEntry := range args.Entries {
        currentIndex := insertIndex + i
        if currentIndex < len(rf.log) {
            if rf.log[currentIndex].Term != newEntry.Term {
                // 发现冲突，截断日志
                rf.log = rf.log[:currentIndex]
                // 追加新日志
                for j := i; j < len(args.Entries); j++ {
                    rf.log = append(rf.log, args.Entries[j])
                }
                break 
            }
        } else {
            // 本地日志较短，直接追加
            for j := i; j < len(args.Entries); j++ {
                rf.log = append(rf.log, args.Entries[j])
            }
            break
        }
    }
}
```

### 5. 更新 `commitIndex`

最后，根据 Leader 的 `commitIndex` 来更新 Follower 自己的 `commitIndex`。

```go
if args.LeaderCommitIndex > rf.commitIndex {
    rf.commitIndex = min(args.LeaderCommitIndex, rf.getLastLogIndex())
}
```

---

## 日志快速回退优化 (Fast Rollback)

上面的实现虽然符合论文的基本要求，但在测试中可能会因为效率问题而失败。
假设我们已经落后了1000条消息，那么Leader 每次都需要发送1000条消息来回退，因为他并不知道Follower要的消息在什么位置，什么位置是同步的。这显然是低效的。

### 为什么需要快速回退？

我们看看 MIT 教授 Robert Morris 是怎么说的:

> 所以，为了能够更快的恢复日志，Raft 论文在 5.3 节结尾处，对一种方法有一些模糊的描述。原文有些晦涩，在这里我会以一种更好的方式尝试解释论文中有关快速恢复的方法。这里的大致思想是，让 Follower 返回足够的信息给 Leader，这样 Leader 可以以任期（Term）为单位来回退，而不用每次只回退一条 Log 条目。所以现在，在恢复 Follower 的 Log 时，如果 Leader 和 Follower 的 Log 不匹配,Leader 只需要对每个不同的任期发送一条 AppendEntries，而不用对每个不同的 Log 条目发送一条 AppendEntries。这只是一种加速策略。

**场景举例：**

1.  **初始状态**：S0, S1, S2 日志完全同步。
    ```
    S0 Log: [0:0], [1:1], [2:1], [3:2], [4:2], [5:3], [6:3]
    S1 Log: [0:0], [1:1], [2:1], [3:2], [4:2], [5:3], [6:3]
    S2 Log: [0:0], [1:1], [2:1], [3:2], [4:2], [5:3], [6:3]
    ```

2.  **网络分区**：S0 (Leader) 无法联系到 S1，但 S0 和 S2 仍然可以通信并追加日志。
    ```
    S0 Log: [0:0], ..., [6:3], [7:4], [8:4], [9:4]
    S1 Log: [0:0], ..., [6:3]
    S2 Log: [0:0], ..., [6:3], [7:4], [8:4], [9:4]
    ```

3.  **新 Leader 产生**：S1 选举超时，和 S3 (另一个节点) 选举出新的 Leader (Term 5)，并同步了部分日志。
    ```
    S1 Log: [0:0], [1:1], [2:1], [3:2], [4:2], [5:5], [6:5], [7:5]
    ```
    注意：S1 在索引 5, 6, 7 处的日志与 S0 完全不同。

4.  **网络恢复**：S0 再次向 S1 发送 `AppendEntries`。
    -   S0 的 `nextIndex[S1]` 是 7，它尝试发送 `PrevLogIndex=6, PrevLogTerm=3`。
    -   S1 在索引 6 处的任期是 5，与 S0 的 `PrevLogTerm=3` 不匹配，拒绝请求。

**如果没有快速回退**，S0 会将 `nextIndex[S1]` 减一，然后重试发送 `PrevLogIndex=5, PrevLogTerm=3`，再次失败... 这个过程会非常缓慢。

**有了快速回退**：
-   S1 拒绝请求，并返回冲突信息：`XTerm=5` (冲突条目的任期), `XIndex=5` (该任期第一条日志的索引)。
-   S0 收到后，发现自己的日志中没有任期为 5 的条目。它直接将 `nextIndex[S1]` 设置为 S1 返回的 `XIndex`，即 5。
-   S0 下一次发送 `AppendEntries` 时，`PrevLogIndex=4, PrevLogTerm=2`，并携带从索引 5 开始的所有日志。
-   S1 收到后，发现 `PrevLogIndex` 和 `PrevLogTerm` 匹配，于是截断自己从索引 5 开始的日志，并追加 S0 的日志，快速完成同步。

### 实现快速回退

我们需要在 `AppendEntriesReply` 结构体中添加三个字段：

```go
// 快速回退优化字段
type AppendEntriesReply struct {
    // ...
    XTerm  int // 冲突条目的任期号 (如果存在)
    XIndex int // 冲突任期的第一个条目索引
    XLen   int // Follower 的日志长度
}
```

### `AppendEntries` 方法详解

下面是带有快速回退逻辑的完整 `AppendEntries` 实现：

```go
func (rf *Raft) AppendEntries(args *AppendEntriesArgs, reply *AppendEntriesReply) {

	rf.mu.Lock()
	defer rf.mu.Unlock()

	//1.Reply false if term < currentTerm
	if args.Term < rf.currentTerm {
		reply.Term = rf.currentTerm
		reply.Success = false
		return
	}

	if args.Term > rf.currentTerm {
		DPrintf("[%d] 任期更新: %d->%d", rf.me, rf.currentTerm, args.Term)
		rf.currentTerm = args.Term
		rf.state = Follower
		rf.votedFor = -1
	}

	rf.lastHeartbeat = time.Now()
	if rf.electionTimer != nil {
		rf.electionTimer.Reset(rf.getRandomElectionTimeout())
	}

	rf.state = Follower
	reply.Term = rf.currentTerm

	//2.reply false if log doesn't contain an entry at prevLogIndex whose term matches prevLogTerm
	// 统一检查所有 PrevLogIndex，包括 0
	if args.PrevLogIndex >= len(rf.log) {
		reply.Success = false
		// 快速回退：日志太短的情况
		reply.XLen = len(rf.log)
		reply.XIndex = -1
		reply.XTerm = -1
		DPrintf("[%d] AppendEntries失败: prevLogIndex %d 越界，当前日志长度 %d, Leader=%d, 设置XLen=%d",
			rf.me, args.PrevLogIndex, len(rf.log), args.LeaderId, reply.XLen)
		return
	}

	if args.PrevLogTerm != rf.log[args.PrevLogIndex].Term {
		reply.Success = false
		// 快速回退：任期不匹配的情况
		conflictTerm := rf.log[args.PrevLogIndex].Term
		reply.XTerm = conflictTerm

		// 找到XTerm任期的第一个条目索引
		reply.XIndex = args.PrevLogIndex
		for reply.XIndex > 0 && rf.log[reply.XIndex-1].Term == conflictTerm {
			reply.XIndex--
		}
		reply.XLen = len(rf.log)

		DPrintf("[%d] AppendEntries失败: prevLogTerm %d 不匹配, 当前日志[%d]任期 %d, Leader=%d, 设置XTerm=%d, XIndex=%d, XLen=%d",
			rf.me, args.PrevLogTerm, args.PrevLogIndex, rf.log[args.PrevLogIndex].Term, args.LeaderId,
			reply.XTerm, reply.XIndex, reply.XLen)
		return
	}

	//3.If an existing entry conflicts with a new one (same index but different term), delete the existing entry and all that follow it
	//4.Append any new entries not already in the log
	if len(args.Entries) > 0 {
		insertIndex := args.PrevLogIndex + 1 // 新条目开始插入的位置

		DPrintf("[%d] 收到来自Leader[%d]的%d个日志条目，插入位置=%d，当前日志长度=%d",
			rf.me, args.LeaderId, len(args.Entries), insertIndex, len(rf.log))

		// 找到第一个冲突的位置
		conflictIndex := -1
		for i, newEntry := range args.Entries {
			currentIndex := insertIndex + i
			if currentIndex < len(rf.log) {
				if rf.log[currentIndex].Term != newEntry.Term {
					conflictIndex = currentIndex
					DPrintf("[%d] 发现冲突在索引 %d: 我的任期=%d, Leader的任期=%d",
						rf.me, currentIndex, rf.log[currentIndex].Term, newEntry.Term)
					break
				}
			} else {
				// 超出当前日志长度，从这里开始追加
				conflictIndex = currentIndex
				break
			}
		}

		// 如果发现冲突或需要扩展日志
		if conflictIndex != -1 {
			// 截断从冲突位置开始的所有日志
			if conflictIndex < len(rf.log) {
				DPrintf("[%d] 截断日志从索引 %d 到 %d", rf.me, conflictIndex, len(rf.log)-1)
				rf.log = rf.log[:conflictIndex]

				// 如果截断的位置影响了已应用的日志，需要调整lastApplied和commitIndex
				if rf.lastApplied >= conflictIndex {
					oldLastApplied := rf.lastApplied
					rf.lastApplied = conflictIndex - 1
					DPrintf("[%d] 由于日志截断，调整lastApplied: %d->%d", rf.me, oldLastApplied, rf.lastApplied)
				}
				if rf.commitIndex >= conflictIndex {
					oldCommitIndex := rf.commitIndex
					rf.commitIndex = conflictIndex - 1
					DPrintf("[%d] 由于日志截断，调整commitIndex: %d->%d", rf.me, oldCommitIndex, rf.commitIndex)
				}
			}

			// 追加从冲突位置开始的所有新条目
			startAppendIdx := conflictIndex - insertIndex
			for i := startAppendIdx; i < len(args.Entries); i++ {
				rf.log = append(rf.log, args.Entries[i])
				DPrintf("[%d] 追加新日志条目: index=%d, term=%d, command=%v",
					rf.me, args.Entries[i].LogIndex, args.Entries[i].Term, args.Entries[i].Command)
			}
		} else {
			// 没有冲突，但仍需检查是否有多余的日志需要截断
			lastNewEntryIndex := insertIndex + len(args.Entries) - 1
			if len(rf.log) > lastNewEntryIndex+1 {
				DPrintf("[%d] 截断多余日志从索引 %d 到 %d", rf.me, lastNewEntryIndex+1, len(rf.log)-1)
				rf.log = rf.log[:lastNewEntryIndex+1]
			}
		}
	} else {
		// 即使没有新条目，也要检查是否需要截断多余的日志
		// 这是心跳消息的情况，确保日志不会超过PrevLogIndex
		if len(rf.log) > args.PrevLogIndex+1 {
			DPrintf("[%d] 心跳消息截断多余日志从索引 %d 到 %d", rf.me, args.PrevLogIndex+1, len(rf.log)-1)
			rf.log = rf.log[:args.PrevLogIndex+1]
		}
	}

	//5. If leaderCommit > commitIndex, set commitIndex = min(leaderCommit, index of last new entry)
	if args.LeaderCommitIndex > rf.commitIndex {
		oldCommitIndex := rf.commitIndex
		rf.commitIndex = min(args.LeaderCommitIndex, rf.getLastLogIndex())
		DPrintf("[%d] Follower 更新 commitIndex: %d->%d (LeaderCommit=%d)",
			rf.me, oldCommitIndex, rf.commitIndex, args.LeaderCommitIndex)
	}

	reply.Success = true
	// 成功时也初始化快速回退字段
	reply.XTerm = -1
	reply.XIndex = -1
	reply.XLen = len(rf.log)

}
```

---

## `Start` 函数实现

`Start` 函数由客户端调用，用于提交一个新的命令。

```go
func (rf *Raft) Start(command interface{}) (int, int, bool) {
	rf.mu.Lock()
	defer rf.mu.Unlock()

	if rf.state != Leader {
		return -1, rf.currentTerm, false
	}

	currentTerm := rf.currentTerm
	newEntry := logEntry{
		Term:    currentTerm,
		Command: command,
	}
	rf.log = append(rf.log, newEntry)

	// 关键点：再次检查身份
	if rf.state != Leader || rf.currentTerm != currentTerm {
		// 身份已变，回滚添加的日志
		rf.log = rf.log[:len(rf.log)-1]
		return -1, rf.currentTerm, false
	}

	// 立即开始将新日志复制到所有 followers
	go rf.replicateLogEntries()

	return rf.getLastLogIndex(), currentTerm, true
}
```

**关键点补充：**
在将新的日志条目追加到 Leader 自己的日志之后，再次检查 Leader 的身份和当前任期是否发生了变化 (`rf.state != Leader || rf.currentTerm != currentTerm`) 是非常关键的。 这是因为在 `Start` 函数执行期间，Leader 可能因为收到更高任期的 RPC 而退位。如果发生了这种情况，那么之前追加的日志条目就不应该被复制，必须立即回滚 (`rf.log = rf.log[:len(rf.log)-1]`)。这个检查确保了只有在当前服务器仍然是 Leader 且任期未变的情况下，新的命令才会被尝试复制和提交。

---

## 日志复制逻辑

### `replicateLogEntries`

这个函数由 Leader 调用，向所有 Follower 并发地发送 `AppendEntries` RPC。

```go
func (rf *Raft) replicateLogEntries() {
	rf.mu.Lock()
	if rf.state != Leader {
		rf.mu.Unlock()
		return
	}
	rf.mu.Unlock()

	for i := range rf.peers {
		if i == rf.me {
			continue
		}
		go rf.sendAppendEntriesToPeer(i)
	}
}
```

### `sendAppendEntriesToPeer`

这个函数在一个 goroutine 中为单个 Follower 服务，持续尝试发送日志直到成功。

```go
func (rf *Raft) sendAppendEntriesToPeer(server int) {
	for {
		rf.mu.Lock()
		if rf.state != Leader {
			rf.mu.Unlock()
			return
		}

		// 准备要发送的日志条目，nextIndex里存储了每个节点的下一个日志索引
		prevLogIndex := rf.nextIndex[server] - 1
		var entries []logEntry

		if rf.nextIndex[server] <= rf.getLastLogIndex() {
			// 有需要复制的日志条目
			startArrayIndex := rf.nextIndex[server] // nextIndex本身就是要发送的第一个条目的逻辑索引，也等于数组索引
			if startArrayIndex < len(rf.log) {
				entries = make([]logEntry, len(rf.log)-startArrayIndex)
				copy(entries, rf.log[startArrayIndex:])
			} else {
				entries = make([]logEntry, 0)
			}
		} else {
			// 没有新的日志条目，发送空的 AppendEntries（心跳）
			entries = make([]logEntry, 0)
		}
		//构建 AppendEntries RPC 的参数
		args := &AppendEntriesArgs{
			Term:              rf.currentTerm,
			LeaderId:          rf.me,
			PrevLogIndex:      prevLogIndex,
			PrevLogTerm:       rf.getLogTerm(prevLogIndex),
			Entries:           entries,
			LeaderCommitIndex: rf.commitIndex,
		}
		currentTerm := rf.currentTerm
		rf.mu.Unlock()

		reply := &AppendEntriesReply{}
		if rf.peers[server].Call("Raft.AppendEntries", args, reply) {
			rf.mu.Lock()
			// 检查任期和Leader状态
			if rf.state != Leader || rf.currentTerm != currentTerm {
				rf.mu.Unlock()
				return
			}

			if reply.Success {
				// 成功复制，更新 nextIndex 和 matchIndex
				rf.nextIndex[server] = args.PrevLogIndex + len(args.Entries) + 1
				rf.matchIndex[server] = args.PrevLogIndex + len(args.Entries)
				DPrintf("[%d] 成功复制到节点[%d]: nextIndex=%d, matchIndex=%d",
					rf.me, server, rf.nextIndex[server], rf.matchIndex[server])

				// 检查是否可以提交新的日志条目
				rf.updateCommitIndex()

				rf.mu.Unlock()
				return
			} else {
				// 失败，可能是日志不一致
				if reply.Term > rf.currentTerm {
					// 发现更高任期，立即退位
				
					rf.currentTerm = reply.Term
					rf.state = Follower
					rf.votedFor = -1
					// 立即重置选举定时器
					rf.electionTimer.Reset(rf.getRandomElectionTimeout())
					rf.mu.Unlock()
					return
				} else {
					// 日志不一致，使用快速回退算法
					oldNextIndex := rf.nextIndex[server]
					rf.nextIndex[server] = rf.optimizeNextIndex(server, reply)
				}
			}
			rf.mu.Unlock()
		} else {
			// RPC 调用失败，直接返回
			DPrintf("[%d] 向节点[%d] 发送AppendEntries RPC失败", rf.me, server)
			return
		}
	}
}
```

**关键点补充：**
-   **无限循环**：`sendAppendEntriesToPeer` 在一个无限循环 (`for {}`) 中运行，其目的是持续尝试将日志条目复制到特定的 Follower，直到成功或 Leader 身份发生变化。这种重试机制对于处理网络不稳定、RPC 丢失或 Follower 日志不一致的情况至关重要。
-   **成功处理**：当 RPC 成功返回时 (`reply.Success` 为 true)，Leader 必须精确更新 `nextIndex[server]` 和 `matchIndex[server]`，这对于 Leader 了解每个 Follower 的日志状态至关重要。
-   **RPC 失败**：当 `.Call()` 返回 `false` 时，表示 RPC 调用本身失败（如网络分区）。此时协程应立即返回 (`return`)，依赖 Leader 的心跳机制或下一次 `replicateLogEntries` 调用来重新尝试。

### `updateCommitIndex`

Leader 在成功复制日志后，调用此函数检查是否有新的日志可以被提交。

```go
func (rf *Raft) updateCommitIndex() {
	if rf.state != Leader {
		return
	}

	for N := rf.getLastLogIndex(); N > rf.commitIndex; N-- {
		// 只能提交当前任期的日志
		if rf.log[N].Term == rf.currentTerm {
			count := 1
			for i := range rf.peers {
				if i != rf.me && rf.matchIndex[i] >= N {
					count++
				}
			}
			// 如果大多数节点已复制，则提交
			if count > len(rf.peers)/2 {
				rf.commitIndex = N
				return // 找到第一个可提交的就退出
			}
		}
	}
}
```

**关键点补充：**
Leader 提交日志条目的规则有一个非常重要的限制：**Leader 只能提交它当前任期内的日志条目** (`rf.log[N].Term == rf.currentTerm`)。 即使一个旧的过期的日志条目已经被大多数服务器复制，Leader 也不能直接通过计数来提交它。旧任期的日志条目只能通过提交一个当前任期的日志条目来**间接提交**。这个规则是为了防止日志不一致。

### `optimizeNextIndex`

这是快速回退优化的核心实现。

```go
func (rf *Raft) optimizeNextIndex(server int, reply *AppendEntriesReply) int {
	if reply.XTerm == -1 {
		// 情况 1: Follower 日志太短
		return reply.XLen
	}

	lastIndexOfXTerm := -1
	for i := len(rf.log) - 1; i >= 0; i-- {
		if rf.log[i].Term == reply.XTerm {
			lastIndexOfXTerm = i
			break
		}
	}

	if lastIndexOfXTerm != -1 {
		// 情况 2a: Leader 找到了冲突任期
		return lastIndexOfXTerm + 1
	} else {
		// 情况 2b: Leader 没有找到冲突任期
		return reply.XIndex
	}
}
```

**关键点补充：**
-   **情况 1 (`reply.XTerm == -1`)**：Follower 日志太短。Leader 直接将 `nextIndex` 设置为 Follower 的日志长度 `reply.XLen`。
-   **情况 2 (`reply.XTerm != -1`)**：任期不匹配。
    -   **如果 Leader 找到了 `reply.XTerm`**：将 `nextIndex` 设置为 Leader 日志中该任期**最后一个条目**的下一个索引。这可以一次性跳过整个冲突的任期。
    -   **如果 Leader 没找到 `reply.XTerm`**：说明 Leader 的日志更旧或完全不同。将 `nextIndex` 设置为 Follower 报告的冲突任期的**第一个条目**的索引 `reply.XIndex`。

---

## 应用已提交的日志 (`applier`)

`applier` 是一个后台协程，它持续检查 `commitIndex`，并将已提交但尚未应用的日志条目通过 `applyCh` 发送给状态机。

```go
func (rf *Raft) applier() {
	for !rf.killed() {
		rf.mu.Lock()
		for rf.lastApplied < rf.commitIndex {
			rf.lastApplied++
			applyMsg := raftapi.ApplyMsg{
				CommandValid: true,
				Command:      rf.log[rf.lastApplied].Command,
				CommandIndex: rf.lastApplied,
			}
			
			// 关键点：发送前解锁，发送后加锁
			rf.mu.Unlock()
			rf.applyCh <- applyMsg
			rf.mu.Lock()
		}
		rf.mu.Unlock()
		time.Sleep(10 * time.Millisecond)
	}
}
```

**关键点补充：**
在 `applier` 协程中，当准备通过 `applyCh` 发送 `ApplyMsg` 时，在发送前释放锁 (`rf.mu.Unlock()`)，并在发送后重新获取锁 (`rf.mu.Lock()`) 是非常关键的并发编程实践。 这是因为 `applyCh <- applyMsg` 操作可能会阻塞。如果在发送消息时仍然持有锁，Raft 的互斥锁将被长时间占用，阻塞其他 Goroutine（如 RPC 处理器），可能导致性能问题甚至死锁。

测试一下
```shell
go test -run 3B
```

最后结果
```
  ... Passed --  time  2.0s #peers 3 #RPCs    64 #Ops    0
PASS
ok      6.5840/raft1    42.542s

```