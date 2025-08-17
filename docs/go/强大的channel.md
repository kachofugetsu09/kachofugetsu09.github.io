> Do not communicate by sharing memory; instead, share memory by communicating.

Go 与 Java 最大的不同，我觉得就在于它超强的并发能力，功能强大的 **channel** 以及 **goroutine** 了。

**channel** 是用于 Go 语言中提供协程与协程之间通信的机制。如果硬要用 Java 来类比，那它就是 Java 当中的**阻塞队列**。发送者向这个线程安全的集合中添加元素，接收者从这个线程安全的集合当中拿到元素。

如果你是 Rust，你能理解我在说什么，Go 当中的 channel 机制与 Rust 当中是类似的，只不过 Rust 我认为在这方面做得更好更彻底。本质上不是在共享同一个数据，而是真的把数据放到了这个 channel 这个履带上去，运输到接收者那里。Rust 当中在发送后意味着**所有权被转移了**，接收者拿到所有权后，发送者就无法再使用这个数据了。Go 这里做的没有这么彻底，在 channel 传递的时候不是将真正的对象传递过去，而是传递这个值的副本，但是这个副本中的指针仍然指向最底层的值。

有一点对比 Rust 来说 Go 非常糟糕的设计在于，它的安全需要程序员的自律。Rust 的编译器不再是你的监督者，你的外接大脑了。假设你创建了一个 slice 或者 map，把它放入 channel，接收者修改了，然后你作为一个发送者，在 Go 当中你又修改了这个数据，那它又重回原本的**共享内存**的老路了。所以它依赖程序员的自我规范，需要知道什么时候是安全的，什么时候我该通过 channel 发过去。


## 阻塞 channel

以单生产者、单消费者举例，阻塞 channel 的语法是在创建 channel 的时候不指定缓冲区的大小。在生产者每次生产数据后，都要保证接收者接收到这个数据，在发送后处于阻塞状态，直到被接收者接收后唤醒继续生产数据。

以代码举例：

```go
func main() {
	test_stop()
}

func test_stop(){
	ch := make(chan int)
	
	go func(){
		for i:=0; i<5; i++{
			fmt.Println("发送数字 ", i)
			ch <- i
			time.Sleep(1)
		}
		
		fmt.Println("运行到了阻塞代码块的后面")
		close(ch)
	}()
	
	for num := range ch{
		fmt.Println("接收成功 ", num)
	}
}
```

输出如下：

```
发送数字  0
发送数字  1
接收成功  0
接收成功  1
发送数字  2
发送数字  3
接收成功  2
接收成功  3
发送数字  4
运行到了阻塞代码块的后面
接收成功  4
```

可以看到，发送者在发送完数据后，会阻塞直到接收者接收完数据，然后继续发送数据。因为生产者不是一直向 channel 发送数据，而是需要等待消费者接收完数据后才能继续发送。这样可以保证数据的完整性和一致性，但是会降低效率。


## 非阻塞 channel

非阻塞 channel 的实现流程也很简单，当你设定 channel 的大小的时候也就是这个“阻塞队列”的大小的时候，它的运作逻辑就是只有这个 channel 缓冲区满了生产者才阻塞，不然一直生产。

```go
func sync_test(){
	ch := make(chan int, 3)
	var wg sync.WaitGroup

	// 生产者
	wg.Add(1) // 标记一个生产者
	go func(){
		defer wg.Done()
		for i := 0; i < 5; i++ {
			fmt.Println("producer produce number ", i)
			ch <- i
		}
		fmt.Println("运行到了阻塞代码块的后面")
	}()

	// 消费者 Goroutine
	go func(){
		for num := range ch {
			fmt.Println("consumer consume number ", num)
			time.Sleep(2 * time.Millisecond) 
		}
	}()
	
	wg.Wait()
	// 生产者完成后，关闭 Channel
	close(ch)
	
	// 留出时间让消费者处理完所有数据
	time.Sleep(100 * time.Millisecond)
	fmt.Println("All goroutines finished.")
}
```

你得到的结果可能是这样的：

```
producer produce number  0
producer produce number  1
producer produce number  2
producer produce number  3
producer produce number  4
consumer consume number  0
consumer consume number  1
运行到了阻塞代码块的后面
consumer consume number  2
consumer consume number  3
consumer consume number  4
```

这里要注意的是，**close** 类似于 Java 当中的**优雅关闭**，比如说发送方调用了，这代表不会有新的发送者消息进入，而消费者仍然会继续消费已经存在的消息，等到消费完成所有已经存在的消息后，也会关闭消费端的 channel，这样就真正关停了 channel，类似于 Java 当中的优雅关闭方法，类似 `shutdown` 而不是 `shutdownnow`。

利用channel这个强大的功能我们就完成了同步和异步的线程间通信，我们仍然用一种同步的方式去编写代码，但是可以得到异步的结果，这也是channel的最迷人的地方。我们再也不用面对繁琐的completablefuture了。

## select多路复用
在Java中做多路复用很不舒服，你得用 `Selector`。你需要把 `channel` 注册到 `selector` 上，然后 `while(true)` 做监听。

在Go中我们可以使用 `select` 关键字。用我写过的一个Raft代码举一个生动的例子。因为 `channel` 成为了通信的桥梁，所以在Go中写这种多路复用是非常方便的。

```go
timeout := time.After(time.Duration(200) * time.Millisecond)

for {
    select {
    case voteGranted := <-voteCh:
        responsesReceived++
        if voteGranted {
            votesReceived++
        }

        rf.mu.Lock()
        if rf.state != Candidate || rf.currentTerm != currentTerm {
            rf.mu.Unlock()
            return
        }

        if votesReceived >= len(rf.peers)/2+1 {
            rf.becomeLeader()
            rf.mu.Unlock()
            return
        }

        if responsesReceived >= maxResponses {
            rf.mu.Unlock()
            return
        }
        rf.mu.Unlock()

    case <-timeout:
        rf.mu.Lock()
        if rf.state == Candidate && rf.currentTerm == currentTerm {
            if votesReceived >= len(rf.peers)/2+1 {
                rf.becomeLeader()
            }
        }
        rf.mu.Unlock()
        return
    }
}
```

在这部分代码中，我们先使用了 `time.After` 这个API，它会返回一个 `channel`。`voteCh` 也是一个我们投票所用到的 `channel`。

我们用 `for` 写一个死循环。在 `select` 中包裹两个 `case`：

1.  一个是收到了传回来的RPC，然后对投票结果进行处理。
2.  另一个是超时，如果超时了就判断是不是能当选，然后 `return` 跳出。

这样在同一个协程当中，我们就可以持续不断处理多个 `channel` 了。