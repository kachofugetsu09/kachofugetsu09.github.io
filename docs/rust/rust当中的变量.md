# 从 Java 开发者视角理解 Rust 变量

本段文章想展示一下从一个 Javaer 的视角来看，Rust 当中的变量相关知识。

## Move：所有权转移

让我们从一个简单的例子开始：

```rust
fn move_demo(){
    let x:String = String::from("huashen");
    let y = x;
    println!("hi,I'm {}",x);
    println!("hi,I'm {}",y);
}
```

按照 Java 或者别的语言来说，可能这里会打印两个 `hi,I'm huashen`，但是这是 Rust 一个巨大的不同，我们运行一下来看看结果是什么。

### 在 Java 中的行为

```java
// Java中的等价代码
public class JavaDemo {
    public static void main(String[] args) {
        String x = "huashen";
        String y = x;  // 这里只是复制引用，x和y指向同一个字符串对象
        System.out.println("hi,I'm " + x);  // 正常输出
        System.out.println("hi,I'm " + y);  // 正常输出
    }
}
```

::: tip Java 的行为
在 Java 中，这段代码会正常运行并输出两次 `hi,I'm huashen`，因为 Java 中的赋值操作是引用的复制，x 和 y 都指向同一个字符串对象。
:::

### ❌ Rust 编译器的报错

```
--> src/main.rs:8:25
  |
6 |     let x:String = String::from("huashen");
  |         - move occurs because `x` has type `String`, which does not implement the `Copy` trait
7 |     let y = x;
  |             - value moved here
8 |     println!("hi,I'm{}",x);
  |                         ^ value borrowed here after move
```

提示我们因为 x 是 String 类型，他没有实现 Copy trait，所以当我们使用 `y=x` 这种语义的时候，值发生了 **move**。

::: warning 重要概念
具体来说，`println!` 宏需要借用 x 的值才能打印。当 x 的所有权被 move 到 y 之后，x 就变得无效了，因此再尝试借用 x 就会导致编译错误。这是 Rust 的借用检查器在保护我们免受悬空指针等内存安全问题的影响。
:::

##  什么是 Move？

**Move** 是 Rust 当中的一种语义，它代表着值的转移。在 Java 当中在这种情境下，发生的是引用的转移，就是产生了一个新的引用，指向同样的内存地址。

### Java vs Rust 的关键区别

| 语言 | 行为 | 结果 |
|------|------|------|
| **Java** | `String y = x;` 创建了一个新的引用 y，指向 x 指向的同一个对象 | 两个引用共存，都可以访问该对象 |
| **Rust** | `let y = x;` 将 x 的所有权转移给了 y | x 变得无效，这是为了防止多个所有者同时管理同一块内存 |

但是在 Rust 当中，当我们进行 `y=x` 操作后，y 就成为了 x 所拥有的值的 owner，在 Rust 当中我们称之为 move，y 成为了唯一指向 x 的值的 owner，x 在 `y=x`，也就是发生 move 之后就被 drop 了，他就不可用了。

当我们注释掉第一个 println，我们就可以正确运行，拿到以下结果：

```
hi,I'm huashen
```

##  Copy Trait：栈上数据的特殊处理

但是可以注意到我们在上面提到了 Copy，我会在之后的文章中进行讲解然后链接过来，这里不做赘述。

```rust
fn move_demo2(){
    let x:i32 = 1;
    let y = x;
    println!("x={},y={}",x,y);
}
```

这里我们写一个类似的，不是 String 的而是使用 i32 类型，这里就不会报错，正确打印出来：

```
x=1,y=1
```

::: info Copy Trait 的工作原理
这是因为 i32 类型实现了 Rust 的 **Copy trait**。对于实现了 Copy trait 的类型（通常是存储在栈上的基本数据类型，如整数、浮点数、布尔值、字符等），当将其赋值给另一个变量时，会发生**按位复制** (bitwise copy)，而不是 move。这意味着 x 的值被复制了一份给 y，x 仍然是有效的。
:::

###  Java 对比

```java
// Java中的基本类型行为
int x = 1;
int y = x;  // 复制值，x和y都有各自的副本
System.out.println("x=" + x + ",y=" + y);  // 正常输出 x=1,y=1
```

::: tip 相似但不同
在 Java 中，基本类型（如 int, double, boolean 等）也是值复制，这与 Rust 的 Copy trait 行为类似。但是对于对象类型（如 String），Java 复制的是引用，而 Rust 进行的是所有权转移。
:::

而 String 类型在堆上管理数据，不实现 Copy trait，因此会发生所有权转移（move）。这是 Rust 决定是否进行 move 或 copy 的**根本机制**。从内存角度看，i32 这样的基本类型存储在栈上，复制成本很低；而 String 管理的是堆上的数据，如果允许随意复制会带来性能问题和内存安全风险。

##  引用系统

那么这样每次发生 move 就不可用了，我们岂不是实现不了 Java 里的那种语义了，岂不是代表着 Rust 是一种充满缺憾的语言了？

实则不然。在我的理解里，Rust 这么做是为了让程序员注意内存安全不让引用漫天乱飞，出现内存安全问题。
实际上，这里有种可以实现这也 y 和 x 都打印的方案。

也就是**引用**。

###  引用的两种类型

引用分为两种：**可变引用** 与 **不可变引用**。

- **可变引用** 可以持有对于 x 这个值的修改权利，我们可以理解为他同时有对这个值的读取和改写的能力
- **不可变引用** 他是一种只读的，对于这个值只具有读取的能力

可以持有的数量也是不一样的：
- **不可变引用** 可以持有多个，因为他是只读的，只做展示功能
- **可变引用** 只能持有一个，不然多个可变引用被持有，那么这个值被修改成什么就无人知晓是不可控的状态了

::: danger 借用规则
**注意！** 当持有一个可变引用的时候，其他的不可变引用和可变引用都不能被持有。这就是 Rust 的**借用规则**：
- 同一时间，只允许存在一个可变引用，或者任意数量的不可变引用
- 引用必须总是有效的
:::

###  与 Java 的对比

```java
// Java中没有这种限制
String x = "value";
String ref1 = x;  // 多个引用指向同一个对象
String ref2 = x;  // 完全可以
// 甚至可以同时有"读"和"写"的引用，但这可能导致并发问题
```

::: warning Java 的隐患
Java 依靠垃圾回收器管理内存，允许多个引用指向同一个对象，但这在多线程环境下可能导致数据竞争。Rust 通过编译时的借用检查器在单线程环境下就避免了这些问题。
:::

##  不可变引用的使用

回到我们刚才的 demo 上，我们的目的是打印出来 x 和 y 的值，不对他们进行修改。那么我们可以使用不可变引用来实现。

```rust
fn reference_demo(){
    let x:String = String::from("huashen");
    let y = &x;  // 不可变引用
    println!("hi,I'm {}",x);
    println!("hi,I'm {}",y);
}
```

输出：
```
hi,I'm huashen
hi,I'm huashen
```

##  可变引用的使用

这里同样展示使用可变引用是什么效果：

```rust
fn reference_demo2(){
    let mut x: String = String::from("value");
    {
        let y = &mut x;
        *y = String::from("huashen");
        println!("hi,I'm {}",y);
    }
    println!("hi,I'm {}",x);
}
```

输出：
```
hi,I'm huashen
hi,I'm huashen
```

###  详细解释

给 Javaer 讲解一下这里具体是在做什么为什么会这样：

1. 首先我们在 x 上面加一个 `mut` 关键字，这代表他是可以被修改的
2. 然后用 y 拿到了 x 的可变引用 通过 `&mut` 然后使用 `*` 解开引用
3. 然后用 y 拿到了 x 的可变引用通过 &mut，并使用 * 解引用操作符来访问或修改 y 所指向的实际值。这意味着通过 *y，我们可以直接修改 x 所拥有的那块堆内存中的数据。
4. 底层发生了修改，因为 y 和 x 指向同一个值。所以这里第一个打印会打印一个 y

###  为什么需要大括号？

可能你从刚刚就有疑问：为什么要从 let y 前面使用一个大括号，到这个打印结束这个大括号呢？

首先，如果我们把第二个 println 放进去肯定是错误的。还记得我们刚才说的借用规则吗？

::: danger 借用冲突
当你持有 y（一个 `&mut x`）时，x 的可变借用已经存在。此时，`println!` 宏试图对 x 进行不可变借用（因为 `println!` 只需要读取值），这与现有的可变借用冲突了。因此，你必须等待可变引用 y 的作用域结束，x 的可变借用被释放后，才能对 x 进行不可变借用（通过 `println!`）。
:::

###  Java 中的类似情况

```java
// Java中可以同时有多个引用，但可能导致问题
StringBuilder x = new StringBuilder("value");
StringBuilder y = x;  // y和x指向同一个对象
y.append("huashen");  // 通过y修改
System.out.println(x);  // 通过x读取，输出"valuehuashen"
System.out.println(y);  // 通过y读取，输出"valuehuashen"
```

::: warning Java 的潜在风险
Java 允许这种操作，但在多线程环境下如果没有适当的同步机制，可能导致数据竞争和不一致的状态。Rust 通过借用规则在编译时就防止了这些问题。
:::

##  作用域：变量的生命管理

这里就引出来一个概念了，**作用域**。

在 Rust 当中，作用域是一个非常重要的概念，它决定了一个变量的生命周期：
- 当他被赋值的时候，他的生命周期开始，他还可以输出值
- 但是当作用域结束，那么他就会发生 drop，失去这个值
- 这意味着这个 y 只在括号内是有效的
- 如果我们在外部再尝试使用 y，就会报错，因为 y 已经失效了，他的存在仅限于大括号作用域内

### ❌ 作用域外访问的错误示例

假设是这样的，我们在括号外打印 y：

```rust
fn scope_demo(){
    let mut x: String = String::from("value");
    {
        let y = &mut x;
        *y = String::from("huashen");
        println!("hi,I'm {}",y);
    }
    println!("hi,I'm {}",y);  // ❌ 错误！
}
```

会报错：
```
error[E0425]: cannot find value `y` in this scope
  --> src/main.rs:42:26
   |
42 |     println!("hi,I'm {}",y);
   |                          ^ help: a local variable with a similar name exists: `x`
```

::: info 作用域的重要性
这就说明 y 的作用域仅限于大括号内，出了这个大括号 y 就失效了。

所以回到 reference_demo2，我们在 y 的作用域结束后，就没有人持有 x 的任何引用了，我们就可以安心打印 x 了。
:::

###  变量覆盖示例

我们再来看一个例子：

```rust
pub fn variable_covertest(){
    let x = 5;
    let x = x + 1;
    {
        let x = x * 2;
        println!("The value of x in the inner scope is: {}", x);
    }
    println!("The value of x in the outer scope is: {}", x);
}
```

这里结果会返回：
```
The value of x in the inner scope is: 12
The value of x in the outer scope is: 6
```

希望可以帮助你理解作用域的概念。

### Rust的内存管理

Rust 本质上是把决定每个变量的生命周期和作用域决定的权利完全交给了电脑前的你我：
- 你要决定这个变量什么时候就失效
- 你要决定这个引用他的生命周期是多久
- 你要决定他的性质，他是只读的还是可以进行修改的

####  与 Java 内存管理的对比

```java
// Java的自动内存管理
public void javaExample() {
    String s = new String("hello");
    // 当方法结束时，s变得不可达
    // 但对象可能仍在内存中，等待垃圾回收器回收
    // 程序员无法精确控制何时释放内存
}
```

| 特点 | Java | Rust |
|------|------|------|
| **内存管理** | 依靠垃圾回收器自动管理内存 | 通过所有权系统和作用域明确控制 |
| **程序员控制度** | 不需要（也无法）精确控制对象的生命周期 | 让程序员明确控制内存的分配和释放时机 |
| **性能** | 可能有GC停顿 | 零成本抽象，无运行时开销 |

::: tip 安全保证
因为作用域，所以**悬空指针不会在 Rust 当中出现**。
:::

##  生命周期

同时，我们引申出了一个概念**生命周期**。我们以一个例子作为展示：

```rust
fn life_test(){
    let r;
    {
        let x = 5;
        r = &x;  // ❌ 错误！
        println!("r: {}", r);
    }
    println!("r: {}", r);  // ❌ 错误！
}
```

在 `r = &x;` 这一行会发生报错，报错原因是：
```
x does not live long enough
borrowed value does not live long enough
```

::: danger 生命周期规则
这就说明了 r 的生命周期不能超过 x 的生命周期，因为 x 在大括号结束后就失效了，而 r 是一个引用，他指向了 x 的值，所以 r 也不能超过 x 的生命周期。

**注意：引用的生命周期是要小于等于被引用的值的生命周期的。** 不然就会发生悬空指针的问题。
:::

当我们注释掉括号外的 println 时，又可以正确运行了，因为 r 的生命周期和 x 的生命周期是相同的。

###  Java 中的类似问题

```java
// Java中虽然有垃圾回收，但仍可能有类似的逻辑问题
public class JavaLifetimeExample {
    private String reference;

    public void problematicMethod() {
        {
            String localVar = "temporary";
            this.reference = localVar;  // 危险：引用了局部变量
        }
        // localVar已经超出作用域，但reference仍然指向它
        // 在Java中这个字符串可能仍在内存中（字符串常量池）
        // 但如果是其他对象类型，就可能出现逻辑错误
    }
}
```

::: tip Rust 的优势
Rust 通过编译时检查彻底避免了这类问题，而 Java 依靠运行时的垃圾回收器，虽然不会造成内存错误，但可能导致逻辑错误或内存泄漏。
:::

##  显式生命周期标注

一个比较典型的问题：

```rust
fn longest(x: &str, y: &str) -> &str{  // ❌ 错误！
    if x.len() > y.len(){
        x
    }else{
        y
    }
}
```

这里会报错：
```
missing lifetime specifier
this function's return type contains a borrowed value, but the signature does not say whether it is borrowed from x or y (rustc E0106)
```

::: warning 生命周期歧义
这是因为我们最后返回了一个引用，但是没有指明这个引用的生命周期到底有多长，这意味着我们用 longest 生产出来的引用可能在 x 和 y 的生命周期结束后仍然存在，所以我们要显式规定生命周期，使用 `<'a>` 这样来显式规定生命周期泛型类似 Java 里的 `<T>`。
:::

###  正确的生命周期标注

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str{
    if x.len() > y.len(){
        x
    }else{
        y
    }
}
```

规定 x 和 y 的生命周期都是 'a，然后最后返回的引用生命周期也是 'a，这样就不会出现悬空指针的问题了，最后返回的指针生命周期长度一定是等于 x 和 y 的生命周期长度的。

###  与 Java 语法的对比

这里讲一下在 Rust 当中与 Java 必须要 `return x;` `return y;` 不同，在最后使用 x y 不加分号会作为表达式返回值，而加分号则会作为语句执行，返回值为 `()`。


##  结构体中的生命周期

在这里我们定义一个结构体：

```rust
struct ImportantExcerpt<'a>{
    part: &'a str,
}
```

他的 part 这部分生命周期是 'a

```rust
fn importantExcerpt_test(){
    let novel = String::from("Call me Ishmael. Some years ago...");
    let first_sentence = novel.split('.').next().expect("Could not find a '.'");
    let i = ImportantExcerpt { part: first_sentence };
    println!("Important excerpt: {}", i.part);

    {
        let s: &'static str = "I have a static lifetime.";
    }
    println!("Static string: {}", s);  // ❌ 错误！
}
```

::: warning 静态生命周期的误解
这个 s 是一个静态周期字符串的引用，这容易出现一个误区，就是以为这个 s 不会再括号结束后失效，其实不是的，他只是说生成了一个引用，他对着的这个字符串的生命周期是静态的，也就是说在整个程序运行期间都存在，但是 **s 这个引用本身的生命周期是有限的**，他在大括号结束后就失效了。
:::

对应的，像 novel 指向的这个 `String::from`，在出了函数后就会被 drop 掉，失去这个值的所有权。

所以这里假设我们在外部尝试打印 s 会显示：
```
cannot find value s in this scope (rustc E0425)
```


以上就是我想分享的从 Javaer 的视角看 Rust 当中的变量相关知识，希望可以帮助你理解。
