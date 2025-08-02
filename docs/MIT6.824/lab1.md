# MIT 6.824 Lab1: MapReduce

# MapReduce 论文阅读

MapReduce 是一种编程模型和相关的实现，用于处理和生成大数据集。它通过将数据分割并在多台机器上并行处理，大大提高了数据处理的效率。

## MapReduce 工作原理

MapReduce 过程主要由两个阶段组成：**Map** 和 **Reduce**。

- **Map 阶段**:
    - 输入数据被自动划分为 `M` 个**输入片段 (Input Splits)**，每个片段通常大小为 16-64MB。
    - 这些输入片段可以由不同的机器并行处理。
    - Map 函数接收一个 `(k1, v1)` 键值对作为输入，并输出一个中间的 `list(k2, v2)` 键值对列表。
- **Reduce 阶段**:
    - Map 阶段产生的中间键空间通过分区函数（例如 `hash(key) % R`）划分为 `R` 个部分，以便进行分布式处理。
    - Reduce 函数接收一个中间键 `k2` 和与该键相关的所有中间值列表 `list(v2)` 作为输入，即 `(k2, list(v2))`。它将这些值合并，并输出聚合后的结果。通常，每次Reduce调用会产生零个或一个最终值，该值被追加到对应的输出文件中。

## MapReduce 架构

MapReduce 架构包含一个**主节点 (Master)** 和多个**工作节点 (Worker)**。这是一个经典的主从（Master-Slave）架构模式。

1. **输入文件分割**: MapReduce 首先将输入文件分割成 `M` 个片段。
2. **任务分配**:
    - 主节点负责分配 `M` 个 Map 任务和 `R` 个 Reduce 任务。
    - 主节点选择空闲的工作节点，并为每个节点分配一个 Map 或 Reduce 任务。
3. **Map 任务执行**:
    - 被分配 Map 任务的工作节点会读取相应输入片段的内容。
    - 从输入数据中解析出键值对，并将每个键值对传递给用户定义的 **Map 函数**。
    - Map 函数产生的中间键值对 `(k, v)` 会在内存中暂时缓存。
    - 这些缓冲数据会定期写入本地磁盘，并根据分区函数（例如 `hash(key) % R`）划分成 `R` 个区域。
    - 本地磁盘上这些缓冲文件的位置信息会被传回给主节点。
4. **数据传输与排序 (Shuffle)**:
    - 当 Reduce 工作节点从主节点接收到这些位置信息时，会使用远程调用从 Map 工作节点的本地磁盘读取缓冲数据。
    - Reduce 工作节点读取完所有中间键值对后，会根据中间键进行**排序**，以便将相同键的所有出现分组在一起。如果数据量太大无法放入内存，则使用外部排序。
5. **Reduce 任务执行**:
    - Reduce 工作节点遍历排序后的中间数据，对于遇到的每一个唯一中间键。
    - 将键和对应的 `list(v)` 传递给用户定义的 **Reduce 函数**。
    - Reduce 函数的输出会追加到这个 Reduce 分区的最终输出文件中。
6. **任务完成**: 所有 Map 任务和 Reduce 任务完成后，主节点唤醒应用程序，MapReduce 计算完成。
7. **输出**: 完成后的输出文件可在 `R` 个输出文件中获取，每个 Reduce 任务对应一个文件。这些文件通常不会合并成一个文件，而是作为输入传递给另一个 MapReduce 调用。

## 主节点数据结构

主节点维护多个数据结构来管理任务状态和信息：

- **任务状态**: 对于每个 Map 任务和 Reduce 任务，主节点存储其状态（`idle`, `in-progress`, `completed`）以及执行该任务的工作机器标识（针对非空闲任务）。
- **中间文件位置**: 主节点是传递中间文件区域位置信息的通道。对于每个完成的 Map 任务，主节点会存储该 Map 任务生成的 `R` 个中间文件区域的位置和大小。当 Map 任务完成后，主节点会接收到这些位置和大小的更新信息，并将这些信息逐步推送给正在执行 Reduce 任务的工作节点。

## 容错性

MapReduce 具有内置的容错机制：

### 工作节点故障
- 主节点定期向每个工作节点发送心跳。如果一个工作节点在一段时间内没有回应，主节点会将其标记为失败。
- 该失败工作节点已完成的**任何 Map 任务**都会重置回空闲状态，以便重新调度到其他工作节点上。这是因为 Map 任务的输出储存在失败机器的本地磁盘上，无法访问，因此需要在失败后重新执行。
- 类似地，任何在该失败工作节点上正在进行的 Map 任务或 Reduce 任务也会重置回空闲状态并可以重新调度。
- 已完成的 Reduce 任务不需要重新执行，因为它们的输出储存在全局文件系统当中。
- 如果一个 Map 任务首先由 `worker_A` 执行，然后因为 `worker_A` 失败，`worker_B` 重新执行了它，所有执行 Reduce 任务的 worker 都会收到重复执行的通知。任何尚未从 `worker_A` 读取数据的 Reduce 任务将从 `worker_B` 中读取数据。

### 主节点故障
- 如果主节点死亡，可以从最后一个检查点的状态重新启动新的副本。
- 然而，鉴于只有一个主节点，故障的可能性相对较小。因此，在实际实现中，如果主节点失败，通常会直接终止 MapReduce 计算，客户端可以检查此条件，如果需要可以重试 MapReduce 操作。

## Lab1 实现目标

你需要在 `mr/coordinator.go`、`mr/worker.go` 和 `mr/rpc.go` 这几个文件中编写你的代码，实现一个简化的 MapReduce 系统。理想情况下，Map (`M`) 和 Reduce (`R`) 的数量应远大于工作机器的数量。

### 核心任务和要求

- **Coordinator (协调器)**:
    - 负责分配 Map 和 Reduce 任务给 Worker。
    - 处理 Worker 失败的情况：例如，如果一个 Worker 在 10 秒内没有完成任务，协调器会重新分配给另一个 Worker。
    - 当所有任务完成后，协调器需要退出。
- **Worker (工作器)**:
    - 循环地向协调器请求任务。
    - 执行 Map 或 Reduce 函数。
    - 将结果写入文件。
    - 当协调器指示所有任务完成后，Worker 也需要退出。
- **RPC 通信**: 实现一个基于 RPC 的通信机制，让 Worker 可以和 Coordinator 交互。
- **Map 阶段中间文件**:
    - Map 阶段需要将中间键分成 `nReduce` 个桶（partitions）。
    - 每个 Mapper 生成 `nReduce` 个中间文件，每个文件对应一个 Reduce 桶。
- **Reduce 任务输出**: Reduce 任务的输出需要写入到 `mr-out-X` 文件中，并遵循特定的格式。
- **并发处理**: 确保你的实现能够处理并发，并考虑使用锁来保护共享数据。
- **中间 KV 存储**: 可以使用 Go 的 `encoding/json` 包来存储中间的 `key/value` 对。
- **测试**: `test-mr.sh` 脚本会用来测试你的实现，确保它产生正确的输出，支持并行，并能从 Worker 崩溃中恢复。

### 个人实现

## 1. 定义数据模型与服务契约

开始编码前，首先要定义好系统的核心“实体”和它们之间的“通信契约”。

**数据模型 (Data Models)**:
从论文中可以得出，正在运行中的任务主要有两种类型：MapTask 和 ReduceTask。由于本作业通过 RPC 进行通信，Worker 节点本身不主动执行操作，而是向 Coordinator（协调器，后文称主节点）请求任务。因此，Worker 的状态由主节点告知，主节点会指示 Worker 执行 MapTask、ReduceTask，或者进入 WaitingTask（等待任务）或 ExitingTask（退出）状态。基于此，我们定义了以下任务类型：

```go
type TaskType int
const (
	MapTask TaskType = iota
	ReduceTask
	WaitingTask
	ExitingTask
)
```
对于任务本身的定义，除了 `TaskType`，还需要一个唯一的 `TaskId` 来标识任务，任务需要处理的 `File` 列表，Reduce 任务的总数 `NReduce`，以及 Map 任务的总数 `NMap`。

为了更好地管理任务状态，我们定义了 `TaskStateInfo` 结构体。它不仅包含了任务类型和指向任务本身的指针，还记录了任务的 `StartTime`（用于实现超时重试机制）和执行该任务的 `WorkerId`。
```go
type Task struct {
	TaskType TaskType // 任务种类
	TaskId   int      // 任务id
	File     []string // 任务处理的文件列表
	NReduce  int      // Reduce任务的数量
	NMap     int      // Map任务的数量
}

// TaskStateInfo 任务状态信息
type TaskStateInfo struct {
	TaskType  TaskType  // 任务类型
	StartTime time.Time // 任务开始时间用于检测超时
	Task      *Task     // 任务信息
	WorkerId  int       // 任务分配给的Worker ID
}
```

**服务契约 (RPC Contracts)**:
基于上述数据模型，我们设计 RPC 接口。

Worker 请求任务时，需要提供其 `WorkerId`：
```go
type RequestTaskArgs struct {
	WorkerId int // Worker的ID
}
```

Coordinator 的响应 `RequestTaskReply` 需要包含任务的类型 (`TaskType`)、任务ID (`TaskId`)、待处理的文件列表 (`File`)、Reduce 任务总数 (`NReduce`) 和 Map 任务总数 (`NMap`)：
```go
type RequestTaskReply struct {
	TaskType TaskType // 任务类型：Map, Reduce, Waiting, Exiting
	TaskId   int      // 任务ID
	File     []string // 对于Map任务，是输入文件；对于Reduce任务，是中间文件
	NReduce  int      // Reduce任务的数量
	NMap     int      // Map任务的数量
}
```

当 Worker 完成任务后，通过 `FinishTaskArgs` 告知 Coordinator 其 `WorkerId`、完成的任务类型 (`TaskType`) 和任务ID (`TaskId`)。Coordinator 的响应 `FinishTaskReply` 可以为空结构体：
```go
type FinishTaskArgs struct {
	WorkerId int      // Worker的ID
	TaskType TaskType // 完成的任务类型
	TaskId   int      // 完成的任务ID
}

type FinishTaskReply struct {
}
```
这样，RPC 的请求与响应数据结构就设计完成了。

## 2. Worker组件实现

Worker 是一个无状态的计算组件，其行为模式很简单：在一个循环中不断向 Coordinator 请求任务，执行任务，然后上报结果。

在动手实现 Worker 之前，我们先分析了实验提供的 `mrsequential.go` 这个单机版 MapReduce 实现。它清晰地展示了 Map 和 Reduce 两个阶段的完整流程：

- **Map阶段逻辑**: 读取输入文件 -> 调用用户定义的 `mapf` 函数 -> 将产生的键值对追加到 `intermediate` 列表中。
```go
intermediate := []mr.KeyValue{}
for _, filename := range os.Args[2:] {
	file, err := os.Open(filename)
	if err != nil {
		log.Fatalf("cannot open %v\", filename)
	}
	content, err := ioutil.ReadAll(file)
	if err != nil {
		log.Fatalf("cannot read %v\", filename)
	}
	file.Close()
	kva := mapf(filename, string(content))
	intermediate = append(intermediate, kva...)
}
```
这部分代码负责读取所有输入文件，并将内容传递给 `mapf` 函数，收集所有产生的中间键值对。

- **Reduce阶段逻辑**: 对 `intermediate` 列表中的键值对按键进行排序 -> 遍历排序后的列表，对具有相同键的键值对进行分组 -> 将每个键及其对应的值列表传递给用户定义的 `reducef` 函数 -> 将 `reducef` 的输出写入到最终的输出文件中。
```go
sort.Sort(ByKey(intermediate))
oname := "mr-out-0"
ofile, _ := os.Create(oname)
//
// call Reduce on each distinct key in intermediate[],
// and print the result to mr-out-0.
//
i := 0
for i < len(intermediate) {
	j := i + 1
	for j < len(intermediate) && intermediate[j].Key == intermediate[i].Key {
		j++
	}
	values := []string{}
	for k := i; k < j; k++ {
		values = append(values, intermediate[k].Value)
	}
	output := reducef(intermediate[i].Key, values)
	// this is the correct format for each line of Reduce output.
	fmt.Fprintf(ofile, "%v %v\n", intermediate[i].Key, output)
	i = j
}
ofile.Close()
}
```
这部分代码负责对中间键值对进行排序和聚合，然后调用 `reducef` 函数处理，并将结果写入输出文件。

理解了单机版的实现后，我们开始编写分布式 Worker。
Worker 的主要逻辑是：
1.  生成一个唯一的 `workerId`（这里使用进程ID）。
2.  进入一个无限循环，在循环中：
    a.  向 Coordinator 请求任务。
    b.  根据收到的任务类型执行相应的操作（Map、Reduce、等待或退出）。
    c.  任务完成后，通知 Coordinator。

```go
func Worker(mapf func(string, string) []KeyValue,
	reducef func(string, []string) string) {
	// 根据进程生成一个简单的Worker ID
	workerId := os.Getpid()
	log.Printf("Worker %d 启动", workerId)
	// Worker主循环
	for {
		// 1. 向Coordinator请求任务
		task := requestTask(workerId)

		// 2. 根据任务类型处理
		switch task.TaskType {
		case MapTask:
			log.Printf("Worker %d 收到Map任务 %d", workerId, task.TaskId)
			doMapTask(task, mapf)
		case ReduceTask:
			log.Printf("Worker %d 收到Reduce任务 %d", workerId, task.TaskId)
			doReduceTask(task, reducef)
		case WaitingTask:
			log.Printf("Worker %d 没有任务，等待中...", workerId)
			time.Sleep(time.Second) // 等待1秒后重试
			continue
		case ExitingTask:
			log.Printf("Worker %d 收到退出信号", workerId)
			return
		}

		// 3. 完成任务后通知Coordinator
		finishTask(workerId, task.TaskType, task.TaskId)
	}
}
```

`requestTask` 函数负责向 Coordinator 发起 RPC 请求以获取任务：
```go
func requestTask(workerId int) *RequestTaskReply {
	// 1. 准备RPC参数
	args := RequestTaskArgs{
		WorkerId: workerId,
	}
	// 2. 准备接收回复的结构
	reply := RequestTaskReply{}
	// 3. 发起RPC调用
	ok := call("Coordinator.RequestTask", &args, &reply)
	if !ok {
		log.Printf("Worker %d 请求任务失败", workerId)
		// 如果RPC失败，说明Coordinator可能已经退出，Worker也应该退出
		reply.TaskType = ExitingTask
	}
	return &reply
}
```

`finishTask` 函数负责在任务完成后通知 Coordinator：
```go
func finishTask(workerId int, taskType TaskType, taskId int) {
	// 1. 准备RPC参数
	args := FinishTaskArgs{
		WorkerId: workerId,
		TaskType: taskType,
		TaskId:   taskId,
	}
	// 2. 准备接收回复的结构
	reply := FinishTaskReply{}
	// 3. 发起RPC调用
	ok := call("Coordinator.FinishTask", &args, &reply)
	if !ok {
		log.Printf("Worker %d 通知任务完成失败", workerId)
	}
}
```

**doMapTask实现要点**:
`doMapTask` 函数负责执行 Map 任务。为了应对 Worker 可能随时崩溃的情况，其实现需要保证操作的原子性。
1.  **执行Map**: 读取 Coordinator 分配的输入文件，调用用户提供的 `mapf` 函数，得到内存中的中间键值对列表。
2.  **创建临时输出**: 为 `nReduce` 个 Reduce 分区创建 `nReduce` 个**临时文件**。直接写入最终命名的文件是危险的，因为写入过程中进程可能崩溃，导致文件损坏或不完整。使用临时文件可以避免这个问题。
3.  **分区与写入**: 遍历内存中的键值对，根据 `ihash(key) % nReduce` 决定每个键值对所属的 Reduce 分区，并使用 `encoding/json` 包将键值对编码后写入对应的临时文件。这样可以确保具有相同键的键值对最终会被同一个 Reduce 任务处理。如果存在 M 个 Map 任务和 R 个 Reduce 任务，此阶段总共会产生 M * R 个中间文件。
4.  **原子性提交**: 所有数据成功写入所有临时文件后，通过 `os.Rename` 操作将每个临时文件重命名为最终的中间文件名（格式如 `mr-X-Y`，其中 X 是 Map 任务 ID，Y 是 Reduce 任务 ID）。`os.Rename` 在大多数文件系统上是原子操作，这确保了只有当所有数据都完整写入后，文件才对后续的 Reduce 任务可见。如果重命名失败，只会留下一个无用的临时文件，不会影响任务的重试。

```go
func doMapTask(task *RequestTaskReply, mapf func(string, string) []KeyValue) {
	log.Printf("开始执行Map任务 %d，处理文件: %s", task.TaskId, task.File[0])

	// 1. 打开并读取输入文件
	filename := task.File[0]
	file, err := os.Open(filename)
	if err != nil {
		log.Fatalf("Worker打开文件 %s 失败: %v", filename, err)
	}
	defer file.Close()

	// 2. 读取文件内容
	content, err := ioutil.ReadAll(file)
	if err != nil {
		log.Fatalf("Worker读取文件 %s 失败: %v", filename, err)
	}

	// 3. 调用mapf获取键值对
	log.Printf("调用Map函数处理文件 %s", filename)
	intermediate := mapf(filename, string(content))
	log.Printf("Map函数返回 %d 个键值对", len(intermediate))

	// 4. 创建nReduce个临时文件，用于存储中间结果
	nReduce := task.NReduce
	outFiles := make([]*os.File, nReduce)
	fileEncs := make([]*json.Encoder, nReduce)

	// 5. 为每个Reduce任务创建临时文件（在当前目录创建）
	for outindex := 0; outindex < nReduce; outindex++ {
		// 在当前目录创建临时文件
		outFiles[outindex], err = ioutil.TempFile(".", "mr-tmp-*")
		if err != nil {
			log.Fatalf("Worker创建临时文件失败: %v", err)
		}
		fileEncs[outindex] = json.NewEncoder(outFiles[outindex])
	}

	// 6. 将键值对根据hash分配到不同的临时文件中
	for _, kv := range intermediate {
		// 计算这个key应该分配给哪个reduce任务
		outindex := ihash(kv.Key) % nReduce
		// 将键值对编码为JSON并写入对应的临时文件
		err := fileEncs[outindex].Encode(&kv)
		if err != nil {
			log.Fatalf("Worker编码KeyValue失败: %v", err)
		}
	}

	// 7. 关闭临时文件并原子重命名为最终的中间文件
	for outindex, file := range outFiles {
		originalPath := file.Name() // 获取临时文件的原始路径
		file.Close()
		// 构建最终文件名: mr-X-Y (X是Map任务ID，Y是Reduce任务ID)
		outname := fmt.Sprintf("mr-%d-%d", task.TaskId, outindex)
		// 原子重命名操作，确保文件完整性
		err := os.Rename(originalPath, outname)
		if err != nil {
			log.Fatalf("Worker重命名文件 %s 到 %s 失败: %v", originalPath, outname, err)
		}
	}
	log.Printf("Map任务 %d 完成，生成了 %d 个中间文件", task.TaskId, nReduce)
}
```

**doReduceTask实现要点**:
`doReduceTask` 函数负责执行 Reduce 任务，同样需要保证输出的原子性。
1.  **拉取数据(Shuffle)**: 遍历所有 Map 任务的 ID（从 0 到 `NMap`），根据命名约定（`mr-mapID-reduceID`，其中 `reduceID` 是当前 Reduce 任务的 ID）拼接出需要读取的中间文件名，并打开这些文件。如果某个文件无法打开（可能由于对应的 Map 任务失败或尚未完成），记录警告并跳过该文件，继续处理其他文件。
2.  **解码与聚合**: 从所有成功打开的中间文件中解码出 JSON 格式的键值对，并将它们全部加载到内存中的 `intermediate` 列表。
3.  **排序**: 对内存中的 `intermediate` 列表按键（Key）进行排序，以便将具有相同键的键值对聚合在一起。
4.  **执行Reduce**: 遍历排序后的列表，对于每个唯一的键，收集其所有的值（Value），然后将键和对应的值列表传递给用户定义的 `reducef` 函数。
5.  **原子性提交**: 与 Map 任务类似，先将 `reducef` 函数的输出写入一个临时文件。在写入完成后，调用 `tempFile.Sync()` 确保数据已刷到磁盘，然后关闭临时文件。最后，通过 `os.Rename` 原子性地将临时文件重命名为最终的输出文件（格式如 `mr-out-X`，其中 X 是 Reduce 任务 ID）。

```go
func doReduceTask(task *RequestTaskReply, reducef func(string, []string) string) {
	log.Printf("开始执行Reduce任务 %d，需要处理 %d 个Map任务的输出", task.TaskId, task.NMap)

	// 1. 读取所有相关的中间文件 mr-X-Y (Y是当前Reduce任务的ID)
	intermediate := []KeyValue{}
	for mapIndex := 0; mapIndex < task.NMap; mapIndex++ {
		// 构建中间文件名：mr-mapIndex-reduceIndex
		filename := fmt.Sprintf("mr-%d-%d", mapIndex, task.TaskId)
		file, err := os.Open(filename)
		if err != nil {
			log.Printf("警告：无法打开中间文件 %s: %v", filename, err)
			continue // 继续处理其他文件
		}
		// 解码JSON数据
		dec := json.NewDecoder(file)
		for {
			var kv KeyValue
			if err := dec.Decode(&kv); err != nil {
				break // 文件读取完毕或发生错误
			}
			intermediate = append(intermediate, kv)
		}
		file.Close()
	}
	log.Printf("Reduce任务 %d 共读取到 %d 个键值对", task.TaskId, len(intermediate))

	// 2. 按Key排序
	sort.Sort(ByKey(intermediate))

	// 3. 创建临时输出文件（在当前目录创建）
	tempFile, err := ioutil.TempFile(".", "mr-out-tmp-*")
	if err != nil {
		log.Fatalf("Reduce任务 %d 创建临时文件失败: %v", task.TaskId, err)
	}
	defer tempFile.Close() // 确保临时文件最终被关闭

	// 4. 对相同的Key进行Reduce操作并写入临时文件
	i := 0
	for i < len(intermediate) {
		j := i + 1
		// 找到所有相同Key的值
		for j < len(intermediate) && intermediate[j].Key == intermediate[i].Key {
			j++
		}
		// 收集所有相同Key的Value
		values := []string{}
		for k := i; k < j; k++ {
			values = append(values, intermediate[k].Value)
		}
		// 调用Reduce函数
		output := reducef(intermediate[i].Key, values)
		// 写入输出文件（格式：key value）
		fmt.Fprintf(tempFile, "%v %v\n", intermediate[i].Key, output)
		i = j
	}

	// 5. 确保数据写入磁盘
	err = tempFile.Sync()
	if err != nil {
		log.Fatalf("Reduce任务 %d 同步临时文件失败: %v", task.TaskId, err)
	}
	
	originalPath := tempFile.Name() // 获取临时文件的原始路径
	tempFile.Close() // 关闭文件后才能重命名

	// 6. 原子重命名为最终输出文件
	outname := fmt.Sprintf("mr-out-%d", task.TaskId)
	err = os.Rename(originalPath, outname)
	if err != nil {
		log.Fatalf("Reduce任务 %d 重命名输出文件 %s 到 %s 失败: %v", task.TaskId, originalPath, outname, err)
	}
	log.Printf("Reduce任务 %d 完成，输出文件: %s", task.TaskId, outname)
}
```
至此，Worker 组件的功能就完成了。

## 3. Coordinator组件实现

Coordinator 是整个 MapReduce 系统的**状态管理和任务调度中心**，其设计必须重点考虑并发安全和容错。

**任务队列**:
因为目的是管理待分配的任务，所以会想到并发+FIFO，也就是java当中的阻塞队列。
考虑到 Go 语言中 `channel` 的特性（原生的、支持并发操作的 FIFO 队列），我们使用 `channel` 来实现这个任务队列。这提供了一种高效且线程安全的方式来存储和分发任务。将channel作为存放任务的“阻塞队列”来使用。
```go
type TaskQueue struct {
	// 任务队列，使用channel实现
	taskChan chan *TaskStateInfo
}

func NewTaskQueue(capacity int) *TaskQueue {
	return &TaskQueue{
		taskChan: make(chan *TaskStateInfo, capacity),
	}
}

// offer 尝试将任务添加到队列中，如果队列已满则返回false (非阻塞)
func (tq *TaskQueue) offer(task *TaskStateInfo) bool {
	select {
	case tq.taskChan <- task: // 如果队列未满，添加任务
		return true
	default: // 如果队列已满
		log.Println("TaskQueue is full, cannot add task")
		return false
	}
}

// poll 尝试从队列中获取任务，如果没有任务则返回nil (非阻塞)
func (tq *TaskQueue) poll() *TaskStateInfo {
	select {
	case task := <-tq.taskChan: // 非阻塞获取任务
		return task
	default: // 如果队列为空
		return nil
	}
}

// blockingPoll 从队列中获取任务 (阻塞直到有任务可用)
func (tq *TaskQueue) blockingPoll() *TaskStateInfo {
	return <-tq.taskChan
}
```

**状态管理与并发控制**:
Coordinator 作为一个有状态的服务，其内部的共享数据（如 `runningTasks` 映射、任务计数器等）必须被保护，以防止多个 goroutine 并发访问时出现数据竞争。这里我们使用了 `sync.RWMutex`（读写锁）来保证线程安全。读写锁允许多个 goroutine 同时进行读操作，但在有 goroutine 进行写操作时会阻塞其他所有读写操作，这有助于提高并发性能，同时避免了对任务完成状态进行阻塞式轮询。
```go
type Coordinator struct {
	taskQueue          *TaskQueue             // 任务队列，使用channel实现的高效队列
	runningTasks       map[int]*TaskStateInfo // TaskId -> TaskStateInfo (记录正在运行的任务及其状态)
	NReduce            int                    // Reduce任务的总数量
	NMap               int                    // Map任务的总数量
	MapTaskFinished    int                    // 已完成的Map任务数量
	ReduceTaskFinished int                    // 已完成的Reduce任务数量
	AllTasksDone       bool                   // 标志所有Map和Reduce任务是否都已完成
	mutex              sync.RWMutex           // 读写锁，用于保护Coordinator的共享状态
}
```

**Coordinator初始化 (`MakeCoordinator`)**:
`MakeCoordinator` 函数负责初始化 Coordinator。
1.  创建 `Coordinator` 结构体实例，包括初始化任务队列、`runningTasks` 映射、Map/Reduce 任务总数、已完成任务计数器和 `AllTasksDone` 标志。
2.  为每个输入文件创建一个 Map 任务，并将其封装在 `TaskStateInfo` 中，然后将这些 Map 任务添加到任务队列 `taskQueue` 中。
3.  启动一个后台 goroutine `taskTimeoutChecker`，用于监控任务执行是否超时。
4.  调用 `server()` 方法启动 RPC 服务，使 Coordinator 能够接收来自 Worker 的请求。

```go
func MakeCoordinator(files []string, nReduce int) *Coordinator {
	c := &Coordinator{
		taskQueue:          NewTaskQueue(1000), // 初始化任务队列，容量为1000
		runningTasks:       make(map[int]*TaskStateInfo),
		NReduce:            nReduce,
		NMap:               len(files),
		MapTaskFinished:    0,
		ReduceTaskFinished: 0,
		AllTasksDone:       false,
		mutex:              sync.RWMutex{},
	}

	// 1. 创建Map任务并放入队列
	for i, file := range files {
		task := &Task{
			TaskType: MapTask,
			TaskId:   i,
			File:     []string{file}, // 每个Map任务处理一个文件
			NReduce:  nReduce,
			NMap:     len(files),
		}
		taskState := &TaskStateInfo{
			TaskType: MapTask,
			Task:     task,
		}
		c.taskQueue.offer(taskState)
		log.Printf("创建Map任务 %d: %s", i, file)
	}
	log.Printf("Coordinator初始化完成: %d个Map任务, %d个Reduce任务", len(files), nReduce)

	// 启动任务超时检查协程
	go c.taskTimeoutChecker()

	c.server() // 启动RPC服务
	return c
}
```

**容错机制（超时重试 `taskTimeoutChecker`）**:
为了处理 Worker “假死”或失联的情况，Coordinator 启动了一个独立的 goroutine `taskTimeoutChecker` 作为后台监控。
1.  该 goroutine 使用一个定时器（例如，每10秒触发一次）定期检查，类似java中使用ExecutorService但是更轻量级。
2.  在每次检查时，它会遍历 `runningTasks` 中记录的所有正在执行的任务。
3.  如果发现某个任务的执行时间（`time.Now().Sub(taskState.StartTime)`）超过了预设的阈值（例如，20秒），则认为该任务执行超时。
4.  对于超时的任务，Coordinator 会将其从 `runningTasks` 中移除，并将其重新放回 `taskQueue` 任务队列中，等待被其他健康的 Worker 领取并重新执行。在重新加入队列前，会重置任务的 `StartTime` 和 `WorkerId`。
5.  如果所有任务（`c.AllTasksDone`）已经完成，则该监控协程退出。

```go
func (c *Coordinator) taskTimeoutChecker() {
	// 使用定时器每10s检查一次任务状态
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	for {
		c.mutex.RLock() // 使用读锁检查AllTasksDone
		if c.AllTasksDone {
			c.mutex.RUnlock()
			return // 所有任务完成，退出检查
		}
		c.mutex.RUnlock()

		<-ticker.C // 等待定时器触发

		c.mutex.Lock() // 加写锁以修改runningTasks和taskQueue
		now := time.Now()
		var timeoutTasks []*TaskStateInfo

		// 检查运行中的任务是否超时（例如，20秒）
		for taskId, taskState := range c.runningTasks {
			if now.Sub(taskState.StartTime) > 20*time.Second {
				log.Printf("任务 %d (类型: %d, Worker: %d) 超时，重新加入队列", taskId, taskState.TaskType, taskState.WorkerId)
				timeoutTasks = append(timeoutTasks, taskState)
				delete(c.runningTasks, taskId) // 从正在运行的任务中移除
			}
		}

		// 将超时的任务重新加入队列
		for _, taskState := range timeoutTasks {
			taskState.StartTime = time.Time{} // 重置开始时间
			taskState.WorkerId = 0            // 重置Worker ID
			c.taskQueue.offer(taskState)      // 重新加入任务队列
		}
		c.mutex.Unlock()
	}
}
```

**检查作业完成状态 (`Done`)**:
`Done` 方法用于供外部（例如测试脚本）检查整个 MapReduce 作业是否已经完成。它通过读取 `AllTasksDone` 标志位来实现，并使用读锁保护。
```go
func (c *Coordinator) Done() bool {
	c.mutex.RLock()
	defer c.mutex.RUnlock()
	return c.AllTasksDone
}
```

**RPC处理器 (`RequestTask` 和 `FinishTask`)**:
`RequestTask` 和 `FinishTask` 是 Coordinator 暴露给 Worker 的两个主要 RPC 端点。它们的实现逻辑都需要在互斥锁（这里是读写锁 `c.mutex`）的保护之下，以确保对共享状态的修改是原子和一致的。

**`RequestTask` RPC 处理器**:
当 Worker 调用 `RequestTask` 请求任务时：
1.  首先（使用读锁）检查 `c.AllTasksDone` 标志。如果所有任务已完成，则回复 `ExitingTask`，通知 Worker 退出。
2.  如果任务尚未全部完成，则尝试从 `c.taskQueue` 中（非阻塞地）取出一个任务（`taskState := c.taskQueue.poll()`）。
3.  如果队列为空（没有可分配的任务），则回复 `WaitingTask`，让 Worker稍后重试。
4.  如果成功获取到任务，则填充 `RequestTaskReply` 的各个字段（`TaskType`, `TaskId`, `File`, `NReduce`, `NMap`）。
5.  记录该任务的 `WorkerId`（请求任务的 Worker）和 `StartTime`（当前时间）。
6.  将该任务（`taskState`）添加到 `c.runningTasks` 映射中，表示该任务正在被执行。此步骤需要写锁。

```go
func (c *Coordinator) RequestTask(args *RequestTaskArgs, reply *RequestTaskReply) error {
	c.mutex.RLock() // 先用读锁检查AllTasksDone
	if c.AllTasksDone {
		c.mutex.RUnlock()
		reply.TaskType = ExitingTask
		log.Printf("所有任务已完成，通知Worker %d 退出", args.WorkerId)
		return nil
	}
	c.mutex.RUnlock()

	// 1. 从队列中获取任务 (非阻塞)
	taskState := c.taskQueue.poll()

	// 2. 如果没有任务，返回等待状态
	if taskState == nil {
		reply.TaskType = WaitingTask
		return nil
	}

	// 3. 填充回复信息
	reply.TaskType = taskState.askType // 注意这里应该是 taskState.TaskType
	reply.TaskId = taskState.Task.TaskId
	reply.File = taskState.Task.File
	reply.NReduce = taskState.Task.NReduce
	reply.NMap = taskState.Task.NMap

	// 4. 记录任务分配信息并更新状态 (需要写锁)
	c.mutex.Lock()
	defer c.mutex.Unlock()

	// 再次检查任务是否已经被分配或者已经完成（防止并发问题或任务已被重新调度）
	// 这一步是为了确保取出的任务仍然有效且未被其他goroutine处理
	if ts, ok := c.runningTasks[taskState.Task.TaskId]; ok && ts.TaskType == taskState.Task.TaskType {
		// 任务已在运行或已被重新加入队列但未被正确移除，让worker等待
		// 或者简单地将任务重新放回队列，让worker下次再取
		log.Printf("任务 %d (类型: %d) 已在运行或状态异常，让Worker %d 等待", taskState.Task.TaskId, taskState.Task.TaskType, args.WorkerId)
		c.taskQueue.offer(taskState) // 将任务放回队列
		reply.TaskType = WaitingTask
		return nil
	}
	
	taskState.WorkerId = args.WorkerId
	taskState.StartTime = time.Now()
	c.runningTasks[taskState.Task.TaskId] = taskState // 将任务加入运行中的任务列表

	log.Printf("分配任务给Worker %d: TaskType=%d, TaskId=%d, 文件:%v", args.WorkerId, reply.TaskType, reply.TaskId, reply.File)
	return nil
}
```

**`FinishTask` RPC 处理器**:
当 Worker 调用 `FinishTask` 通知任务完成时（需要写锁保护整个过程）：
1.  记录 Worker 完成任务的信息。
2.  从 `c.runningTasks` 映射中移除已完成的任务。
3.  根据完成的任务类型 (`args.TaskType`) 进行处理：
    *   **如果是 MapTask**:
        *   增加 `c.MapTaskFinished` 计数。
        *   记录日志，显示 Map 任务完成进度。
        *   检查是否所有 Map 任务都已完成 (`c.MapTaskFinished == c.NMap`)。如果是，则调用 `c.createReduceTasks()` 方法来创建并分发 Reduce 任务，标志着整个作业进入 Reduce 阶段。
    *   **如果是 ReduceTask**:
        *   增加 `c.ReduceTaskFinished` 计数。
        *   记录日志，显示 Reduce 任务完成进度。
        *   检查是否所有 Reduce 任务都完成

```go
func (c *Coordinator) FinishTask(args *FinishTaskArgs, reply *FinishTaskReply) error {
	c.mutex.Lock()
	defer c.mutex.Unlock()

	log.Printf("Worker %d完成了任务: TaskType=%d, TaskId=%d", args.WorkerId, args.TaskType, args.TaskId)

	// 1. 从运行中的任务列表中移除
	delete(c.runningTasks, args.TaskId)

	// 2. 根据任务类型处理完成逻辑
	switch args.TaskType {
	case MapTask:
		c.MapTaskFinished++
		log.Printf("Map任务 %d 已完成，Worker %d (进度: %d/%d)", args.TaskId, args.WorkerId, c.MapTaskFinished, c.NMap)

		// 检查是否所有Map任务都完成了
		if c.MapTaskFinished == c.NMap {
			log.Printf("所有Map任务已完成，开始创建Reduce任务")
			c.createReduceTasks()
		}

	case ReduceTask:
		c.ReduceTaskFinished++
		log.Printf("Reduce任务 %d 已完成，Worker %d (进度: %d/%d)", args.TaskId, args.WorkerId, c.ReduceTaskFinished, c.NReduce)

		// 检查是否所有Reduce任务都完成了
		if c.ReduceTaskFinished == c.NReduce {
			log.Printf("所有Reduce任务已完成，MapReduce作业完成！")
			c.AllTasksDone = true
		}

	default:
		log.Printf("未知任务类型完成: %d", args.TaskType)
	}

	return nil
}

// createReduceTasks 创建Reduce任务
func (c *Coordinator) createReduceTasks() {
	for i := 0; i < c.NReduce; i++ {
		task := &Task{
			TaskType: ReduceTask,
			TaskId:   i,
			File:     []string{}, // Reduce任务不需要特定的输入文件，会自动查找中间文件
			NReduce:  c.NReduce,
			NMap:     c.NMap,
		}

		taskState := &TaskStateInfo{
			TaskType: ReduceTask,
			Task:     task,
		}

		c.taskQueue.offer(taskState)
		log.Printf("创建Reduce任务 %d", i)
	}
}
```

至此lab1完成。
