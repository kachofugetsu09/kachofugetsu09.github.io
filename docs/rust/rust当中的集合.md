作为一名 javaer，我们非常熟悉 `ArrayList`、`HashSet` 和 `HashMap` 这些常用的集合类，以及数组和队列等基础数据结构。我们以此作为视点，展开我们对 Rust 中集合类型和数据结构的理解。


## 动态数组：`Vec<T>`

在 Rust 中，**动态数组**通常使用 `Vec<T>` 来表示，其中 `T` 是元素的类型。`Vec<T>` 是一个可变长度的数组，可以动态地添加或删除元素。它的数据存储在堆上，是需要动态大小数组时的首选。

```rust
let mut numbers = Vec::new();
numbers.push(1);
numbers.push(2);
numbers.push(3);
println!("{:?}", numbers); // 输出: [1, 2, 3]

let first = &numbers[0]; // 访问元素
println!("First element: {}", first);
```

你可以通过 `push` 方法向 `Vec` 中添加元素，使用索引访问元素。同时，也可以通过 `get` 方法获取对应索引的元素，或者使用 `vec!` 宏来创建一个带初始值的 `Vec`。

```rust
let numbers = vec![1, 2, 3, 4, 5]; // 使用宏创建 Vec
println!("{:?}", numbers); // 输出: [1, 2, 3, 4, 5]
// 使用闭包安全地访问第一个元素，避免直接索引可能导致的panic
numbers.get(0).map(|x| println!("First element: {}", x));
```


## 哈希映射：`HashMap`

在 Rust 中，哈希表也使用 `HashMap` 来进行键值 (KV) 存储，类似于 Java 的 `HashMap`。

需要注意的是，你需要使用 `mut` 关键字来声明一个可变的 `HashMap`。此外，`get` 方法返回的是 `Option` 类型,前文讲解Option的时候提及过，因此你需要使用 `match` 或 `if let` 来处理可能不存在的 `None` 值。

```rust
use std::collections::HashMap;

let mut scores = HashMap::new();
scores.insert(String::from("Alice"), 90);
scores.insert(String::from("Bob"), 85);

if let Some(score) = scores.get("Alice") {
    println!("Alice's score: {}", score); // 输出: Alice's score: 90
}
```


## 哈希集合：`HashSet`

在 Rust 中，不可重复无序集合使用 `HashSet`，与 Java 的 `HashSet` 功能类似。

```rust
use std::collections::HashSet;

let mut unique_numbers = HashSet::new();
unique_numbers.insert(1);
unique_numbers.insert(2);
unique_numbers.insert(1); // 再次插入1，不会有影响

println!("{:?}", unique_numbers); // 输出可能为 {1, 2} 或 {2, 1}
println!("Contains 2: {}", unique_numbers.contains(&2)); // 输出: Contains 2: true
```


## 数组与切片

### 数组：`[T; N]`

在 Rust 中，**数组** (`[T; N]`) 是**固定大小**的同类型元素集合。它的长度在编译时就确定了，且不可更改。数组中的元素通常直接存储在栈上（如果它们不大），或者嵌入在包含它们的结构体中。

```rust
let arr: [i32; 5] = [1, 2, 3, 4, 5]; // 定义一个包含5个i32的定长数组
println!("Array: {:?}", arr); // 输出: [1, 2, 3, 4, 5]
```

### 切片：数组或 `Vec` 的“引用视图”

当你需要处理数组或 `Vec` 的一部分数据时，**切片**就派上用场了。切片本身不拥有数据，它只是一个**引用**，指向内存中一段连续的数据序列。这使得它在传递数据时非常高效，因为它避免了数据的复制。

切片有两种主要类型：

  * **不可变切片 (`&[T]`)**: 这是最常见的切片类型。它允许你**读取**切片中的数据，但不能对其进行修改。你可以同时创建多个不可变切片指向同一块数据。

    ```rust
    let arr: [i32; 5] = [1, 2, 3, 4, 5];
    let slice_immutable = &arr[1..4]; // 创建一个不可变切片，引用 arr 的元素 1 到 3
    println!("Immutable Slice: {:?}", slice_immutable); // 输出: [2, 3, 4]

    // Vec 也可以创建切片，用法完全相同
    let numbers_vec = vec![10, 20, 30, 40, 50];
    let vec_slice_immutable = &numbers_vec[0..2]; // 引用 numbers_vec 的元素 0 到 1
    println!("Vec Slice: {:?}", vec_slice_immutable); // 输出: [10, 20]
    ```

  * **可变切片 (`&mut [T]`)**: 当你需要**修改**切片所引用的数据时，就使用可变切片。然而，可变切片的使用受到 Rust 严格的**借用规则**限制，这是为了确保内存安全，避免数据竞争：

      * **同一时间，对某一段数据，你只能拥有一个可变引用（包括可变切片）。**
      * **可变引用和不可变引用不能同时指向同一段数据。**

    这意味着，如果你有了一个指向 `numbers_vec[1..4]` 的可变切片，那么在它活跃期间，你既不能再创建另一个可变切片（即使是部分重叠，比如 `numbers_vec[2..5]`），也不能创建任何不可变切片来查看这段或重叠的数据。

    ```rust
    let mut data = vec![100, 200, 300, 400, 500];

    // 示例：正确使用可变切片
    let slice_mutable = &mut data[1..4]; // 获取 data[1], data[2], data[3] 的可变切片
    println!("Before modify: {:?}", slice_mutable); // 输出: [200, 300, 400]
    slice_mutable[0] = 250; // 通过可变切片修改元素
    println!("After modify: {:?}", slice_mutable);  // 输出: [250, 300, 400]
    // 此时 slice_mutable 仍在作用域内，不能有其他引用

    // 如果尝试这样做，编译器会报错：
    // let other_mutable_slice = &mut data[2..5]; // 错误！与 slice_mutable 重叠在 data[2]
    // let immutable_slice = &data[1..2]; // 错误！与 slice_mutable 重叠

    println!("Original data after slices: {:?}", data); // 输出: [100, 250, 300, 400, 500]
    ```


## 队列：`VecDeque`

Rust 中会使用 `VecDeque` 来实现**双端队列 (Deque)**。`VecDeque<T>` (Vector Deque，双端队列) 是一个高效的队列实现，允许在两端 (`push_front`/`pop_front` 和 `push_back`/`pop_back`) 快速添加和移除元素。它基于环形缓冲区实现，性能通常优于链表。

```rust
use std::collections::VecDeque;

let mut queue = VecDeque::new();
queue.push_back(10); // 从队尾入队
queue.push_back(20);
queue.push_front(5); // 从队头插入

println!("Queue: {:?}", queue); // 输出: VecDeque([5, 10, 20])

if let Some(front) = queue.pop_front() { // 从队头出队
    println!("Popped from front: {}", front); // 输出: Popped from front: 5
}
if let Some(back) = queue.pop_back() { // 从队尾出队
    println!("Popped from back: {}", back); // 输出: Popped from back: 20
}
println!("Remaining queue: {:?}", queue); // 输出: VecDeque([10])
```


## Rust 中额外的常用数据结构：`Tuple`

在 Rust 中，**元组 (tuple)** 是一种可以存储不同类型数据的集合。元组的大小是固定的，并且可以包含多种类型的数据。元组使用圆括号 `()` 来定义。

```rust
// 函数返回多个值
fn get_user_info() -> (String, u32, bool) {
    ("Alice".to_string(), 30, true)
}

fn main() {
    // 创建一个元组
    let person_data = ("Bob", 25, "Engineer");
    println!("Name: {}, Age: {}, Occupation: {}", person_data.0, person_data.1, person_data.2);

    // 通过模式匹配解构元组
    let (name, age, _is_admin) = get_user_info();
    println!("User: {}, Age: {}", name, age);

    // 单元元组 ()
    let unit_tuple = (); // 这是最简单的元组，表示“无值”，是许多不返回任何值的函数的隐式返回值
    println!("Unit tuple: {:?}", unit_tuple);
}
```

以上就是 Rust 中一些常用的集合类型和数据结构。可以看出，虽然在命名和具体使用上与 Java 有所不同，但核心概念和应用场景是相似的。Rust 在此基础上，通过所有权和借用机制提供了更强大的内存安全保证。

