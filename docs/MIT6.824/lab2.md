# MIT 6.824 Lab 2 实现详解

这一篇会和lab1一样，直接在一个文章中讲解整个实现，难度是比较低的。

## 实验要求概述

先说一下这个lab的要求。

首先就是实现一个简单的**kv存储**。client的方法会通过指定的rpc方式向server发送rpc请求。

server中是实际对kv的存储。在受到client的rpc请求后，会进行存储，然后返回对应的响应给client。

主要的难点在于对一个特殊情况的处理上。

在发送rpc请求后，如果没有受到相应，为了完成这个put或者get方法，应当进行持续的重试。

但是比如说第一次rpc成功发送了，server进行了成功处理了，但是在返回相应的过程中，这个rpc丢失了该怎么办？

**主要就是这个问题的处理。**

## RPC接口定义

rpc的格式是定义好的。

### 错误类型定义

首先是几种固定的错误类型

```go
const (
	// Err's returned by server and Clerk
	OK         = "OK"
	ErrNoKey   = "ErrNoKey"
	ErrVersion = "ErrVersion"

	// Err returned by Clerk only
	ErrMaybe = "ErrMaybe"

	// For future kvraft lab
	ErrWrongLeader = "ErrWrongLeader"
	ErrWrongGroup  = "ErrWrongGroup"
)
```

### RPC请求和响应格式

然后是固定的rpc请求和相应格式

```go
type PutArgs struct {
	Key     string
	Value   string
	Version Tversion
}

type PutReply struct {
	Err Err
}

type GetArgs struct {
	Key string
}

type GetReply struct {
	Value   string
	Version Tversion
	Err     Err
}
```

## Client端实现

### Get方法实现

然后我们就是实现Get方法。

1. 首先构建一个GetArgs这个rpc请求，然后塞入key,发送出去，接收reply
2. 如果结果是ok那么就直接return value version ok就行
3. 如果是error no key
4. 如果是其他类型的错误，那么就循环重试，直到接收到Ok或者是errNoKey相应

如下实现：

```go
func (ck *Clerk) Get(key string) (string, rpc.Tversion, rpc.Err) {
	args := &rpc.GetArgs{Key: key}

	for {
		reply := &rpc.GetReply{}
		ok := ck.clnt.Call(ck.server, "KVServer.Get", args, reply)
		if ok {
			// 成功收到服务器回复，根据错误类型处理
			if reply.Err == rpc.OK {
				// 正常情况：键存在，返回值和版本号
				return reply.Value, reply.Version, rpc.OK
			} else if reply.Err == rpc.ErrNoKey {
				// 键不存在：这是确定的结果，直接返回
				return "", 0, rpc.ErrNoKey
			} 
		}

	}
}
```

### Put方法实现

put方法只在请求中的version和服务器上key的version匹配的时候更新keyvalue。如果版本号不匹配就会返回ErrVersion错误。

但是这里就有我刚才提到的问题，就是有可能第一次发送，server成功处理了，但是在返回的过程中rpc丢失了。也就是说状态保留了，但是client并没有收到成功的回复，仍然一直充实。

这就是**ErrMaybe**的情况。

#### 处理逻辑分析

所以我们的逻辑上：

1. 如果第一次就成功了，那是最好
2. 如果第一次就返回了ErrVersion,那么就确定put没有作用于服务器状态上，直接返回ErrVersion

如果不是第一次发送的rpc返回的结果，那么如果返回ErrVersion我们并不确认之前的rpc有没有作用于kv服务器状态上。

- **第一种情况**：首次RPC成功，但是响应丢失，已经作用在服务器状态上了，那么就重发Rpc请求会收到ErrVersion。这个情况就是我们要做特别处理的
- **第二种情况**：第一次rpc失败了，重发的也因为版本冲突收到了ErrVersion，聪明的你一定发现了，修改没修改服务器状态，在单一的ErrVersion处理上是完全无法分辨的。所以这里要做特殊处理

#### 解决思路

我们的解决思路就是，分为**首次调用收到回复**和**首次调用没有收到回复**两种情况。

如果收到恢复：
- 是ok，那么就直接返回
- 如果是errversion说明版本错误了，并没有直接作用到server上，所以我们可以直接返回errversion
- 其他类型的错误也可以直接返回，这是非常顺理成章的，因为如果接收到服务端的rpc就说明client是可以确认server的状态的

然后在首次调用失败后，我们会进入一个循环重试当中：
- 如果收到回复是ok,那么是最好的情况，代表第一次rpc在发送过程中丢失了，我们重复的发送rpc请求达到了最好要作用在服务器上的目的
- 如果是ErrVersion,我们就要小心了。不知道rpc是否成功。所以我们返回ErrMaybe
- 如果是其他类型的错误可以直接确定返回，比如说ErrNoKey,说明尝试作用在server上

#### 代码实现

以下为代码实现：

```go
func (ck *Clerk) Put(key, value string, version rpc.Tversion) rpc.Err {

	args := &rpc.PutArgs{Key: key, Value: value, Version: version}
	reply := &rpc.PutReply{}

	// 首次尝试调用
	ok := ck.clnt.Call(ck.server, "KVServer.Put", args, reply)

	if ok {

		if reply.Err == rpc.OK {

			return rpc.OK
		} else if reply.Err == rpc.ErrVersion {
			return rpc.ErrVersion
		}
		if reply.Err == rpc.ErrNoKey {
			return rpc.ErrNoKey
		}
		return reply.Err
	}

	for {
		reply = &rpc.PutReply{}
		ok := ck.clnt.Call(ck.server, "KVServer.Put", args, reply)

		if ok {

			if reply.Err == rpc.OK {

				return rpc.OK
			} else if reply.Err == rpc.ErrVersion {
				return rpc.ErrMaybe
			}
			if reply.Err == rpc.ErrNoKey {
				return rpc.ErrNoKey
			}
			return reply.Err
		}
	}
}
```

这样我们的client部分就完成了。

## Server端实现

然后我们在server中要完成具体的kv存储以及对rpc请求的处理作用在状态机上。

首先按照rpc的格式，应当有对应的版本号，只有版本号相同的key才能进行更新。

### 数据结构定义

定义一个keyValue结构体：

```go
type KeyValue struct {
	Value   string
	Version rpc.Tversion
}
```

用map存到KVServer结构体当中：

```go
type KVServer struct {
	mu sync.Mutex

	data map[string]KeyValue
	// Your definitions here.
}
```

记得在MakeKVServer中初始化。

### Get方法实现

然后写一下get方法，为了解决并发问题，我们需要加锁，然后defer。

1. 直接能从map中找到key,那么就返回
2. 不然就返回ErrNoKey

```go
func (kv *KVServer) Get(args *rpc.GetArgs, reply *rpc.GetReply) {
	// Your code here.
	key := args.Key
	kv.mu.Lock()
	defer kv.mu.Unlock()

	if kvData, ok := kv.data[key]; ok {
		reply.Value = kvData.Value
		reply.Version = kvData.Version
		reply.Err = rpc.OK
	} else {
		reply.Err = rpc.ErrNoKey
	}
}
```

### Put方法实现

put过程就要复杂一点，同样还是上锁。然后拿到key,value：

1. 先处理复杂情况，如果想要更新的值在map当中，判断一下传入的args的version与当前这个key的version是否一致，不一致返回errversion
2. 不然就更新值，增加版本号，返回ok的rpc,这个过程因为lock了，所以是线程安全的
3. 不然，如果args的version是0说明是第一次put,那么就在map中创建一个对应的值
4. 不然就返回errNoKey,因为如果version不是0的话，说明是一个已经存在的key,但是没有传入正确的version

```go
func (kv *KVServer) Put(args *rpc.PutArgs, reply *rpc.PutReply) {
	// Your code here.
	kv.mu.Lock()
	defer kv.mu.Unlock()
	key := args.Key
	value := args.Value
	if kvData, ok := kv.data[key];ok{
		if kvData.Version != args.Version {
			reply.Err = rpc.ErrVersion
			return
		}else{
			kvData.Value = value
			kvData.Version++
			kv.data[key] = kvData
			reply.Err = rpc.OK
		}
	}else{
		if args.Version == 0 {
			kv.data[key] = KeyValue{Value: value, Version: 1}
			reply.Err = rpc.OK
		} else {
			reply.Err = rpc.ErrNoKey
		}
	}
}
```

## 分布式锁实现

然后是要我们实现的一个**Lock**。这个lock是通过这一套kv服务来实现的。

### 结构体定义

首先就是对结构体定义的优化，这里需要一个random的id来区分不同的锁，然后要有一个储存在server上的锁的key。

```go
type Lock struct {
	// IKVClerk is a go interface for k/v clerks: the interface hides
	// the specific Clerk type of ck but promises that ck supports
	// Put and Get.  The tester passes the clerk in when calling
	// MakeLock().
	ck kvtest.IKVClerk

	lid string 
	key string 
}
```

### Acquire方法实现

acquire就是获取锁的流程。

首先检查锁的当前状态：
1. 如果锁可用，也就是为空，那么就尝试获取
2. 如果自己已经持有了这个锁，那么直接返回
3. 如果被其他客户端持有了，就等待

先获取锁的当前状态，用get方法。

对于锁不存在或者锁未被持有的状态，那么直接尝试用put获取锁，key是锁的key，value是自己的id。

如果成功获取锁就返回，如果获取失败返回了ErrMaybe说明锁可能加上了，但是rpc丢失了，这里我们就要再通过get看一下是否作用到了服务端状态只是rpc丢失了。如果验证失败就继续循环获取锁，因为他还没作用到服务端状态上。

如果我们已经持有了锁，那么直接返回。

如果返回了ok,但是value不为空，说明有别的客户端持有了锁，我们就continue做等待。

```go
func (lk *Lock) Acquire() {
	for {
		value, version, err := lk.ck.Get(lk.key)
		if err == rpc.ErrNoKey || (err == rpc.OK && value == "") {
			putErr := lk.ck.Put(lk.key, lk.lid, version)

			if putErr == rpc.OK {
				return
			} else if putErr == rpc.ErrMaybe {
				checkValue, _, checkErr := lk.ck.Get(lk.key)
				if checkErr == rpc.OK && checkValue == lk.lid {
					return
				}
			}

		} else if err == rpc.OK && value == lk.lid {
			return

		} else if err == rpc.OK && value != "" {
			continue

		}
	}
}
```

### Release方法实现

release就是释放锁的过程。

1. 先检查当前是否持有这个锁，如果有锁就尝试把值设置成空字符串
2. 如果不持有就直接返回

还是获取锁的状态，然后如果value等于自己就尝试put空字符串。

如果put成功就返回，如果是errMaybe说明rpc有可能丢失了。我们就再做get确认一下。如果已经释放了就返回。如果锁不是我们持有的就和我们没什么关系了。直接返回。不然就一直重试。

```go
func (lk *Lock) Release() {
	for {
		// 获取锁的当前状态
		value, version, err := lk.ck.Get(lk.key)

		// 情况1: 成功获取锁状态，且确认我们持有这个锁
		if err == rpc.OK && value == lk.lid {
			// 尝试释放锁：将锁的值设置为空字符串
			putErr := lk.ck.Put(lk.key, "", version)

			if putErr == rpc.OK {
				// 成功释放锁
				return
			} else if putErr == rpc.ErrMaybe {
				// Put操作可能成功了，需要验证锁是否真的被释放
				// 这种情况发生在：Put请求成功但响应丢失
				checkValue, _, checkErr := lk.ck.Get(lk.key)
				if checkErr == rpc.OK && checkValue != lk.lid {
					// 验证确认锁已经被释放（值不再是我们的ID）
					return
				}
				// 验证失败，可能锁仍然被我们持有，继续尝试释放
			}


		} else if err == rpc.OK && value != lk.lid {
			return
		}

	}
}
```

## 测试结果

以上，我们的lab2就完成了，我们进行一下测试。

```bash
/mnt/data/coding/mit65840/src/kvsrv1  main  go test -v 
```

得到结果：

```
=== RUN   TestReliablePut
One client and reliable Put (reliable network)...
  ... Passed --  time  0.0s #peers 1 #RPCs     5 #Ops    0
--- PASS: TestReliablePut (0.00s)
=== RUN   TestPutConcurrentReliable
Test: many clients racing to put values to the same key (reliable network)...
info: linearizability check timed out, assuming history is ok
  ... Passed --  time 11.0s #peers 1 #RPCs 50923 #Ops 50923
--- PASS: TestPutConcurrentReliable (11.04s)
=== RUN   TestMemPutManyClientsReliable
Test: memory use many put clients (reliable network)...
  ... Passed --  time  7.7s #peers 1 #RPCs 100000 #Ops    0
--- PASS: TestMemPutManyClientsReliable (13.47s)
=== RUN   TestUnreliableNet
One client (unreliable network)...
  ... Passed --  time  3.4s #peers 1 #RPCs   257 #Ops  210
--- PASS: TestUnreliableNet (3.44s)
PASS
ok  	6.5840/kvsrv1	27.966s
```

以上。