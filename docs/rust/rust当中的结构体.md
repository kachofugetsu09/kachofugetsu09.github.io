

# Rust 中的结构体 (Struct) 与特征 (Trait)


## 结构体 (Struct) 与其实现 (Impl)

在 Java 中，我们习惯于使用 `class` 来定义一个类，它包含了数据（字段）和行为（方法）。例如，我们可能这样定义一个 `Rectangle` 类来记录长宽并计算面积：

```java
public class Rectangle {
    private double length;
    private double width;

    public Rectangle(double length, double width) {
        this.length = length;
        this.width = width;
    }

    public double getArea() {
        return length * width;
    }
}
```

在 Rust 中，我们使用 **`struct`** 关键字来定义一个结构体。它更像是 Java 类中只定义字段的部分，不包含方法：

```rust
struct Rectangle {
    width: u32,
    height: u32,
}
```

当我们想给结构体添加方法时，我们需要使用 **`impl`** 关键字。你可以将 `impl` 块看作是对 Java 中指定某个类添加方法。例如，为 `Rectangle` 结构体添加一个计算面积的方法：

```rust
impl Rectangle {
    fn area(&self) -> u32 {
        self.width * self.height
    }
}
```

这样就成功添加了一个 `area` 方法。传入的 `&self` 是一个指向当前结构体实例的引用，类似于 Java 中的 `this`。一个 `struct` 可以拥有多个 `impl` 块，这有助于将不同的功能分开实现，从而增加代码的可读性和可维护性。

-----

### 结构体的字段更新语法

假设我们有一个 `User` 结构体：

```rust
struct User {
    active: bool,
    username: String,
    email: String,
    sign_in_count: u64,
}
```

当我们想要创建一个新实例，但其中大部分字段与现有实例相同，只有少数字段不同时，可以使用结构体更新语法。这类似于 Java 中通过构造函数或 setter 方法部分复制对象，但在 Rust 中语法更简洁：

```rust
let mut user1 = build_user(String::from("2494946808@qq.com"), String::from("huashen666"));
user1.email = String::from("huashen666@666.com");

let user2 = User {
    email: String::from("huashen@example.com"),
    ..user1 // 使用user1的其他字段
};
```

这里 `..user1` 表示将 `user1` 中除了 `email` 字段以外的其他字段都复制到 `user2` 中。

-----

## 特征 (Trait) - Rust 的接口与更多

**`trait`** 关键字是 Rust 中另一个非常重要的概念。它类似于 Java 中的接口，但功能更为强大。在 Java 中，有时会遇到一个接口设计得过于宽泛，导致某些实现者无需实现所有方法的情况，这时我们可能需要将接口拆分得更小。而 Rust 的 `trait` 提供了更强大的灵活性。

`trait` 是一种契约，它定义了类型可以拥有的共享行为。更重要的是，它**可以提供默认实现**：

```rust
pub trait Summary {
    fn summarize(&self) -> String {
        String::from("default summary")
    }
}
```

这个 `Summary` trait 定义了一个 `summarize` 方法，并提供了一个默认实现。这意味着，如果一个类型实现了 `Summary` trait 但没有覆盖 `summarize` 方法，它将直接使用这个默认实现。

-----

### 为结构体实现特征 (Trait)

假设我们定义了一个 `NewArticle` 结构体：

```rust
pub struct NewArticle {
    pub headline: String,
    pub location: String,
    pub author: String,
    pub content: String,
}
```

要为 `NewArticle` 实现 `Summary` trait，我们使用 `impl Trait for Struct` 的格式：

```rust
impl Summary for NewArticle {
    fn summarize(&self) -> String {
        format!("{}:{}", self.headline, self.location)
    }
}
```

我们在这里覆盖了默认的 `summarize` 方法，提供了 `NewArticle` 特有的摘要实现。

-----

### 特征约束与泛型

以下是作为 Java 开发者可能会感到“羡慕”的地方：Rust 允许你为实现了特定 trait 的泛型类型提供特定的 `impl` 实现。

考虑一个泛型结构体 `Pair`，它存储两个相同类型的泛型值 `T`：

```rust
struct Pair<T> {
    x: T,
    y: T,
}
```

我们可以像通常一样为它提供一个 `new` 方法：

```rust
impl<T> Pair<T> {
    fn new(x: T, y: T) -> Self {
        Self {
            x,
            y,
        }
    }
}
```

现在，如果我们的需求是这个 `Pair` 只有在它的泛型类型 `T` **可以进行比较**时才提供比较大小的功能。在 Java 中，这通常需要 `T` 继承 `Comparable` 接口，然后可能需要进行一些额外的类型处理。但在 Rust 中，你可以**针对实现了特定 trait 的泛型特化提供 `impl` 实现**：

```rust
impl<T: Display + PartialOrd> Pair<T> {
    fn cmp_display(&self) {
        if self.x >= self.y {
            println!("The largest member is x = {}", self.x);
        } else {
            println!("The largest member is y = {}", self.y);
        }
    }
}
```

这里：

  * **`Display`** 类似于 Java 中的 `toString()` 功能，允许类型被格式化输出。
  * **`PartialOrd`** 类似于 Java 中的 `Comparable` 接口，提供了部分排序能力（例如 `>`、`<`、`>=`、`<=`）。

这意味着，如果你传入的类型 `T` 没有同时实现 `Display` 和 `PartialOrd` 这两个 trait，那么这个 `cmp_display` 方法将不会被编译到 `Pair` 类型中。这给了我们极大的灵活性，不必让整个类都实现某个接口，而是可以特化地为某些满足条件的泛型类型提供特定的实现。

-----

### 严格的类型与特征约束

Rust 的类型系统非常严格，这有助于提高代码的安全性。例如，如果我们想编写一个泛型函数 `largest` 来找出列表中最大的元素：

```rust
fn largest<T>(list: &[T]) -> T {
    let mut largest = list[0];

    for &item in list.iter() {
        if item > largest { // 这里会报错！
            largest = item;
        }
    }

    largest
}
```

直接这样写会报错：

```
binary operation > cannot be applied to type T (rustc E0369)
hint: consider restricting type parameter `T` with trait `PartialOrd`: `: std::cmp::PartialOrd`
```

错误提示很明确：类型 `T` 没有实现 `PartialOrd` trait，因此不能进行 `>` 比较。我们加上 `PartialOrd` 约束：

```rust
fn largest<T: PartialOrd>(list: &[T]) -> T {
    let mut largest = list[0]; // 这里仍然会报错！

    for &item in list.iter() {
        if item > largest {
            largest = item;
        }
    }

    largest
}
```

现在 `list[0]` 处会报新的错误：

```
cannot move out of type [T], a non-copy slice
cannot move out of here (rustc E0508)
```

这个错误的原因是，如果没有实现 `Copy` trait，`list[0]` 会发生所有权转移 (move)。`list` 是一个切片 (slice)，是对数据集合的引用。当我们直接将 `list[0]` 赋值给 `largest` 时，如果 `T` 没有实现 `Copy`，那么所有权就会从 `list[0]` 转移到 `largest`，导致后续 `list[0]` 无法再被访问，这显然不是我们的本意。

所以，我们需要通过对泛型添加 `Copy` 和 `PartialOrd` 约束来提供正确的实现，这样就可以顺利通过编译了：

```rust
fn largest<T: PartialOrd + Copy>(list: &[T]) -> T {
    let mut largest = list[0];

    for &item in list.iter() {
        if item > largest {
            largest = item;
        }
    }

    largest
}
```

-----

### 返回实现了特征的类型

类似于 Java 中方法可以返回一个接口类型，Rust 的方法也可以指定返回一个实现了特定 trait 的结构体。这通过 `impl Trait` 语法实现：

```rust
fn return_summarizable() -> impl Summary {
    NewArticle {
        headline: String::from("Breaking News"),
        location: String::from("New York"),
        author: String::from("John Doe"),
        content: String::from("This is the content of the article."),
    }
}
```

这种语法表示函数会返回某个实现了 `Summary` trait 的类型，但调用者无需知道具体的底层类型是什么。

