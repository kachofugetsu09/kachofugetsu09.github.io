在java当中我们常用的数据结构有list,map,set,deque，我们用一个javaer的视角去对go当中的集合api进行学习。

## Map 数据结构

首先从 Java 中常用的 `HashMap` 入手，我们来看一下 Go 中如何使用 `map`。

### 创建和初始化

在 Go 中，我们使用 `make` 函数来创建一个 `map`。

```go
m := make(map[int]string)
```

方括号 `[int]` 中是 key 的类型，而 `string` 是存储的 value 的类型。

需要注意的是，`map` 的 **key 必须是可比较的类型**。这类似于 Java 中要求 key 的类必须重写 `equals` 和 `hashCode` 方法。对于自定义的 `struct` 来说，如果它包含 `slice`、`function` 或 `map` 这样的不可比较字段，那么它就不能被用作 key。

### 添加元素

在 Go 中，我们不需要 `put` 方法，可以直接使用中括号来添加或修改元素，语法和访问数组类似。

```go
for i:=0;i<5;i++{
    m[i] = "value"+fmt.Sprintf("%d",i)
}
```

### 遍历

Go 语言使用 `range` 关键字来遍历 `map`，这类似于 Java 的 `entrySet()` 方法。

```go
for k,v := range m{
    fmt.Println(k,v)
}
```

值得注意的是，Go 的 `map` 遍历是**无序的**。

### 访问不存在的 Key

在 Go 中，如果访问一个不存在的 key，**不会像 Java 一样抛出空指针异常**，而是返回该数据类型的**零值**。

```go
value:=m[7]
fmt.Println(value)
fmt.Println("test")
```

上面的代码只会打印出 `test`，因为 `value` 会被赋值为 `string` 类型的零值（空字符串）。

为了更优雅地处理这种情况，Go 提供了**双返回值模式**。第一个返回值是 `value`，第二个返回值 `ok` 是一个布尔值，当 key 存在时为 `true`，不存在时为 `false`。

```go
value,ok := m[7]
if !ok{
    fmt.Println("key not found")
}else{
    fmt.Println(value)
}
```

### 删除元素

可以使用内置的 `delete` 函数来删除 `map` 中的元素。

```go
fmt.Println(len(m))
delete(m,2)
delete(m,7)
fmt.Println(len(m))
```

`delete` 函数的第一个参数是要删除元素的 `map`，第二个参数是要删除的 `key`。`len(m)` 函数可以直接返回 `map` 的长度。

**总结**：Go 的 `map` 语法在添加、访问和删除元素时，感觉上更接近于 Java 中使用数组的方式。

**注意**：`map` 是一种引用类型，它底层包含指针。这意味着，如果你将一个 `map` 传入函数或 `goroutine`，传递的只是底层数据结构的引用。这可能会导致数据竞争和并发安全问题。之所以选择传递引用而不是深拷贝，是为了避免昂贵的内存分配和拷贝操作。


## Slice (切片) 数据结构

在 Go 中，`slice` 对应于 Java 的 `ArrayList`。它是一个动态数组。

### 创建和初始化

可以通过 `make` 函数来创建一个 `slice`。语法是 `make([]Type, length, capacity)`。

```go
// 创建一个长度为0的切片
s :=make([]int,0)
```

你也可以像数组一样直接使用初始化值来创建一个 `slice`：

```go
ss := []int{1,2,3}
```

### 访问元素

获取 `slice` 中的值也和数组一样简单。

```go
second := s[1]
```

**注意**：当访问的索引超过 `slice` 的长度时，会发生 `panic`。

```
panic: runtime error: index out of range [3] with length 3
```

### 添加元素

可以使用 `append` 函数来向 `slice` 中添加新元素。

```go
s = append(s, 1)
```

你可能会疑惑为什么必须用原本的 `s` 来接收 `append` 的返回值。这是因为 `append` 函数在 `slice` 容量不足时，会进行扩容，并返回一个新的 `slice`。将返回值重新赋值给 `s`，可以确保 `s` 始终指向最新的底层数组，避免频繁的内存分配和拷贝操作。

-----

## Set 的实现

Go 语言**没有原生的 `Set` 类型**。通常我们通过 `map` 来模拟 `Set`。

思路是将 `map` 的 **key** 作为 `Set` 的元素，而 `value` 使用一个空的结构体 `struct{}`。这样做的好处是空结构体不占用内存，可以节省空间。

```go
set := make(map[string]struct{})

set["a"] = struct{}{}
set["b"] = struct{}{}
set["c"] = struct{}{}
set["a"] = struct{}{} // 再次添加"a"，map会覆盖旧值，但长度不变
fmt.Println(len(set)) // 打印3
```

要判断一个元素是否存在，同样使用 `map` 的双返回值模式。

```go
_,ok := set["a"]
if ok{
    fmt.Println("key found")
}
```

## 队列 (Queue) 的实现

### FIFO 队列

在 Go 中，我们通常使用 `slice` 来实现一个简单的 FIFO 队列。

  * **入队 (Enqueue)**：使用 `append` 函数将新元素添加到 `slice` 的尾部。
  * **出队 (Dequeue)**：获取 `slice` 的第一个元素 (`slice[0]`)，然后通过切片操作 (`deque = deque[1:]`) 移除它。

<!-- end list -->

```go
func deque_test(){
    deque := make([]int,0)
    deque = append(deque, 1)
    deque = append(deque,2)

    poll_element := deque[0]
    fmt.Println(poll_element)
    deque = deque[1:]
}
```

### 双端队列 (Deque)

如果需要一个双端队列，可以使用 Go 标准库中的 `container/list` 包。它是一个双向链表，可以满足双端队列的操作。

```go
func deque_test2(){
    l := list.New()
    l.PushBack(1)
    l.PushBack(2)
    l.PushFront(3)
    last := l.Back()
    fmt.Println(last)
    t :=l.Remove(l.Back())
    fmt.Println(t)
    l.Remove(l.Front())
}
```