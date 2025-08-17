## 值类型

Go 当中的基本数据结构，包括 `int`, `float`, `complex`, `string`, `bool` 在内的所有类型，都是**值类型**。在传递时，它会对值进行**拷贝**，而不是直接传递内存地址。

用 `int` 类型来具体看看是什么情况。

```go
func test_data_type1(){
	x:= 1
	y :=x
	z := &x
	x++
	fmt.Printf("%d and %d and %d",x,y,*z)
}
````

这里让 `x` 的值一开始为 1，`y` 拿到 `x` 的值，`z` 拿到 `x` 的地址。然后 `x` 的值加 1 后，`y` 仍然是复制时的值 1，而 `z` 的值是 2，因为在最后打印时，它取的是这个地址上的值，也就等价于 `x` 的值。

打印结果：

```
2 and 1 and 2
```

我们的自定义结构体只要只使用值类型，效果是一样的。

用一个通道来做示例，一个协程发送过去，另一个协程收到后修改，在本地协程做打印。

```go
type Person struct{
	Name string
	Age int
}
var pch chan Person
func test_data_type() {
	var wg sync.WaitGroup
	pch = make(chan Person)

	// 第一个协程，用于发送数据
	wg.Add(1)
	go func() {
		defer wg.Done()
		person := Person{
			"huashen",
			21,
		}

		// 向通道发送数据
		fmt.Println("Sender: Sending data...")
		pch <- person
		fmt.Println("Sender: Data sent.")

		// 关闭通道
		close(pch)

		// 等待接收方处理，这里使用短暂停顿来确保接收方有足够时间处理
		time.Sleep(10 * time.Millisecond)

		// 打印原始数据，注意这里是协程内部的 person，不受外部协程影响
		fmt.Printf("Sender: Original person is %s, %d\n", person.Name, person.Age)
	}()

	// 第二个协程，用于接收数据并修改
	wg.Add(1)
	go func() {
		defer wg.Done()
		// 从通道接收数据
		fmt.Println("Receiver: Waiting for data...")
		p := <-pch
		fmt.Println("Receiver: Data received.")

		// 修改接收到的数据
		p.Name = "huashen2"
		p.Age = 22
		fmt.Printf("Receiver: Modified person to %s, %d\n", p.Name, p.Age)
	}()

	// 等待所有协程完成
	wg.Wait()
	fmt.Println("All goroutines finished.")
}
```

打印结果是：

```
Receiver: Waiting for data...
Sender: Sending data...
Sender: Data sent.
Receiver: Data received.
Receiver: Modified person to huashen2, 22
Sender: Original person is huashen, 21
All goroutines finished.
```

本地的 `person` 并没有被修改。因为发到通道里本质上是值的**副本**。


## 引用类型

我们用一个切片的例子来做对比：

```go
func modifySlice(c chan []int) {
	s := <-c
	fmt.Println("接收方收到 slice:", s)
	
	s[0] = 99
	fmt.Println("接收方修改 slice 后:", s)
	
	time.Sleep(1 * time.Second)
	
	close(c)
}

func slice_test() {
	mySlice := []int{10, 20, 30}
	fmt.Println("发送方原始 slice:", mySlice)

	c := make(chan []int)
	
	go modifySlice(c)

	c <- mySlice
	
	// 等待 channel 关闭
	_, ok := <-c
	for ok {
		_, ok = <-c
	}
	
	fmt.Println("发送方在接收方修改后，本地 slice 变为:", mySlice)
}
```

得到输出：

```
发送方原始 slice: [10 20 30]
接收方收到 slice: [10 20 30]
接收方修改 slice 后: [99 20 30]
发送方在接收方修改后，本地 slice 变为: [99 20 30]
```

可以看到，在接收方修改后，本地的 `slice` 数据也发生了变化。这是因为 `slice`, `map`, `channel` 都是**包含指针的复合类型**，它们在传递时会把**指针**传递过去。所以，修改了接收方的 `slice`，也就修改了发送方的 `slice`。

