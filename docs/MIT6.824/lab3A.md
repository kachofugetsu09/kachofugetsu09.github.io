## Lab 3A: Raft 领导人选举与心跳

### 实验要求 (官方文档翻译)

> 本实验要求您在 `raft/raft.go` 文件中实现 Raft 共识算法。该文件已提供骨架代码，并包含如何发送和接收 RPC 的示例。您的实现必须支持以下接口，测试器和（最终）您的键/值服务器将使用这些接口。`raft.go` 中的注释提供了更多详细信息。

一个服务通过调用 `Make(peers, me, ...)` 来创建一个 Raft 节点。`peers` 参数是一个 Raft 节点的网络标识符数组（包含当前节点），用于 RPC 通信。`me` 参数是当前节点在 `peers` 数组中的索引。`Start(command)` 方法要求 Raft 开始处理并将命令追加到复制日志中。`Start()` 应立即返回，无需等待日志追加完成。服务期望您的实现通过 `Make()` 函数的 `applyCh` 通道参数为每个新提交的日志条目发送 `ApplyMsg`。
`raft.go` 中包含发送 RPC (`sendRequestVote()`) 和处理传入 RPC (`RequestVote()`) 的示例代码。您的 Raft 节点应使用 `labrpc` Go 包（源文件位于 `src/labrpc`）交换 RPC。测试器可以指示 `labrpc` 延迟 RPC、重新排序或丢弃 RPC，以模拟各种网络故障。虽然您可以临时修改 `labrpc`，但请确保您的 Raft 实现能与原始的 `labrpc` 正常工作，因为我们将使用原始版本进行测试和评分。您的 Raft 实例必须仅通过 RPC 进行交互；例如，不允许它们使用共享 Go 变量或文件进行通信。

后续的实验将基于本实验，因此务必给自己留出足够的时间来编写健壮的代码。

**本部分（3A）的目标是实现 Raft 的领导人选举和心跳机制（不包含日志条目的 `AppendEntries` RPC）。** 目标是选出一个领导人，在没有故障的情况下领导人保持不变，以及当旧领导人发生故障或与旧领导人之间的网络包丢失时，新领导人能够接替。运行 `go test -run 3A` 来测试您的 3A 代码。

您不能直接运行您的 Raft 实现；相反，您应该通过测试器来运行它，即 `go test -run 3A`。

请遵循 Raft 论文的图 2。目前您需要关注 `RequestVote` RPC 的发送和接收、与选举相关的服务器规则以及与领导人选举相关的状态。

## 核心任务

1.  将图 2 中领导人选举所需的状态添加到 `raft.go` 中的 `Raft` 结构体。您还需要定义一个结构体来保存每个日志条目的信息。
2.  填写 `RequestVoteArgs` 和 `RequestVoteReply` 结构体。
3.  修改 `Make()` 函数，创建一个后台协程，当节点在一段时间内没有收到其他节点的任何消息时，定期通过发送 `RequestVote` RPC 来触发领导人选举。这样，节点就能知道谁是领导人（如果已经有领导人），或者自己成为领导人。
4.  实现 `RequestVote()` RPC 处理函数，以便服务器之间可以互相投票。
5.  为了实现心跳机制，定义一个 `AppendEntries` RPC 结构体（您可能暂时不需要所有参数），并让领导人定期发送心跳。编写一个 `AppendEntries` RPC 处理方法，该方法会重置选举超时时间，以确保在领导人已经选出时，其他服务器不会竞选成为领导人。

### 重要提示与建议

-   **选举超时**：请确保不同节点上的选举超时时间不会总是在同一时刻触发，否则所有节点可能只会给自己投票，导致没有领导人被选出。
-   **心跳频率**：测试器要求领导人发送心跳 RPC 的频率不超过每秒十次。
-   **选举时间**：测试器要求您的 Raft 在旧领导人故障后五秒内选举出新领导人（如果大多数节点仍然可以通信）。然而，请记住，在出现分裂投票（split vote）的情况下（可能由于网络包丢失或候选人不幸选择相同的随机回退时间），领导人选举可能需要多轮。您必须选择足够短的选举超时时间（以及相应的心跳间隔），以确保即使需要多轮选举，也非常可能在五秒内完成选举。
-   **论文参考**：论文的第 5.2 节提到选举超时时间范围为 150 到 300 毫秒。这样的范围只有在领导人发送心跳的频率远高于每 150 毫秒一次时才有意义。由于测试器将您的心跳限制为每秒 10 次，您将不得不使用比论文中 150 到 300 毫秒更大的选举超时时间，但又不能太大，否则您可能无法在五秒内选举出领导人。
-   **随机化**：您可能会发现 Go 的 `rand` 包很有用。
-   **定时器**：您需要编写代码来定期执行操作或在延迟后执行操作。最简单的方法是创建一个带有循环的协程，并在循环中调用 `time.Sleep()`。不要使用 Go 的 `time.Timer` 或 `time.Ticker`，它们很难正确使用。
-   **代码健壮性**：如果您的代码难以通过测试，请再次阅读论文的图 2；领导人选举的完整逻辑分布在该图的多个部分。
-   **`GetState()`**：不要忘记实现 `GetState()` 方法。
-   **`Kill()`**：当测试器永久关闭一个 Raft 实例时，会调用您的 Raft 的 `rf.Kill()` 方法。您可以使用 `rf.killed()` 检查 `Kill()` 是否已被调用。您可能希望在所有循环中进行此检查，以避免已死亡的 Raft 实例打印混淆性消息。
-   **调试**：调试代码的DPrintf个好方法是在节点发送或接收消息时插入打印语句，并将输出收集到文件中，例如 `go test -run 3A > out`。然后，通过研究 `out` 文件中的消息跟踪，您可以识别您的实现与预期协议的偏差之处。您可能会发现 `util.go` 中的 `DPrintf` 在调试不同问题时，能够方便地开启和关闭打印功能。
-   **RPC 字段**：Go RPC 只发送名称以大写字母开头的结构体字段。子结构体也必须有大写开头的字段名（例如，数组中日志记录的字段）。`labgob` 包会对此发出警告；请不要忽略这些警告。
-   **竞态条件**：使用 `go test -race` 检查您的代码，并修复所有它报告的竞态条件。

---
# 核心难点与实现要点

这个 Lab 有两个关键难点：**并发控制**和**定时器重置**。除此之外，还有三个在将理论转化为代码时极易出错的实现要点。

## 1. 并发问题与锁策略

在处理 RPC 时，必须在函数开头加锁，在结尾释放锁。这是因为 Raft 节点会并发地接收和处理多个 RPC 请求，若不加锁，多个 goroutine 同时修改 Raft 的状态（如 `currentTerm`, `votedFor`）会导致数据竞争和状态不一致。

> **锁的持有时间**：一个重要的优化点是缩短锁的持有时间。例如，在准备发送 RPC 请求时，我们应该只在读取共享状态、构建参数结构体（Args）的阶段持有锁。一旦参数构建完成，就应立即释放锁，然后再执行耗时的网络调用。这样可以避免阻塞其他需要访问 Raft 状态的 goroutine。

## 2. 定时器重置时机

另一个最大的难点就是精确地确定重置定时器的时机。

-   **选举定时器 (Election Timer) 重置点：**
    1.  收到 Leader 的有效心跳时（表明 Leader 存活，自己应继续作为 Follower）。
    2.  自己投票给某个 Candidate 后（重置计时器，等待选举结果）。
    3.  自己发起一轮新的选举时（转变为 Candidate 状态后，开始等待本轮选举超时）。

-   **心跳定时器 (Heartbeat Timer) 重置点：**
    1.  当一个节点成为 Leader 后，立即初始化并启动心跳定时器。
    2.  每次成功发送一轮心跳后，重置心跳定时器，以维持周期性发送。

## 3. 实现要点：并发中的“状态过时”问题

这是将理论模型转换为并发代码时**最大的陷阱**。

> **黄金原则：** 任何在 RPC 调用返回后或从 channel 中读取数据后要进行的操作，都必须**重新加锁，并再次验证当前状态是否与发起操作时的状态一致**。

*   **问题描述**：当您在一个新的 goroutine 中执行一个任务（比如 `go rf.startElection()`），这个 goroutine 的生命周期可能很长。在它执行网络调用并等待返回的这段时间里，Raft 节点的主状态（`rf.state`, `rf.currentTerm`）**可能已经发生了变化**。
*   **为何致命**：如果你不重新检查状态，一个已经变回 Follower 的节点可能会根据一个“过时”的投票结果，错误地宣布自己成为 Leader，从而破坏协议。

## 4. 实现要点：`rf.killed()` 的普遍性

> **硬性规定：** 所有可能长期运行的循环（`for {...}`）都必须在循环条件中包含对 `rf.killed()` 的检查。

*   **问题描述**：测试器在结束时会调用 `rf.Kill()`，但这只会设置一个标志位。如果您的后台 goroutine（比如 `ticker` 或 `sendHeartbeats` 中的循环）不检查这个标志，它们就会变成“僵尸”，在测试结束后继续运行，严重干扰后续的测试。


---
# 实现步骤详解

## 1. 添加 Raft 状态

根据论文图 2，我们需要将 Raft 节点的状态添加到 `Raft` 结构体中。

首先，定义节点的三种可能状态：Follower, Candidate, Leader。

```go
const (
	Follower PeerState = iota
	Candidate
	Leader
)
```

接下来，我们将论文中描述的状态分为三类，并添加到 `Raft` 结构体中。

### 持久性状态 (Persistent state on all servers)

这些状态在节点重启后必须保持不变，因此需要持久化存储。

| 状态变量      | 中文名称         | 详细描述                                                                     | 初始值       |
| ------------- | ---------------- | ---------------------------------------------------------------------------- | ------------ |
| `currentTerm` | 当前任期号       | 服务器已知的最新任期编号，用于检测过期信息                                   | 0            |
| `votedFor`    | 本任期投票对象   | 在当前任期中投票给的候选人ID，如果没有投给任何人则为空                       | null         |
| `log[]`       | 日志条目数组     | 存储日志条目的数组，每个条目包含状态机命令以及领导者接收该条目时的任期号     | 初始索引为 1 |

在 `Raft` 结构体中添加对应字段：
```go
// Raft struct
    state       PeerState  // 节点状态 (Follower, Candidate, Leader)
	currentTerm int        // 当前任期号
	votedFor    int        // 当前任期内投票给的候选人ID，-1表示没有投票
	log         []logEntry // 日志条目
```

同时，定义日志条目 `logEntry` 的结构。

> **注意：日志索引**
> Raft 论文中的日志索引通常从 1 开始。为了简化实现，我们可以在代码中让 `log` 数组的 `log[0]` 作为哨兵条目（例如 `logEntry{LogIndex: 0, Term: 0, Command: nil}`）。这样，`log` 数组的实际索引 `i` 就对应论文中的 `i` 号日志条目，可以简化边界条件的处理。

```go
type logEntry struct {
	LogIndex int
	Term     int
	Command  interface{}
}
```

### 易失性状态 (Volatile state on all servers)

这些状态在节点重启后会丢失。

| 状态变量      | 中文名称     | 详细描述                                           | 初始值   |
| ------------- | ------------ | -------------------------------------------------- | -------- |
| `commitIndex` | 已提交索引   | 已知已被大多数服务器复制的最高日志条目的索引       | 0，递增  |
| `lastApplied` | 已应用索引   | 已经被应用到状态机的最高日志条目的索引             | 0，递增  |

### Leader 上的易失性状态 (Volatile state on leaders)

这些状态仅在 Leader 节点上维护，选举后需要重新初始化。

| 状态变量       | 中文名称           | 详细说明                                                           | 初始值                     |
| -------------- | ------------------ | ------------------------------------------------------------------ | -------------------------- |
| `nextIndex[]`  | 下一发送索引数组   | 针对每个跟随者，记录下一个要发送给该跟随者的日志条目索引位置       | leader最后日志条目索引+1   |
| `matchIndex[]` | 匹配索引数组       | 针对每个跟随者，记录已知成功复制到该跟随者的最高日志条目索引       | 0，递增                    |

将这两类易失性状态也添加到 `Raft` 结构体中：
```go
// Raft struct
// ... (持久性状态)

// 所有服务器都有的易失性状态
	commitIndex int // 已知已提交的日志条目索引
	lastApplied int // 已知已应用到状态机的日志条目索引

// Leader身份下的易失性状态
	nextIndex  []int // 每个服务器的下一条日志索引
	matchIndex []int // 每个服务器已知的已提交日志条目索引
```

## 2. 定义 RequestVote RPC 结构体

根据论文，我们需要定义 `RequestVote` RPC 的参数 `RequestVoteArgs` 和返回值 `RequestVoteReply`。

### 请求投票 RPC (RequestVote RPC)
-   **调用者**：Candidate (候选人)
-   **作 用**：候选人请求其他服务器投票支持自己成为领导者。

**请求参数 `RequestVoteArgs`**

| 参数名称       | 中文名称             | 详细说明                                                     |
| -------------- | -------------------- | ------------------------------------------------------------ |
| `term`         | 候选人任期号         | 候选人发起选举时的任期号                                     |
| `candidateId`  | 候选人服务器标识     | 请求投票的候选人唯一标识符                                   |
| `lastLogIndex` | 候选人最后日志索引   | 候选人日志中最后一个条目的索引，用于日志新旧程度比较         |
| `lastLogTerm`  | 候选人最后日志任期   | 候选人日志中最后一个条目的任期号，用于日志新旧程度比较       |

> **注意**：在 Go 中，RPC 结构体的字段名必须以大写字母开头才能被正确序列化和传输。

```go
type RequestVoteArgs struct {
	// Your data here (3A, 3B).
	Term         int // 候选人任期号
	CandidateId  int // 候选人ID
	LastLogIndex int // 候选人最后日志条目的索引值
	LastLogTerm  int // 候选人最后日志条目的任期号
}
```

**返回值 `RequestVoteReply`**

| 参数名称      | 中文名称         | 详细说明                                                     |
| ------------- | ---------------- | ------------------------------------------------------------ |
| `term`        | 接收者当前任期号 | 投票者的当前任期，帮助候选人更新自己的任期认知               |
| `voteGranted` | 投票授予结果     | 布尔值，true表示同意投票给该候选人，false表示拒绝            |

```go
type RequestVoteReply struct {
	// Your data here (3A).
	Term        int  // 接收者当前任期
	VoteGranted bool // 投票授予结果
}
```

## 3. 实现选举触发和心跳机制

这一步是 Lab 3A 的核心：实现领导人选举的触发（当 Follower 一段时间未收到 Leader 消息时）和 Leader 周期性的心跳。

### 3.1 在 `Raft` 结构体中添加定时器

首先，在 `Raft` 结构体中添加选举定时器和心跳定时器

```go
// Raft struct
// ...
	electionTimer  *time.Timer // 选举定时器
	heartbeatTimer *time.Timer // 心跳定时器
	lastHeartbeat  time.Time   // 上次收到心跳的时间
```

### 3.2 修改 `Make()` 函数

在 `Make()` 函数中，我们需要初始化 Raft 节点的状态，设置定时器，并启动一个后台 goroutine (`ticker`) 来处理定时器事件。

```go
func Make(peers []*labrpc.ClientEnd, me int,
	persister *tester.Persister, applyCh chan raftapi.ApplyMsg) raftapi.Raft {
	rf := &Raft{}
	rf.peers = peers
	rf.persister = persister
	rf.me = me

	// 初始化 Raft 状态
	rf.state = Follower
	rf.currentTerm = 0
	rf.votedFor = -1
	rf.log = make([]logEntry, 1) // log[0] is a sentinel
	rf.log[0] = logEntry{LogIndex: 0, Term: 0, Command: nil}

	rf.commitIndex = 0
	rf.lastApplied = 0

	rf.nextIndex = make([]int, len(peers))
	rf.matchIndex = make([]int, len(peers))
	for i := range peers {
		rf.nextIndex[i] = 1
		rf.matchIndex[i] = 0
	}

	// 初始化并启动定时器
	rf.lastHeartbeat = time.Now()
	rf.electionTimer = time.NewTimer(rf.getRandomElectionTimeout())
	rf.heartbeatTimer = time.NewTimer(100 * time.Millisecond)

	// 启动后台 ticker goroutine
	go rf.ticker()

	return rf
}
```
> **随机化选举超时**：`getRandomElectionTimeout()` 函数至关重要。通过为每个节点的选举超时设置一个随机值，可以有效避免多个节点在同一时间超时并开始选举，从而减少“分裂投票”（Split Vote）的概率，提高选举成功率。

```go
func (rf *Raft) getRandomElectionTimeout() time.Duration {
	// 论文建议 150-300ms，但由于测试器限制心跳频率，这里使用更大的范围
	return time.Duration(400+rand.Int63n(400)) * time.Millisecond
}
```

### 3.3 实现 `ticker` Goroutine

`ticker` goroutine 使用 `select` 语句等待定时器事件，是 Raft 节点的主循环。

-   `electionTimer` 到期：如果当前节点不是 Leader，则开始新一轮选举。
-   `heartbeatTimer` 到期：如果当前节点是 Leader，则发送心跳。

```go
func (rf *Raft) ticker() {
	// 遵循“硬性规定”：在所有长期运行的循环中检查 rf.killed()
	for rf.killed() == false {
		select {
		case <-rf.electionTimer.C:
			rf.mu.Lock()
			// 如果选举超时，并且自己不是Leader，则开始新选举
			if rf.state != Leader {
				rf.startNewElection()
			}
			rf.electionTimer.Reset(rf.getRandomElectionTimeout())
			rf.mu.Unlock()

		case <-rf.heartbeatTimer.C:
			rf.mu.Lock()
			// 如果心跳时间到，并且自己是Leader，则发送心跳
			if rf.state == Leader {
				rf.sendHeartbeats()
				rf.heartbeatTimer.Reset(time.Duration(100) * time.Millisecond)
			}
			rf.mu.Unlock()
		}
	}
}
```

### 3.4 发起选举 (`startNewElection` 和 `startElection`)

当选举定时器在 `ticker` 中触发后，`startNewElection` 负责准备选举状态，然后 `startElection` 在一个新的 goroutine 中执行实际的选举过程。

**1. 准备选举状态 (`startNewElection`)**

当一个 Follower 决定开始选举时，它需要：
1.  增加自己的任期号 `currentTerm`。
2.  将自己的状态切换为 `Candidate`。
3.  投票给自己。

```go
func (rf *Raft) startNewElection() {
	// 遵循“设计模式”：状态转换逻辑封装在函数中，在持有锁时调用
	oldTerm := rf.currentTerm
	rf.currentTerm++
	rf.state = Candidate
	rf.votedFor = rf.me
	rf.lastHeartbeat = time.Now()

	DPrintf("[%d] 开始选举: %d->%d", rf.me, oldTerm, rf.currentTerm)
	go rf.startElection()
}
```

**2. 执行选举 (`startElection`)**

这个函数在一个单独的 goroutine 中运行，负责向所有其他节点发送 `RequestVote` RPC 并收集结果。

```go
func (rf *Raft) startElection() {
	rf.mu.Lock()
	// 遵循“黄金原则”：在 goroutine 开始时，再次检查状态
	if rf.state != Candidate {
		rf.mu.Unlock()
		return
	}

	// 构建 RPC 参数
	currentTerm := rf.currentTerm
	args := &RequestVoteArgs{
		Term:         currentTerm,
		CandidateId:  rf.me,
		LastLogIndex: rf.getLastLogIndex(),
		LastLogTerm:  rf.getLastLogTerm(),
	}
	rf.mu.Unlock() // *** 关键优化：构建完参数后立即释放锁 ***

	votesReceived := 1 // 先投自己一票
	voteCh := make(chan bool, len(rf.peers)-1)

	// 并发地向其他所有节点发送投票请求
	for i := range rf.peers {
		if i == rf.me {
			continue
		}
		go func(server int) {
			reply := &RequestVoteReply{}
			ok := rf.sendRequestVote(server, args, reply)
			if ok {
				voteCh <- rf.handleRequestVoteReply(server, currentTerm, reply)
			} else {
				DPrintf("[%d] 向节点[%d] 的投票请求失败", rf.me, server)
				voteCh <- false
			}
		}(i)
	}

	// 等待并统计投票结果
	for i := 0; i < len(rf.peers)-1; i++ {
		if <-voteCh {
			votesReceived++
			rf.mu.Lock()
			// 遵循“黄金原则”：收到 channel 数据后，重新检查状态
			if rf.state == Candidate && rf.currentTerm == currentTerm {
				// 如果获得多数票，成为 Leader
				if votesReceived >= len(rf.peers)/2+1 {
					DPrintf("[%d] 获得多数票 (%d票), 成为Leader (任期%d)", rf.me, votesReceived, rf.currentTerm)
					rf.becomeLeader()
					rf.mu.Unlock()
					return // 选举成功，结束 goroutine
				}
			} else {
				// 如果状态或任期已变，说明选举已过时，结束 goroutine
				rf.mu.Unlock()
				return
			}
			rf.mu.Unlock()
		}
	}
}
```

### 3.5 处理投票响应和状态转换

**处理投票响应 (`handleRequestVoteReply`)**

此函数处理从其他节点收到的 `RequestVoteReply`。核心逻辑是检查返回的任期号，如果发现有更高的任期，则当前节点应立即转为 Follower。

```go
func (rf *Raft) handleRequestVoteReply(server int, requestTerm int, reply *RequestVoteReply) bool {
	rf.mu.Lock()
	defer rf.mu.Unlock()

	// 如果对方任期更高，自己退位为 Follower
	if reply.Term > rf.currentTerm {
		DPrintf("[%d] 发现更高的任期 %d > %d, 转为Follower", rf.me, reply.Term, rf.currentTerm)
		rf.becomeFollower(reply.Term)
		return false
	}

	// 遵循“黄金原则”：处理 RPC 回复时，检查当前任期是否已变
	if rf.currentTerm != requestTerm {
		return false
	}

	return reply.VoteGranted
}
```

**转为 Follower (`becomeFollower`)**

当节点发现更高任期或需要退位时，调用此函数。

```go
func (rf *Raft) becomeFollower(term int) {
	// 遵循“设计模式”：将状态转换封装在此函数中，保证原子性
	rf.state = Follower
	rf.currentTerm = term
	rf.votedFor = -1
	rf.lastHeartbeat = time.Now()
	// 重置选举定时器，因为作为 Follower 需要重新开始等待 Leader 的心跳
	rf.electionTimer.Reset(rf.getRandomElectionTimeout())
}
```

**成为 Leader (`becomeLeader`)**

当 Candidate 获得多数票后，调用此函数完成状态转换。

```go
func (rf *Raft) becomeLeader() {
	// 遵循“设计模式”：将状态转换封装在此函数中，保证原子性
	rf.state = Leader
	// 初始化 Leader 的状态
	for i := range rf.peers {
		rf.nextIndex[i] = rf.getLastLogIndex() + 1
		rf.matchIndex[i] = 0
	}
	// 立即发送心跳以宣告领导地位
	rf.sendHeartbeats()
	// 重置心跳定时器
	rf.heartbeatTimer.Reset(time.Duration(100) * time.Millisecond)
}
```

### 3.6 Leader 发送心跳 (`sendHeartbeats`)

成为 Leader 后，节点需要周期性地向所有 Follower 发送 `AppendEntries` RPC 作为心跳，以维持其领导地位。在 Lab 3A 中，这个 RPC 的 `Entries` 字段为空。

> **退位场景**：在 `sendHeartbeats` 的回复处理中，Leader 可能会发现一个任期比自己更高的节点。这通常发生在网络分区后，分区的 Leader（比如 A）重新连接到主网络，但主网络中已经选举出了一个任期更高的 Leader（比如 B）。此时，A 必须承认新的 Leader 并退位成为 Follower。

```go
func (rf *Raft) sendHeartbeats() {
	// 锁应由调用者（ticker）持有
	if rf.state != Leader {
		return
	}

	//DPrintf("Leader[%d] (任期%d) 开始发送心跳", rf.me, rf.currentTerm)

	for i := range rf.peers {
		if i == rf.me {
			continue
		}
		go func(server int) {
			// 这个 for 循环可能是为未来的重试机制预留的
			// 在更复杂的实现中，这里也应检查 rf.killed()
			for {
				rf.mu.Lock()
				if rf.state != Leader {
					rf.mu.Unlock()
					return
				}

				args := &AppendEntriesArgs{
					Term:              rf.currentTerm,
					LeaderId:          rf.me,
					PrevLogIndex:      rf.nextIndex[server] - 1,
					PrevLogTerm:       rf.getLogTerm(rf.nextIndex[server] - 1),
					Entries:           make([]logEntry, 0),
					LeaderCommitIndex: rf.commitIndex,
				}
				rf.mu.Unlock()

				reply := &AppendEntriesReply{}

				if ok := rf.peers[server].Call("Raft.AppendEntries", args, reply); ok {
					rf.mu.Lock()
					if reply.Term > rf.currentTerm {
						DPrintf("[%d] 发现更高任期，退位: %d->%d", rf.me, rf.currentTerm, reply.Term)
						rf.becomeFollower(reply.Term)
					}
					rf.mu.Unlock()
				}
				break // 当前实现只发送一次，不重试
			}
		}(i)
	}
}
```

## 4. 实现 `RequestVote` RPC 处理函数

`RequestVote` 是由 Candidate 调用，由其他所有节点（Follower, Candidate, 甚至其他 Leader）接收和处理的 RPC。

### 接收者实现逻辑

接收者在收到 `RequestVote` 请求后，按以下逻辑决定是否投票：

1.  **任期检查**：
    -   如果请求的 `args.Term < rf.currentTerm`，说明是过时的选举请求，直接拒绝。
    -   如果 `args.Term > rf.currentTerm`，说明自己任期落后，无论是否投票，都应立即更新自己的任期为 `args.Term` 并转为 Follower 状态。

2.  **投票资格检查**：在任期检查通过后，同时满足以下两个条件才投票：
    -   **投票限制**：当前节点在本任期内还未投票（`rf.votedFor == -1`），或者已经投给了当前这个候选人（`rf.votedFor == args.CandidateId`）。
    -   **日志新旧度判断**：候选人的日志必须“至少和自己一样新”。

> **选举限制 (Election Restriction)**
> 日志新旧度判断是 Raft 的核心安全机制之一。它确保了只有拥有最新（或至少一样新）日志的候选人才能当选 Leader，从而防止任何已提交的日志条目被覆盖或丢失。
>
> 判断规则为：
> -   候选人的最后一条日志的任期号 > 接收者的最后一条日志的任期号，**或者**
> -   任期号相等，但候选人的最后一条日志的索引 ≥ 接收者的最后一条日志的索引。

```go
func (rf *Raft) RequestVote(args *RequestVoteArgs, reply *RequestVoteReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()

	if args.Term > rf.currentTerm {
		DPrintf("[%d] 任期更新: %d->%d", rf.me, rf.currentTerm, args.Term)
		rf.becomeFollower(args.Term)
	}

	rf.lastHeartbeat = time.Now()

	canVote := rf.votedFor == -1 || rf.votedFor == args.CandidateId
	lastLogIndex := rf.getLastLogIndex()
	lastLogTerm := rf.getLogTerm(lastLogIndex)

	logIsUpToDate := (args.LastLogTerm > lastLogTerm) ||
		(args.LastLogTerm == lastLogTerm && args.LastLogIndex >= lastLogIndex)

	if args.Term >= rf.currentTerm && canVote && logIsUpToDate {
		rf.votedFor = args.CandidateId
		reply.Term = rf.currentTerm
		reply.VoteGranted = true
		DPrintf("[%d] 投票给[%d]", rf.me, args.CandidateId)
	} else {
		reply.Term = rf.currentTerm
		reply.VoteGranted = false
		DPrintf("节点[%d] (任期%d) 拒绝投票给节点[%d]: 已投票给%d 或日志不够新",
			rf.me, rf.currentTerm, args.CandidateId, rf.votedFor)
	}
}
```

## 5. 实现 `AppendEntries` RPC (心跳)

最后，我们定义 `AppendEntries` RPC 的结构体和处理函数。在 Lab 3A 中，它主要用作心跳。

### `AppendEntries` 结构体

```go
type AppendEntriesArgs struct {
	Term              int        // Leader的term
	LeaderId          int        // Leader的ID
	PrevLogIndex      int        // 前一个日志条目的索引
	PrevLogTerm       int        // 前一个日志条目的任期号
	Entries           []logEntry // log entries to store (empty for heartbeat)
	LeaderCommitIndex int        // Leader已知的已提交日志条目索引

}

type AppendEntriesReply struct {
	Term    int  // 接收者当前任期
	Success bool // 是否成功接收日志条目
}
```

### `AppendEntries` 处理函数

这个函数在接收到 Leader 的心跳时被调用。

> **核心逻辑**：
> 1.  **任期检查**：如果 Leader 的任期 `args.Term` 小于自己的当前任期 `rf.currentTerm`，则拒绝该心跳。
> 2.  **承认 Leader**：只要 `args.Term >= rf.currentTerm`，就说明存在一个合法的 Leader。当前节点（无论是 Follower、Candidate 还是旧 Leader）就应承认其地位，转为 Follower 状态，并更新自己的任期（如果 `args.Term` 更高）。
> 3.  **重置选举定时器**：这是心跳机制的根本目的。收到有效心跳后，立即重置选举定时器，以防止自己因超时而发起不必要的选举。

```go
func (rf *Raft) AppendEntries(args *AppendEntriesArgs, reply *AppendEntriesReply) {
	rf.mu.Lock()
	defer rf.mu.Unlock()

	// 1. 如果 Leader 任期小于当前任期，是过时的 RPC，拒绝
	if args.Term < rf.currentTerm {
		reply.Term = rf.currentTerm
		reply.Success = false
		return
	}

	// 2. 如果 Leader 任期更高，或自己是 Candidate，都应转为 Follower
	if args.Term > rf.currentTerm || rf.state == Candidate {
		DPrintf("[%d] 任期更新或状态降级: %d->%d", rf.me, rf.currentTerm, args.Term)
		rf.becomeFollower(args.Term)
	}

	// 3. 重置选举定时器，这是心跳的关键作用
	rf.lastHeartbeat = time.Now()
	if rf.electionTimer != nil {
		rf.electionTimer.Reset(rf.getRandomElectionTimeout())
	}

	reply.Term = rf.currentTerm
	reply.Success = true
}
```

## 6. 实现 `GetState()`

最后，完成测试器要求的 `GetState()` 方法。

```go
func (rf *Raft) GetState() (int, bool) {
	rf.mu.Lock()
	defer rf.mu.Unlock()
	var term int
	var isleader bool
	// Your code here (3A).
	term = rf.currentTerm
	isleader = (rf.state == Leader)
	return term, isleader
}
```

## 运行测试

完成以上所有步骤后，即可运行测试来检验实现。

```sh
go test -run 3A -race
```

如果一切顺利，将会看到类似以下的成功输出：
```
ok      6.5840/raft1    14.830s
```