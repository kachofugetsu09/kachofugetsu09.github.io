在Java中，如果想要创建一个线程并运行它，我们会创建一个新的 `Thread` 对象，然后调用 `start` 方法来启动这个线程。

而在Rust中，我们不需要先新建对象再调用 `start` 方法。相反，我们直接使用 `thread::spawn` 来创建并启动线程，并将想要线程执行的闭包作为参数传入。

-----

## 使用 `spawn`

例如，如果我们想让一个新线程和主线程同时开始打印1到10，可以使用如下代码：

```rust
use std::{thread, time::Duration};

fn main() {
    thread::spawn(|| {
        for i in 1..10 {
            println!("Thread: {}", i);
            // thread::sleep(Duration::from_millis(1));
        }
    });
    
    for i in 1..10 {
        println!("Main: {}", i);
        thread::sleep(Duration::from_millis(1));
    }
}
```

其结果可能和我一样，是这样的：

```
Main: 1
Thread: 1
Thread: 2
Thread: 3
Thread: 4
Thread: 5
Thread: 6
Thread: 7
Thread: 8
Thread: 9
Main: 2
Main: 3
Main: 4
Main: 5
Main: 6
Main: 7
Main: 8
Main: 9
```

-----

## 等待线程运行完毕

假设我们把 `thread::sleep` 命令注释掉，你会发现只会输出主线程中的循环打印，而不会触发新线程中的打印。这是因为当主线程结束运行后，程序就会退出，新线程的命令还没来得及执行。

为了解决这个问题，我们可以使用 `join` 来等待新线程执行完毕后再完成主线程。代码如下：

```rust
use std::{thread, time::Duration};

fn main() {
    let handle = thread::spawn(|| {
        for i in 1..10 {
            println!("hi number {} from the spawned thread!", i);
        }
    });

    for i in 1..5 {
        println!("hi number {} from the main thread!", i);
    }

    match handle.join() {
        Ok(_) => println!("Spawned thread completed successfully."),
        Err(e) => {
            eprintln!("Spawned thread panicked: {:?}", e);
        }
    }
}
```

-----

## `move` 关键字

假设我们想在另一个线程中打印主线程中 `vec` 的值，我们可能会这么写代码：

```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(|| {
        println!("Here's a vector: {:?}", v);
    });

    handle.join().unwrap();
}
```

这段代码无法通过编译，会提示：
`to force the closure to take ownership of v (and any other referenced variables), use the move keyword: move`

这是因为如果在主线程某个时刻 `drop` 了 `v`，而新线程还尝试获取 `v` 的值，就会出现悬空指针问题。因为 `v` 的生命周期并不被新线程所拥有。

所以，我们需要使用 **`move`** 关键字来强制闭包获取 `v` 的所有权。

```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(move || {
        println!("Here's a vector: {:?}", v);
    });
    

    handle.join().unwrap();
    
    // println!("{:?}", v);
}
```

由于 `move` 关键字的作用，在 `thread::spawn` 之后，我们无法再使用 `v` 了，因为其所有权已经转移到了 `handle` 这个新线程中。

-----

## `channel` 通讯

有关 `channel` 的详细解读将在日后Go语言的 `channel` 章节中进行讲解。

### 同步阻塞 `channel` 通讯

我们可以通过一个元组来创建发送者和接收者，通常写作 `(tx, rx)`，这是历史原因造成的。

```rust
use std::{sync::mpsc, thread};

fn main() {
    let (tx, rx) = mpsc::channel();
    
    thread::spawn(move || {
        tx.send("Hello from thread").unwrap();
    });
    
    println!("Received: {}", rx.recv().unwrap());
}
```

通过这种方式，我们完成了线程与线程之间的通讯：在一个线程中发送消息，然后在主线程中接收消息，从而实现了线程安全的通讯。这是一种阻塞的通讯方式，主线程会等待消息发出者的消息到达，后续的代码逻辑才会继续执行。

### 所有权转移

假设我们有以下代码：

```rust
use std::thread;
use std::sync::mpsc;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let val = String::from("hi");
        tx.send(val).unwrap();
        // println!("val is {}", val);
    });

    let received = rx.recv().unwrap();
    println!("Got: {}", received);
}
```

这段代码会产生报错：
`borrow of moved value: val`
`value borrowed here after move (rustc E0382)`

Rust这样设计的原因是，当值被发送到另一个线程后，如果发送线程依然能访问并修改这个值，而接收线程感知不到这种修改，就会导致并发编程的错误。这种所有权转移的设计帮助我们避免了这类问题。

```rust
use std::thread;
use std::sync::mpsc;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let vals = vec![
            String::from("hi"),
            String::from("from"),
            String::from("the"),
            String::from("thread"),
        ];

        for val in vals {
            tx.send(val).unwrap();
            thread::sleep(Duration::from_secs(1));
        }
    });

    for received in rx {
        println!("Got: {}", received);
    }
}
```

在上面的例子中，我们可以直接对 `rx` 这个迭代器进行迭代。你可能会好奇，主线程什么时候会销毁 `rx` 呢？实际上，当发送方被 `drop` 后，主线程的 `rx` 也会自动关闭。

### 多生产者多消费者

我们可以通过 `clone` 来创建多个生产者和消费者。

```rust
use std::thread;
use std::sync::mpsc;
use std::time::Duration;

fn main() {
    let (tx, rx) = mpsc::channel();

    let tx1 = tx.clone();
    thread::spawn(move || {
        let vals = vec![
            String::from("hi"),
            String::from("from"),
            String::from("the"),
            String::from("thread"),
        ];

        for val in vals {
            tx1.send(val).unwrap();
            thread::sleep(Duration::from_secs(1));
        }
    });

    thread::spawn(move || {
        let vals = vec![
            String::from("more"),
            String::from("messages"),
            String::from("for"),
            String::from("you"),
        ];

        for val in vals {
            tx.send(val).unwrap();
            thread::sleep(Duration::from_secs(1));
        }
    });

    for received in rx {
        println!("Got: {}", received);
    }
}
```

通过这种方式，我们就可以创建多个生产者和消费者，从而实现多生产者多消费者模式。

-----

## Mutex 关键字

**`Mutex`** 可以理解为类似于Java中的 `synchronized` 关键字。在进入作用域时加锁，离开作用域时解锁。但不同的是，Java中的 `synchronized` 可以锁定一个方法或一段代码，而Rust中的 `Mutex` 是锁定一个特定的值。当你对锁进行 `lock` 操作后，你对该值的操作就是线程安全的了。

需要注意的是，在Rust中，`Rc` 只能用于单线程环境，而 `Arc` 可以替代 `Rc` 应用于多线程环境。

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let count = Arc::new(Mutex::new(0));
    let mut handles = vec![];
    for i in 0..5 {
        let counter = Arc::clone(&count);
        let handle = thread::spawn(move || {
            let mut num = counter.lock().unwrap();
            println!("thread {} got the lock", i);
            *num += 1;
            println!("thread {} incremented count to {}", i, *num);
        });
        handles.push(handle);
    }
    
    for handle in handles {
        handle.join().unwrap();
    }
    
    println!("after multiple threads, {}", *count.lock().unwrap())
}
```

在这段代码中，我们使用 `Arc` 来替代 `Rc`，让多个线程可以独立进行加锁操作。因为在 `thread::spawn` 中会进行 `move`，将 `count` 移动到新线程中，所以如果不使用 `Arc` 或 `Rc`，我们将无法再次使用 `count.lock().unwrap()` 来获取锁。

我们创建了一个 `Vec` 来存储多线程的句柄，并在最后等待所有线程结束后打印被多线程修改后的值。

你可能会得到如下结果：

```
thread 2 got the lock
thread 2 incremented count to 1
thread 3 got the lock
thread 3 incremented count to 2
thread 1 got the lock
thread 1 incremented count to 3
thread 0 got the lock
thread 0 incremented count to 4
thread 4 got the lock
thread 4 incremented count to 5
after multiple threads, 5
```

多线程环境中 `Arc<Mutex<T>>` 这个结构的外部表现和单线程环境中 `Rc<RefCell<T>>` 是类似的。在内部，`Mutex` 提供了可变性，而 `Arc` 提供了外部的不可变副本。