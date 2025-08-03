我始终认为，在编程语言当中最为重要的东西就是控制流，它决定了程序的执行逻辑和顺序。在 Java 中有几种重要的控制流，我们将它们与 Rust 中的对应语法进行对比。

Java 中比较重要的控制流有 `if`/`else`/`else if`（`if` 家族）、`while` 循环（达到某个条件前一直循环）、`for` 循环（遍历）、`switch`（多分支）以及 `try`/`catch`/`finally`（异常处理）。

我们来一一进行对号入座。


## `if` 家族

在 Rust 中，`if` 的使用方法几乎与 Java 一致，但更像 Go 语言，不带括号。

```rust
fn if_else(){
    let number = 7;
    if number < 5 {
        println!("is smaller than 5");
    }
    else {
        println!("is bigger than 5");
    }
}
```

这样就实现了一个值的 `if`/`else` 判断。`else if` 的代码与 Java 中类似，这里不再赘述。

Rust 的 `if` 语句也是一个表达式，这意味着它**可以返回值**。

```rust
let result = if number % 2 == 0 {
    "even" // 不需要分号
} else {
    "odd"  // 不需要分号
};
println!("The number is {}", result);
```


## `while` 循环

与 Java 中的 `while` 循环类似，可以在外部定义一个变量，然后在 `while` 循环中检查是否达到某个条件，达到后就终止循环。

```rust
let mut count = 0;
while count < 5 {
    println!("{}", count);
    count += 1;
}
```


## `for` 循环

Rust 的 `for` 循环主要用于**遍历**，类似于 Java 中的增强 `for` 循环（for-each）。

## 增强 `for` 循环

第一种常见的用法是直接遍历某个集合中的元素：

```rust
fn simple_for(){
    let a = [10, 20, 30, 40, 50];

    for element in a {
        println!("the value is: {}", element);
    }
}
```

### 常规 `for` 循环（基于范围和迭代器）

Rust 并没有像 Java 那样的传统 `for (int i=0; i<n; i++)` 语法，但通过\*\*范围（range）**和**迭代器（iterator）\*\*提供了更灵活和安全的遍历方式：

```rust
let names = ["Alice", "Bob", "Charlie"];
for name in names.iter() { // .iter() 返回一个迭代器，遍历集合元素的引用
    println!("{}", name);
}

// 遍历数字范围 (exclusive，左闭右开)
for number in 1..4 { // 1, 2, 3
    println!("{}", number);
}

// 遍历数字范围 (inclusive，左闭右闭)
for number in 1..=4 { // 1, 2, 3, 4
    println!("{}", number);
}

// 使用 .enumerate() 同时获取索引和值
for (index, name) in names.iter().enumerate() {
    println!("Index: {}, Name: {}", index, name);
}
```


### `loop` 循环

Rust 中有一个特别的 `loop` 循环，它类似于 Java 中的 `while(true)` 无限循环。需要达到某个条件手动使用 `break` 才能跳出。

```rust
fn return_from_loop(){
    let mut counter = 0;
    let result = loop {
        counter += 1;

        if counter == 10 {
            break counter * 2; // break 后可以跟着表达式，将值返回给 result
        }
    };
    println!("The result is {}", result); // 输出: The result is 20
}
```

这是 `loop` 的常规用法，`result` 会拿到 `loop` 循环最后 `break` 表达式的结果。在 Java 中 `break` 通常不返回结果，但在 Rust 中，`break` 后面可以跟着对应的结果进行返回。

同时，Rust 对于多层 `loop` 循环提供了灵活性，可以直接在内层循环使用 `break 'label` 来跳出指定的外部循环。

```rust
fn loop_test (){
    let mut count = 0;
    'counting_up: loop { // 外部循环标签
        println!("count = {}", count);
        let mut remaining = 10;

        loop { // 内部循环
            println!("remaining = {}", remaining);
            if remaining == 9 {
                break; // 跳出当前内部循环
            }
            if count == 2 {
                break 'counting_up; // 跳出带 'counting_up 标签的外部循环
            }
            remaining -= 1;
        }
        count += 1;
    }
    println!("count is {}", count);
}
```

通过这种方式，在 `count == 2` 的时候，程序会直接跳出带有 `'counting_up` 标签的外层循环，从而直接终止整个循环逻辑。


## `match` 多分支

在 Rust 中，与 Java 的 `switch` 语句效果对应的，是功能更强大且是**穷尽性**的 `match` 关键字。

假如我们的 Java 代码是这样的：

```java
int day = 3;
String dayName;
switch (day) {
    case 1: dayName = "Monday"; break;
    case 2: dayName = "Tuesday"; break;
    default: dayName = "Unknown";
}
System.out.println(dayName);
```

对应的 Rust 代码是这样的：

```rust
let day = 3;
let day_name = match day {
    1 => "Monday",
    2 => "Tuesday",
    3 => "Wednesday",
    _ => "Unknown", // _ 是通配符，必须覆盖所有可能性
};
println!("{}", day_name);
```

这里的 `_` 就是 Java 中 `default` 的效果。`match` 语句在 Rust 中是一个强大的控制流结构，它不仅可以匹配常量，还可以匹配范围、枚举、元组等复杂数据结构。

如下例子所示，`match` 提供了比 Java 中 `switch` 更强大的多分支匹配能力，尤其在处理**枚举类型及其关联数据**时显得非常强大：

```rust
enum Coin {
    Penny,
    Nickel,
    Dime,
    Quarter(UsState), // 关联数据
}

enum UsState {
    Alabama,
    Alaska,
    // ...
}

fn value_in_cents(coin: Coin) -> u8 {
    match coin {
        Coin::Penny => 1,
        Coin::Nickel => 5,
        Coin::Dime => 10,
        Coin::Quarter(state) => { // 匹配并解构关联数据
            println!("State quarter from {:?}!", state);
            25
        },
    }
}
```


## 异常处理（错误处理）

在异常处理上，Rust 的哲学与 Java 有很大的不同，它远比 Java 复杂且强制开发者在编译时就处理错误。Rust 没有 Java 那样的 `try`/`catch`/`finally` 语句，而是倾向于使用**结果类型 (`Result<T, E>`)** 来处理可恢复的错误，以及 `panic!` 宏来处理不可恢复的错误。详细可以看这篇文章[rust当中的错误处理](./rust当中的错误处理.md)

这里只做简单讲解，Rust 通过 `match` 表达式来处理 `Result` 类型：

```rust
use std::fs::File;
use std::io::ErrorKind; // 需要导入 ErrorKind 来匹配特定的 IO 错误

fn main() {
    let f = File::open("hello.txt"); // File::open 返回 Result<File, io::Error>

    let f = match f {
        Ok(file) => file, // 如果成功，得到文件句柄
        Err(error) => match error.kind() { // 如果失败，根据错误类型进行匹配
            ErrorKind::NotFound => match File::create("hello.txt") { // 如果是文件未找到
                Ok(fc) => fc, // 尝试创建文件，如果成功，得到文件句柄
                Err(e) => panic!("Problem creating the file: {:?}", e), // 创建失败，程序崩溃
            },
            other_error => panic!("Problem opening the file: {:?}", other_error), // 其他错误，程序崩溃
        },
    };

    println!("File opened/created successfully!");
}
```

当没有异常（错误）时，代码会进入 `Ok` 分支；否则会进入 `Err` 分支。在 `Err` 分支中，又可以根据错误的具体类型 (`ErrorKind`) 进行不同的处理。


总而言之，Rust 的控制流在很多地方的用法与 Java 是相似的，但在像 `match` 和 `loop` 等方面提供了更灵活、更强大的功能。尤其是在错误处理上，Rust 强制性的 `Result` 类型让开发者在编译阶段就处理错误，从而避免了运行时未捕获异常带来的问题，有助于编写更健壮的程序。

