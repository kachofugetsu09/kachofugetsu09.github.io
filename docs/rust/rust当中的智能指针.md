## Rust 的内存结构

在 Java 当中，一个新的数组被创建时，它会被分配到堆里。所以如果一个数组里面放了很多数，通常只会发生堆溢出问题。

但是 Rust 的存储结构不同，Rust 当中每个新创建出来的对象都会首先放到栈上，这就导致栈溢出是一个很容易发生的情况。

以下代码：

```rust
fn main() {
    println!("Hello, world!");
    let stack_array :[ i32;536871065] = [0;536871065];
    println!("{}",stack_array[0]);
}
```

会发生：

```bash
Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.03s
Running `target/debug/smart_pointer`

thread 'main' has overflowed its stack
fatal runtime error: stack overflow, aborting
[1]     22946 IOT instruction (core dumped)  cargo run --package smart_pointer --bin smart_pointer
```

这是因为所有的对象默认是分配在栈上的，所以我们不可以创建一个过大的数组。解决方法是可以把它替换成 `Vec`，因为 `Vec` 是在堆上初始化的。

-----

## 智能指针

上面我们提到了 Rust 的内存结构是默认分配在栈上的，这导致假设我们有一个递归对象，比如一个链表，每个节点的结构体都在栈上，那它就会发生栈溢出。

我们用一个 Java 的写法来写一个链表：

```rust
struct ListNode{
    val: i32,
    next:Option<ListNode>,
}
```

`cargo run` 一下，会报错：

```bash
Compiling smart_pointer v0.1.0 (/mnt/data/coding/rust-blog/smart_pointer)
error[E0072]: recursive type `ListNode` has infinite size
--> src/main.rs:5:1
|
5 | struct ListNode{
| ^^^^^^^^^^^^^^^
6 |       val: i32,
7 |       next:Option<ListNode>,
|                 -------- recursive without indirection
|
help: insert some indirection (e.g., a `Box`, `Rc`, or `&`) to break the cycle
|
7 |       next:Option<Box<ListNode>>,
|                 ++++       +

For more information about this error, try `rustc --explain E0072`.
error: could not compile `smart_pointer` (bin "smart_pointer") due to 1 previous error
```

这里说了，`ListNode` 是一个递归的结构体，是不能进行存储的。这是因为 Rust 在存储过程中要先确定大小，然后进行存储。比如说 `i32` 大小就是 4 个字节，但是如果我们想分配一个 `Option<ListNode>`，那么它就会去问下一个 `ListNode` 有多大，下一个 `ListNode` 又会包含下一个 `ListNode`，Rust 为了第一个节点就会无限问下去。这是不符合 Rust 的规则的。

Rust 的原则是类型的大小必须在编译时完全确定，且与值无关。`ListNode` 这个结构体的大小，依赖于下一个节点的 `ListNode` 这个类型的大小，但它是未知的，也就是说，当前节点的结构体大小受下一个节点的结构体大小影响，而下一个结构体大小在编译的时候是不确定的。

在 Rust 中，一个类型（比如 `struct ListNode`）的大小在编译时必须是一个确定的常量。它不能依赖于：

  * **运行时的数据：** 编译器不知道你未来会创建多少个节点。
  * **另一个不确定大小的类型：** `Option<ListNode>` 的大小依赖于 `ListNode`，而 `ListNode` 的大小又依赖于 `Option<ListNode>`，这形成了一个无限循环，导致 `ListNode` 的大小在编译时无法被确定为一个具体的数字。

在 Java 当中，`next` 存储的是指向下一个 `ListNode` 的指针，而在 Rust 当中我们上面这个写法是存入了整个 `ListNode` 结构体。

我们可以通过智能指针解决这个问题。

### 使用 Box

通过 `Box` 这个方法，我们可以将我们创建的结构体存储到堆上。`Box` 的大小是固定的，也就是说在编译过程中它是已知的，类似 Java 那样，它是一个对于 `Box` 里面存储的结构体的指针。

我们通过 `Box` 改造我们的链表结构体：

```rust
fn main() {
    let list = ListNode{
        val:1,
        next:Box::new(Some(ListNode{
            val:2,
            next:Box::new(None)
        }))
    };
}

struct ListNode{
    val: i32,
    next:Box<Option<ListNode>>,
}
```

通过这种方式，我们将不可知的 `Option<ListNode>` 的大小固定为一个确定的值，从而解决了 `ListNode` 的大小在编译时无法确定的问题，从而顺利通过了编译。`Box` 会将整个里面存储的结构体位置从默认分配的栈上移动到堆里，而 `Box` 本身是在栈上的，作为一个固定大小的指针，指向堆中的结构体。

值得注意的是，它实现了 `Deref trait`，所以它被当作引用来对待。当出了作用域，会发生 `drop`，也就是说指向的堆数据也会消亡。

### Box 与 &

`Box` 可以看作是一个具有所有权，指向的数据总是在堆上，自己本身是在栈上的。
而 `&` 则是不具有所有权的，它指向的数据是不一定的，随着对应数据的位置变化，可以在堆上也可以在栈上，不会像 `Box` 一样大费周章把数据移动到堆上自己在栈里，而是天要下雨，随他去吧。数据既可以在栈上也可以在堆上，但是自己始终在栈上。

通过以下的一个例子可以看出来：

```rust
fn main() {
    let name:String = String::from("huashen");
    let box_name = Box::new(name);
    // println!("{}",name); // 报错，name 已被移动
}
```

在使用 `Box` 的时候，我们的 `name` 已经无法使用了，因为它已经被装入 `box_name` 了。

```rust
fn main() {
    let name:String = String::from("huashen");
    let reference: &String = &name;
    println!("{}",name); // 正常，name 仍然可用
}
```

相反，使用引用就完全没有问题。

-----

## Box 解引用的魔法

上面我们把 `Box` 和 `&` 做了比较，那么就说明 `Box` 和引用有很多类似之处。`Box` 是能够提供解引用的能力的。

```rust
fn main() {
    let x = 5;
    let y = Box::new(x);

    assert_eq!(5, x);
    assert_eq!(5, *y);
}
```

这一段代码是成立的。

我们通过自己写一个 `MyBox` 来理解，它是怎么成为一个带有引用属性的结构体的。

```rust
struct MyBox<T>(T);

impl<T> MyBox<T> {
    fn new(x: T) -> MyBox<T> {
        MyBox(x)
    }
}
```

这是我们最初定义的结构体。我们尝试用 `MyBox` 替换上面的 `Box` 会提示你 `error[E0614]: type MyBox<{integer}> cannot be dereferenced`。

这是因为实质上 `MyBox` 能够成为一个引用不是空穴来风，而是因为 `MyBox` 实现了 `Deref trait`。这个 trait 提供了一个解引用的能力。实质上在我们调用 `*y` 的时候，调用的实际上是 `*(y.deref())`。

通过下面这个世界上最清晰的例子我们来看看它具体是怎么做的。

这里我们用一个最为极端的做法，定义我们的 `Box` 可以塞入两个元素，但是它只能解引用出一个元素：

```rust
use std::ops::Deref;

fn main() {
    let b:MyBox<i32,i32> = MyBox::new(6,7);
    println!("box number is {}",*b);
}

struct MyBox<T,U>(T,U);

impl<T,U> MyBox<T,U> {
    fn new(x: T,y:U) -> MyBox<T,U> {
        MyBox(x,y)
    }
}

impl <T,U> Deref for MyBox<T,U> {
    type Target = T;
    fn deref(&self) -> &T{
        &self.0
    }
}
```

可以看到通过在 `Deref` 的实现上只传递了 `&self.0`，也就是只传递了 `T`，`U` 无法被解引用出来，我们运行一下看看。

```bash
box number is 6
```

这是我们的结果，可以看到解引用并非你存了什么就解出来什么，而是跟随你具体对于 `Deref` 这个 trait 的实现的。我们还是用上面的例子，自定义我们的返回，我们这次想返回第二个元素了，也就是 7。

改写我们的这个 `Deref`：

```rust
impl <T,U> Deref for MyBox<T,U> {
    type Target = U;
    fn deref(&self) -> &U{
        &self.1
    }
}
```

结果如下：

```bash
box number is 7
```

假设我们想返回两个值，这是做不到的。为什么？因为在 `Target` 上是一个单一的引用，不可以返回两个值，我们最后返回的就是规定的 `Target`。

以上，我们动手自定义实现了我们自己的带有引用属性的 `MyBox`。

-----

## 智能指针的 Drop 清理

还是从我们的 `MyBox` 入手，我们知道之所以 `Box` 可以把对应的结构分配在堆上，是使用了 `unsafe` 做的分配。我们也对我们的自定义 `MyBox` 进行尝试分配到堆上。

用 `layout` 申请一块内存，通过 `unsafe` 绕过安全检查限制，在堆上直接分配内存，然后把值写到堆内存上。

```rust
use std::alloc::{alloc, dealloc, Layout};
use std::ptr;

// 我们的 MyBox，这次它在堆上分配内存
struct MyBox<T>(*mut T);

impl<T> MyBox<T> {
    fn new(x: T) -> MyBox<T> {
        let layout = Layout::new::<T>();
        // unsafe 代码：在堆上分配内存
        let ptr = unsafe { alloc(layout) } as *mut T;
        
        // unsafe 代码：将值移动到堆上的内存
        unsafe { ptr::write(ptr, x) };

        MyBox(ptr)
    }
}

fn main() {
    let my_box = MyBox::new(5);
}
```

```bash
warning: `smart_pointer` (bin "smart_pointer") generated 3 warnings (run `cargo fix --bin "smart_pointer"` to apply 1 suggestion)
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 0.16s
    Running `target/debug/smart_pointer`
```

从结果来看，它是可以通过的。但要请你记住，我们已经离开 Java 了，我们的 G1, ZGC, CMS 已经永远离我们而去了。虽然变量没有了，但是我们分配的内存空间可是实打实的，没有被清理的。

所以我们要实现 `Drop` 这个 trait，这个 trait 提供了，离开定义域，不仅清理变量还清理内存空间的功效。

```rust
impl<T> Drop for MyBox<T> {
    fn drop(&mut self) {
        let layout = Layout::new::<T>();
        unsafe {
            ptr::drop_in_place(self.0);
            dealloc(self.0 as *mut u8, layout);
        }
    }
}
```

`ptr::drop_in_place` 是一个 `unsafe` 函数，用于在不释放内存的情况下，手动调用值所实现的 `Drop trait` 的 `drop` 方法。

  * `ptr::drop_in_place(self.0)`：这行代码会找到 `self.0` 指针指向的值，并调用它的 `drop` 方法，从而清理它内部持有的任何资源（比如 `String` 的堆内存）。

这样，在离开变量所在的作用域的时候，`drop` 会自动调用，从而帮我们清理内存空间，防止内存泄漏。Rust 通过改变程序员编写代码的方式，来提供了内存安全的保证。

`std::mem::drop` 函数不同于 `Drop trait` 中的 `drop` 方法。可以通过传递希望提早强制丢弃的值作为参数。`std::mem::drop` 位于 `prelude`。

```rust
fn main() {
    let c = CustomSmartPointer { data: String::from("some data") };
    println!("CustomSmartPointer created.");
    drop(c);
    println!("CustomSmartPointer dropped before the end of main.");
}
```

结果如下：

```bash
CustomSmartPointer created.
Dropping CustomSmartPointer with data `some data`!
CustomSmartPointer dropped before the end of main.
```

它是怎么预防双重释放的 `drop` 问题的呢？它会移动 `c` 的所有权来防止双重释放的 `drop` 问题。

-----

## 引用计数智能指针

假设我们想让两个 head 的 next 都是同一个 ListNode。直接使用我们一开始用 Box 写好的。会是这样的：

```rust
fn main() {
    let list = ListNode{
        val:1,
        next:Box::new(Some(ListNode{
            val:2,
            next:Box::new(None)
        }))
    };
    let head1 = ListNode{
        val:2,
        next:Box::new(Some(list)),
    };
    let head2 = ListNode{
        val:3,
        next:Box::new(Some(list)),
    };
}

struct ListNode{
    val: i32,
    next:Box<Option<ListNode>>,
}
```

报错：

```bash
use of moved value: list
value used here after move (rustc E0382)
hint: move occurs because `list` has type `ListNode`, which does not implement the `Copy` trait
```

我们可以使用 **Rc** 关键字。当创建 b 时，不同于获取 a 的所有权，这里会克隆 a 所包含的 `Rc<ListNode>`，这会将引用计数从 1 增加到 2 并允许 a 和 b 共享 `Rc<ListNode>` 中数据的所有权。创建 c 时也会克隆 a，这会将引用计数从 2 增加为 3。每次调用 `Rc::clone`，`Rc<ListNode>` 中数据的引用计数都会增加，直到有零个引用之前其数据都不会被清理。

我们改用 Rc，使用 `Rc::clone` 来作为储存在 next 当中的值。

```rust
use std::rc::Rc;

fn main() {
    let list = Rc::new(ListNode {
        val: 1,
        next: None,
    });

    let head1 = Rc::new(ListNode {
        val: 2,
        next: Some(Rc::clone(&list)),
    });

    let head2 = Rc::new(ListNode {
        val: 3,
        next: Some(Rc::clone(&list)),
    });

    if let Some(next) = (&head1.next) {
        println!("{}", next.val);
    }

    if let Some(next) = (&head2.next) {
        println!("{}", next.val);
    }
}

struct ListNode {
    val: i32,
    next: Option<Rc<ListNode>>,
}
```

会打印出来两个 `1`。

`Rc` 的本质是共享所有权，类似创建了一个不可变引用，每 clone 一次引用计数器增加一次，当所有指向 `Rc` 的实例都发生了 `drop` 后，引用计数器会变为 0，然后他就自动释放了。类似 Java 的 GC 规则当中的一系列引用计数操作。

当你执行 `Rc::new(my_data)` 时，Rust 会：

1.  在堆上分配一块内存，用来存放 `my_data` 和引用计数。
2.  在栈上创建一个 `Rc` 实例，它内部的指针指向堆上的这块内存。

当你使用 `Rc::clone()` 时，你只是在栈上创建了一个新的 `Rc` 实例，它的指针同样指向堆上的同一块数据。这个操作非常高效，因为它不需要复制堆上的数据，只需要增加一个引用计数。

-----

## 无敌的 RefCell

在 Rust 当中我们总是束手束脚，比如像 `Rc`，虽然把数据放到了堆上，但是他是不可变的共享，难道他就不能像 Java 一样，实现共享并且可变吗？
还记得我们在引用那节说到的吗，同时只可以有多个不可变引用，或者有一个可变引用，这似乎成为了 Rust 无法越过的天堑。

但是无敌的 **RefCell** 可以做到。

**Rc\<RefCell\<T\>\>** 的结构可以理解为：

  * **Rc** 是一个不可变的箱子，这个箱子永远指向 **RefCell**。这个箱子的特性是，它可以被复制无数次（`Rc::clone()`），所有复制的箱子都指向同一个 `RefCell`。这就是 `Rc` 的作用。
  * **RefCell** 是一个魔术盒子，它装着你真正的数据（T）。这个魔术盒子最神奇的地方在于，它有两个锁：一个只读锁（`borrow()`）和一个可写锁（`borrow_mut()`）。
  * 当你需要只读时，你可以从魔术盒子里拿一把只读锁。这时，无数个箱子（`Rc`）都可以同时持有只读锁。
  * 当你需要修改时，你可以从魔术盒子里拿一把可写锁。但这个魔术盒子有一个严格的规则：当有人拿着可写锁时，任何人都不能再拿任何锁（无论是只读还是可写）。

比如说在 Java 语意里面，我们想实现这样一个功能：

```java
class Person {
    public String name;
    public int age;

    public Person(String name, int age) {
        this.name = name;
        this.age = age;
    }
}

public class Main {
    public static void main(String[] args) {
        Person person1 = new Person("Alice", 30);

        Person person2 = person1;

        System.out.println("--- 修改前 ---");
        System.out.println("person1 的名字: " + person1.name);
        System.out.println("person2 的名字: " + person2.name);

        person2.name = "Bob";

        System.out.println("\n--- 修改后 ---");
        System.out.println("person1 的名字: " + person1.name);
        System.out.println("person2 的名字: " + person2.name);
    }
}
```

运行结果：

```bash
--- 修改前 ---
person1 的名字: Alice
person2 的名字: Alice

--- 修改后 ---
person1 的名字: Bob
person2 的名字: Bob
```

在 Rust 当中，我们在 `print` 打印读取的时候，使用 `borrow` 来获取只读引用，在做对应的修改的时候，使用 `borrow_mut` 来获取可变引用。

```rust
use std::rc::Rc;
use std::cell::RefCell;

struct Person {
    name: String,
    age: i32,
}

fn main() {
    let person1 = Rc::new(RefCell::new(Person {
        name: String::from("Alice"),
        age: 30,
    }));

    let person2 = Rc::clone(&person1);

    println!("--- 修改前 ---");
    println!("person1 的名字: {}", person1.borrow().name);
    println!("person2 的名字: {}", person2.borrow().name);

    person2.borrow_mut().name = String::from("Bob");

    println!("\n--- 修改后 ---");
    println!("person1 的名字: {}", person1.borrow().name);
    println!("person2 的名字: {}", person2.borrow().name);
}
```

运行结果：

```bash
--- 修改前 ---
person1 的名字: Alice
person2 的名字: Alice

--- 修改后 ---
person1 的名字: Bob
person2 的名字: Bob
```

Rust 达到了和 Java 代码中一样的效果。

`RefCell` 同样，指针在栈上，内部的数据在堆上。

`RefCell` 最厉害的地方是，你定义的结构体可以是不可变的，在函数中你只传入了他的 `&` 引用，但是你可以修改内部的数据，这有点类似于 Java 里 `Collections.unmodifiableList` 的功能，虽然这个 list 是不可变的，但是你可以随意在这个不可变的 list 里面添加元素。

举一个 Rust 当中的例子来看看 `RefCell` 单独使用的场景。

```rust
use std::rc::Rc;
use std::cell::RefCell;

// 定义一个结构体
struct Person {
    name: String,
    age: RefCell<i32>,
}

fn change_person_name(person: &Person,change_to:i32){
    let mut a = person.age.borrow_mut();
    *a = change_to;
}


fn main() {
    let p1 = Person{
        name: String::from("John"),
        age: RefCell::new(30),
    };
    change_person_name(&p1, 35);
    println!("{}",p1.age.borrow());
}
```

可以看到我们虽然传入的 `Person` 是不可变的，但是因为 `age` 使用了 `RefCell`，所以他是可以被修改的。
这个方法的意思是，我们的 `person` 不可以变，但是你可以修改这个 `person` 的被 `RefCell` 包裹的 `age` 数据。

-----

## 巧用 Weak 规避循环引用

你也可以看出来在使用 `Rc`（`RefCell`）后他的使用逻辑就和 Java 当中的引用没什么区别了，那么 Java 当中出现的引用循环问题就会再次出现。

例如在以下场景中：

```rust
use std::rc::Rc;
use std::cell::RefCell;

struct Node {
    value: i32,
    parent: RefCell<Option<Rc<Node>>>,
    children: RefCell<Vec<Rc<Node>>>,
}

fn main() {
    let leaf = Rc::new(Node {
        value: 3,
        parent: RefCell::new(None),
        children: RefCell::new(vec![]),
    });


    let branch = Rc::new(Node {
        value: 5,
        parent: RefCell::new(None),
        children: RefCell::new(vec![Rc::clone(&leaf)]),
    });

    *leaf.parent.borrow_mut() = Some(Rc::clone(&branch));

    println!(
        "分支节点的引用计数: {}",
        Rc::strong_count(&branch)
    );

    println!(
        "叶节点 parent 的引用计数: {}",
        Rc::strong_count(&leaf)
    );
}
```

循环引用就发生了。结果是：

```bash
分支节点的引用计数: 2
叶节点 parent 的引用计数: 2
```

内存泄漏仍然发生了，因为引用还在，所以在离开作用域时，引用还不是 0，所以那块内存不会被回收掉。

我们可以通过 **Weak** 来解决，`Weak` 的功效是与 `Ref` 类似的，但是他不能保证数据是存在的。

```rust
use std::rc::{Rc, Weak};
use std::cell::RefCell;

struct Node {
    value: i32,
    parent: RefCell<Option<Weak<Node>>>, // 父节点是弱引用
    children: RefCell<Vec<Rc<Node>>>,
}

fn main() {
    // #1. 创建 leaf 节点
    let leaf = Rc::new(Node {
        value: 3,
        parent: RefCell::new(None),
        children: RefCell::new(vec![]),
    });

    // 此时，`leaf` 强引用计数: 1， 弱引用计数: 0

    // #2. 创建 branch 节点，并把 leaf 作为子节点
    let branch = Rc::new(Node {
        value: 5,
        parent: RefCell::new(None),
        children: RefCell::new(vec![Rc::clone(&leaf)]), // 这里克隆了 leaf 的强引用
    });

    // 此时，
    // `leaf` 的强引用计数: 2 (`leaf` 变量本身 + `branch` 的 `children` 字段)
    // `branch` 的强引用计数: 1 (`branch` 变量本身)
    // `leaf` 的弱引用计数: 0
    // `branch` 的弱引用计数: 0

    // #3. 建立弱引用，让 leaf 指向 branch
    *leaf.parent.borrow_mut() = Some(Rc::downgrade(&branch));

    // 此时，
    // `leaf` 的强引用计数: 2
    // `branch` 的强引用计数: 1
    // `leaf` 的弱引用计数: 0
    // `branch` 的弱引用计数: 1 (`leaf` 的 `parent` 字段)

    println!("main 函数结束前：");
    println!("分支节点的强引用计数: {}", Rc::strong_count(&branch)); // 输出 1
    println!("叶节点的强引用计数: {}", Rc::strong_count(&leaf)); // 输出 2
}
```

首先他会先 `drop` 掉 `branch`，`branch` 自己的引用计数归零，被清理掉，`leaf` 的强引用计数也 -1，只剩下他自己的引用，然后 `leaf` 被 `drop`，引用计数从 1 变成 0，也被 `drop` 掉，就解决这个问题了。

**什么时候应该使用 Weak？**

当 a 的消失不该影响 b 的存在，也就是说有 a 没 a b 都可以作为一个独立的个体的情况下，我们把 b 指向 a 的引用模式设置为弱引用。`Rc` 代表所有权，而 `Weak` 只代表观察或非所有权的引用。也就是说父节点拥有子节点这个 `children`，而子节点只是知道父节点是 `parent`，而不拥有 `parent`，`children` 死了不会导致 `parent` 死了，只会导致 `parent` 失去无关痛痒的 `children`。