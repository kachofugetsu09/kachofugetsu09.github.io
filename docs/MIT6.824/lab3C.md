# Lab 3C: 持久化(persistence)
任务要求是：
> 完成 raft.go 中的 persist() 和 readPersist() 函数，通过添加代码来保存和恢复持久状态。你需要将状态编码（或称为"序列化"）为字节数组，以便将其传递给 Persister 。使用 labgob 编码器；参见 persist() 和 readPersist() 中的注释。 labgob 类似于 Go 的 gob 编码器，但如果你尝试编码字段名为小写的结构体时，会打印错误消息。目前，将 nil 作为 persister.Save() 的第二个参数传递。在实现更改持久状态的地方插入对 persist() 的调用。完成这些后，如果其余实现正确，你应该能通过所有 3C 测试。
你可能需要一种优化方法，每次备份时 nextIndex 超过一项。查看从第 7 页底部到第 8 页顶部的扩展 Raft 论文（由一条灰色线标记）。论文对细节描述模糊；你需要填补其中的空白。一种可能性是让拒绝消息包含：
XTerm:  term in the conflicting entry (if any)
    XIndex: index of first entry with that term (if any)
    XLen:   log length

然后领导者的逻辑可以是：
情况 1：领导者没有 XTerm:
nextIndex = XIndex
 情况 2：领导者拥有 XTerm：
   nextIndex = (领导者最后一次 XTerm 条目的索引) + 1
 情况 3：跟随者的日志太短：
nextIndex = XLen

## 持久化相关方法
注释里已经给出相关提示了，按照她说的做就行，注释里写道
```go
// Your code here (3C).
	// Example:
	// w := new(bytes.Buffer)
	// e := labgob.NewEncoder(w)
	// e.Encode(rf.xxx)
	// e.Encode(rf.yyy)
	// raftstate := w.Bytes()
	// rf.persister.Save(raftstate, nil)
```

我们就分别存一下log currentTerm votedFor就行
```go
func (rf *Raft) persist() {
	//保存Log currentTerm votedFor
	w := new(bytes.Buffer)
	e := labgob.NewEncoder(w)
	e.Encode(rf.log)
	e.Encode(rf.currentTerm)
	e.Encode(rf.votedFor)

	raftState := w.Bytes()
	rf.persister.Save(raftState, nil)
}
```

readPersist这个方法也是类似，把他读出来就行，就是persist的逆运算
```go
func (rf *Raft) readPersist(data []byte) {
	if data == nil || len(data) < 1 { 
		return
	}
	r := bytes.NewBuffer(data)
	d := labgob.NewDecoder(r)

	var log []logEntry
	var currentTerm int
	var votedFor int
	if d.Decode(&log) != nil || d.Decode(&currentTerm) != nil || d.Decode(&votedFor) != nil {
		DPrintf("节点[%d] 恢复持久化状态失败", rf.me)
	} else {
		rf.log = log
		rf.currentTerm = currentTerm
		rf.votedFor = votedFor
		DPrintf("节点[%d] 恢复持久化状态成功: term=%d, votedFor=%d, log长度=%d",
			rf.me, rf.currentTerm, rf.votedFor, len(rf.log))
	}
}
```

然后在所有修改了这三个状态的地方进行持久化。

AppendEntries当中
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
		rf.persist() // 持久化状态变化
	}
	...other code
}
```
这里是因为我们持久化的votedFor和currentTerm发生了变化，持久化的宗旨就是，只要是这三个词条发生变化的时候，就需要进行持久化。

这里不过多赘述，可以翻找我的github仓库。在需要的地方加上持久化就行。

## 逻辑矫正
在AppendEntries的这里应当修改为
```go
if args.LeaderCommitIndex > rf.commitIndex {
		oldCommitIndex := rf.commitIndex
		// 计算这次AppendEntries后的最后一个日志条目索引
		lastNewEntryIndex := args.PrevLogIndex + len(args.Entries)
		rf.commitIndex = min(args.LeaderCommitIndex, lastNewEntryIndex)
		DPrintf("[%d] Follower 更新 commitIndex: %d->%d (LeaderCommit=%d, lastNewEntryIndex=%d)",
			rf.me, oldCommitIndex, rf.commitIndex, args.LeaderCommitIndex, lastNewEntryIndex)
	}

```

应该计算这次AppendEntries后的最后一个日志条目索引，然后取最小值。

修改sendHeartbeats
```go
func (rf *Raft) sendHeartbeats() {
	if rf.state != Leader {
		return
	}

	//DPrintf("Leader[%d] (任期%d) 开始发送心跳", rf.me, rf.currentTerm)

	for i := range rf.peers {
		if i == rf.me {
			continue
		}
		go func(server int) {
			rf.mu.Lock()
			if rf.state != Leader {
				rf.mu.Unlock()
				return
			}

			// 检查是否有新的日志条目需要发送
			prevLogIndex := rf.nextIndex[server] - 1
			var entries []logEntry

			if rf.nextIndex[server] <= rf.getLastLogIndex() {
				// 有需要复制的日志条目，发送包含日志条目的 AppendEntries
				startArrayIndex := rf.nextIndex[server]
				if startArrayIndex < len(rf.log) {
					entries = make([]logEntry, len(rf.log)-startArrayIndex)
					copy(entries, rf.log[startArrayIndex:])
				} else {
					entries = make([]logEntry, 0)
				}
			} else {
				// 没有新的日志条目，发送空的心跳
				entries = make([]logEntry, 0)
			}

			args := &AppendEntriesArgs{
				Term:              rf.currentTerm,
				LeaderId:          rf.me,
				PrevLogIndex:      prevLogIndex,
				PrevLogTerm:       rf.getLogTerm(prevLogIndex),
				Entries:           entries,
				LeaderCommitIndex: rf.commitIndex,
			}
			rf.mu.Unlock()

			reply := &AppendEntriesReply{}

			if ok := rf.peers[server].Call("Raft.AppendEntries", args, reply); ok {
				rf.mu.Lock()
				// 检查是否仍然是相同任期的 Leader
				if rf.state != Leader || rf.currentTerm != args.Term {
					rf.mu.Unlock()
					return
				}

				if reply.Term > rf.currentTerm {
					DPrintf("[%d] 心跳中发现更高任期，退位: %d->%d", rf.me, rf.currentTerm, reply.Term)
					rf.currentTerm = reply.Term
					rf.state = Follower
					rf.votedFor = -1
					rf.electionTimer.Reset(rf.getRandomElectionTimeout())
					rf.persist() // 持久化状态变化
				} else if reply.Success {
					// 成功，更新 nextIndex 和 matchIndex
					rf.nextIndex[server] = args.PrevLogIndex + len(args.Entries) + 1
					rf.matchIndex[server] = args.PrevLogIndex + len(args.Entries)
					if len(args.Entries) > 0 {
						DPrintf("[%d] 心跳中成功复制到节点[%d]: nextIndex=%d, matchIndex=%d",
							rf.me, server, rf.nextIndex[server], rf.matchIndex[server])
						// 检查是否可以提交新的日志条目
						rf.updateCommitIndex()
					}
				} else {
					// 失败，使用快速回退算法
					if reply.Term <= rf.currentTerm {
						oldNextIndex := rf.nextIndex[server]
						rf.nextIndex[server] = rf.optimizeNextIndex(server, reply)
						DPrintf("[%d] 心跳失败，快速回退 nextIndex[%d]: %d->%d (XTerm=%d, XIndex=%d, XLen=%d)",
							rf.me, server, oldNextIndex, rf.nextIndex[server], reply.XTerm, reply.XIndex, reply.XLen)
					}
				}
				rf.mu.Unlock()
			}
		}(i)
	}
}
```

## 完成Make方法的持久化读取
```go
func Make(peers []*labrpc.ClientEnd, me int,
	persister *tester.Persister, applyCh chan raftapi.ApplyMsg) raftapi.Raft {
	rf := &Raft{}
	rf.peers = peers
	rf.persister = persister
	rf.me = me
	rf.applyCh = applyCh

	// Your initialization code here (3A, 3B, 3C).
	rf.state = Follower
	rf.currentTerm = 0
	rf.votedFor = -1
	rf.log = make([]logEntry, 1)
	rf.log[0] = logEntry{LogIndex: 0, Term: 0, Command: nil}

	rf.commitIndex = 0
	rf.lastApplied = 0

	rf.nextIndex = make([]int, len(peers))
	rf.matchIndex = make([]int, len(peers))

	for i := range peers {
		rf.nextIndex[i] = 1
		rf.matchIndex[i] = 0
	}

	rf.lastHeartbeat = time.Now()
	rf.electionTimer = time.NewTimer(rf.getRandomElectionTimeout())
	rf.heartbeatTimer = time.NewTimer(100 * time.Millisecond)

	// 初始化时恢复持久化状态
	rf.readPersist(persister.ReadRaftState())

	go rf.ticker()
	go rf.applier() // 启动应用日志的 goroutine

	return rf
}
```

## 修改applier方法
这里做的优化是通过lastapplied和commitindex的比较去判断是否有新的日志条目该被应用。一次性收集所有该被应用的日志。使用日志条目中的逻辑索引，然后按顺序应用这些日志条目。

```go
unc (rf *Raft) applier() {
	for !rf.killed() {
		rf.mu.Lock()

		// 检查是否有新的日志条目需要应用
		if rf.lastApplied >= rf.commitIndex {
			rf.mu.Unlock()
			time.Sleep(10 * time.Millisecond)
			continue
		}

		// 一次性收集所有需要应用的条目，避免在发送过程中释放锁
		var toApply []raftapi.ApplyMsg

		for rf.lastApplied < rf.commitIndex {
			rf.lastApplied++
			applyIndex := rf.lastApplied

			// 检查日志索引是否有效
			if applyIndex >= len(rf.log) {
				DPrintf("[%d] 错误: 尝试应用索引 %d 但日志长度只有 %d", rf.me, applyIndex, len(rf.log))
				rf.lastApplied-- // 回滚
				break
			}

			if rf.log[applyIndex].Command != nil {
				logicalIndex := rf.log[applyIndex].LogIndex
				applyMsg := raftapi.ApplyMsg{
					CommandValid: true,
					Command:      rf.log[applyIndex].Command,
					CommandIndex: logicalIndex,
				}
				toApply = append(toApply, applyMsg)
				DPrintf("[%d] 准备应用日志条目: arrayIndex=%d, logicalIndex=%d, command=%v",
					rf.me, applyIndex, logicalIndex, rf.log[applyIndex].Command)
			}
		}
		rf.mu.Unlock()

		// 按顺序发送所有待应用的消息
		for _, msg := range toApply {
			DPrintf("[%d] 应用日志条目: index=%d, command=%v", rf.me, msg.CommandIndex, msg.Command)
			rf.applyCh <- msg
		}

		time.Sleep(10 * time.Millisecond)
	}
}
```

最后，进行测试
```bash
go test -run 3C
```
得到结果
```
... Passed --  time 16.1s #peers 5 #RPCs  5929 #Ops    0
PASS
ok  	6.5840/raft1	116.211s
```