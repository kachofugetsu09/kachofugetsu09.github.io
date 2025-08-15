我们先来回忆一下，在java当中，如果我们想创建一个线程，并且运行，我们会创建一个新的Thread对象，然后调用start方法来启动这个线程。

在rust中，我们不需要先新建对象再调用start方法来启动线程，而是直接使用spawn创建并且启动线程，在spawn函数当中，传入我们想让这个线程所执行的闭包。

## 使用spawn
例如我们想让thread和main线程同时开始打印1到10
可以使用如下代码

```rust
use std::{thread, time::Duration};

fn main() {
    thread::spawn(||{
        for i in 1..10{
            println!("Thread: {}", i);
            // thread::sleep(Duration::from_millis(1));
        }
    });
    
    for i in 1..10{
        println!("Main: {}", i);
        thread::sleep(Duration::from_millis(1));
    }
}



结果可能会和我一样，是
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
## 等待线程运行完毕

假设将sleep命令注释掉，你就会发现只会输出main线程当中的循环打印，而不会触发thread当中的打印了。
这是因为当main线程结束运行后就不会再运行thread线程的命令了。

为了解决这个问题，我们可以用join来等待thread执行命令完成在完成main线程
代码如下
```rust
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

## move
假设我们想在另一个线程中打印主线程当中vec的值。
我们可能会这么写代码
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
但是他是过不了编译的。
会提示
to force the closure to take ownership of v (and any other referenced variables), use the move keyword: move 

假设在主线程某个时刻drop了v,而thread还尝试获取v的值，就会出现悬空指针问题，因为v的生命周期并不被thread所拥有。
所以我们想做这个实现需要move关键字来强制闭包获取v的所有权。

```rust
use std::thread;

fn main() {
    let v = vec![1, 2, 3];

    let handle = thread::spawn(move || {
        println!("Here's a vector: {:?}", v);
    });
    

    handle.join().unwrap();
    
    // println!("{:?}",v);
}
```

由于move关键字，我们在thread后已经无法使用v了，因为所有权转移到了handle这个thread当中。

## channel通讯
详细有关channel的解读会在日后go语言的channel中进行讲解。

### 同步阻塞channel通讯
通过一个元组规定发送者和接收者，通常会写做(tx,rx)因为历史原因。
```rust
use std::{sync::mpsc, thread};

fn main() {
    let (tx,rx) = mpsc::channel();
    
    thread::spawn(move||{
        tx.send("Hello from thread").unwrap();
    });
    
    println!("Received: {}", rx.recv().unwrap());
}
```


通过这种方式就完成了线程与线程之间的通讯，通过在另一个线程中发送消息，然后在主线程中接受消息的过程完成了线程安全的通讯。
这是一种阻塞的通讯方式，主线程会等待消息发出者的消息到达，后面的代码逻辑才会继续执行。


### 所有权转移
假设我们有以下代码

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
borrow of moved value: val
value borrowed here after move (rustc E0382)

会出现这个报错

rust这么设计的原因是，比如说在传递后另一个线程对这个值进行修改，这个值就是原本的值了，但是可能因为他在
我们的发送线程中，可能会出现感知不到的情况。帮助我们避免了并发编程的错误。

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
在上面的例子当中，我们可以直接迭代rx这个迭代器当中的值。
你可能会好奇，那主线程什么时候销毁rx呢？
实际上，当发送方drop后，主线程的rx也就自动销毁了。

### 多生产者多消费者
我们可以通过clone来创建多个生产者和消费者
```rust
use std::thread;
use std::sync::mpsc;
use std::time::Duration;

fn main() {
// --snip--

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

// --snip--
}

```
通过这个方式，我们就可以创建多个生产者和消费者，从而实现多生产者多消费者模式。

## Mutex关键字
Mutex可以理解为类似java当中synchronized那个感觉，在进入后加锁，离开作用域解锁，但是不同的是，java当中的synchornized可以锁一个方法，一段代码，而rust当中的Mutex是锁住对应的值，在对锁进行lock后，你进行的操作就是线程安全的了。

要注意的是，在rust当中Rc只能应用于单线程，Arc可以替代Rc应用于多线程环境。

```rust
use std::sync::{Arc, Mutex};
use std::thread;

fn main() {
    let count = Arc::new(Mutex::new(0));
    let mut handles = vec![];
    for i in 0..5{
        let counter = Arc::clone(&count);
        let handle =thread::spawn(move || {
            let mut num = counter.lock().unwrap();
            println!("thread {} got the lock",i);
            *num += 1;
            println!("thread {} incremented count to {}", i, *num);
        });
        handles.push(handle);
    }
    
    for handle in handles{
        handle.join().unwrap();
    }
    
    println!("after multiple threads, {}", *count.lock().unwrap())
}

```
这段代码当中我们使用Arc来替代rc让多个线程可以单独进行加锁操作。因为在thread当中会进行move把count移动进去，所以如果不使用Arc或者Rc的话，会导致我们无法再次使用count.lock().unwrap()来获取锁。
创建一个vec来储存多线程的句柄，在最后等待所有线程结束后打印多线程修改后的值。

你可能会像我一样得到如下结果
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


多线程Arc Mutex这个结构的外部表现和单线程Rc Refcell是类似的，在内部由mutex提供可变性，Arc提供外部不可变副本。