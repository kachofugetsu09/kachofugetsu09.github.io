# AQS和可重入锁源码解析

本篇文章我们以解析的方式来学习 **AQS** 和 **可重入锁** 在JDK源码中是如何实现的。

---

## 什么是AQS？

**AQS** 是什么？在Java的具体实现中，它是一个抽象类，名字叫 `AbstractQueuedSynchronizer`，简称 **AQS**，它是一个专门用来构建锁的框架。

它提供了一个 **FIFO队列**，实质上是一个 **双向链表**，来管理线程的等待和唤醒，每一个节点都是对一个线程的封装。简单来说，当一个线程进来，如果它没有成功获取到锁，它就会进入这个双向链表的等待队列当中，这个过程中它需要等待其他线程释放锁，在这个过程中如果它是 **真实头节点**，那么等到其他线程释放了锁，它就会被唤醒，然后开始获取锁（也就是 **可重入锁** 的公平状态下的实现）。

其中比较著名用AQS实现的锁就有：
- **`ReentrantLock`** （可重入锁）
- **`CountDownLatch`** （倒计时器）
- **`Semaphore`** （信号量）

今天我们就来学习一下是如何使用AQS来实现的可重入锁。

---

## AQS核心结构分析

首先我们从AQS来做讲起，因为本质上可重入锁在AQS框架下并不是一个复杂的实现。

### AbstractOwnableSynchronizer基类

**AQS** 作为抽象类本身又继承了另一个类叫做 `AbstractOwnableSynchronizer`。
这个类的主要作用实际上就是储存一个 **当前独占线程**，以下是实现。

```java
public abstract class AbstractOwnableSynchronizer {
    protected AbstractOwnableSynchronizer() {
    }

    private transient Thread exclusiveOwnerThread;

    public final Thread getExclusiveOwnerThread() {
        return exclusiveOwnerThread;
    }
    protected final void setExclusiveOwnerThread(Thread thread) {
        exclusiveOwnerThread = thread;
    }
}
```

### Node节点类

AQS的主要字段有一个抽象出来的 **`Node`类**，表示一个节点，节点本身是一个线程的封装，包含了：
- 它储存的 **线程引用**
- 它的 **等待信息**
- 它的 **前驱节点**
- 它的 **后驱节点**
- 以及条件变量要用到的 **nextWaiter**

```java
//等待队列的节点类
//每个节点中的status字段判断它是否应当阻塞。
static class Node {
    //节点的模式
    //共享模式
    static final Node SHARED = new Node();
    //独占模式
    static final Node EXCLUSIVE = null;

    //信号状态，代表当前线程的后继节点正在park,在当前节点释放后，必须唤醒它的后继节点。
    static final int SIGNAL = -1;
    //取消状态，代表当前节点代表的线程因为等待超时或被中断而取消了获取锁的请求。这个状态下的节点会被从队列中移除。
    static final int CANCELLED = 1;

    static final int CONDITION = -2;
    static final int PROPAGATE = -3;

    volatile int waitStatus;

    //前驱节点
    volatile Node prev;

    //后继节点
    volatile Node next;

    //将当前节点排入队列的线程
    volatile Thread thread;

    Node nextWaiter;

    //返回当前节点的前驱节点
    final Node predecessor() throws NullPointerException {
        Node p = prev;
        if (p == null) {
            throw new NullPointerException();
        } else {
            return p;
        }
    }
}
```

### waitStatus状态详解

可以看到里面有一个 **`waitStatus`字段**，这个字段用来表示当前节点的状态，主要有以下几种状态：
- **`SIGNAL (-1)`** ：代表当前节点的后继节点正在park，在当前节点释放后，必须唤醒它的后继节点
- **`CANCELLED (1)`** ：代表当前节点代表的线程因为等待超时或被中断而取消了获取锁的请求。这个状态下的节点会被从队列中移除
- **`CONDITION (-2)`** ：代表当前节点是一个条件等待节点
- **`PROPAGATE (-3)`** ：代表当前节点是一个共享模式的节点

> **重要**：默认情况下，节点的 `waitStatus` 为 **0**，表示节点处于正常状态。当新节点通过 `addWaiter` 方法添加到队列时，其 `waitStatus` 默认为 **0**。

同时，里面有一个 **`predecessor`** 方法用来返回当前节点的前驱节点。如果等于null，则抛出 `NullPointerException`。

### AQS核心字段

在整个AQS当中，有一个 **虚拟头节点**，以及一个 **真正的尾节点**。我们可以认为这个头节点是一个 **哨兵节点**，而尾节点则是在实际队列中随着插入而更新的。

```java
private volatile Node head;
private volatile Node tail;
```

另一个重要的就是 **`state`字段**，这个字段用来表示锁的状态，通常是一个整数值：
- **0**：表示未被占用
- **1**：表示被占用

```java
private volatile int state;
```

### Unsafe与CAS操作

```java
private static final Unsafe unsafe;
private static final long stateOffset;
private static final long headOffset;
private static final long tailOffset;
private static final long waitStatusOffset;
private static final long nextOffset;

static {
    try {
        //找到theUnsafe私有字段
        Field f = Unsafe.class.getDeclaredField("theUnsafe");
        //设置为可访问
        f.setAccessible(true);
        //获取Unsafe的唯一实例
        unsafe = (Unsafe) f.get(null);


        //对性能进行优化，用unsafe获取关键变量的偏移量提高性能，可以在做CAS操作时直接使用偏移量而不是通过反射获取字段值。
        stateOffset = unsafe.objectFieldOffset(AbstractQueuedSynchronizer.class.getDeclaredField("state"));
        headOffset = unsafe.objectFieldOffset(AbstractQueuedSynchronizer.class.getDeclaredField("head"));
        tailOffset = unsafe.objectFieldOffset(AbstractQueuedSynchronizer.class.getDeclaredField("tail"));
        waitStatusOffset = unsafe.objectFieldOffset(Node.class.getDeclaredField("waitStatus"));
        nextOffset = unsafe.objectFieldOffset(Node.class.getDeclaredField("next"));
    } catch (Exception ex) {
        throw new Error(ex);
    }
}
```

**为什么要获取内存偏移量？** 因为在AQS中有很多 **CAS操作**，这样可以提高性能，避免每次都通过反射来获取字段值。通过这种方式每次都可以直接使用偏移量来做 **CAS操作**。

搭配储存的偏移量，有着以下 **CAS操作方法**：

```java
private final boolean compareAnsSetHead(Node update) {
    return unsafe.compareAndSwapObject(this, headOffset, null, update);
}

private final boolean compareAndSetTail(Node expect, Node update) {
    return unsafe.compareAndSwapObject(this, tailOffset, expect, update);
}

private static final boolean compareAndSetWaitStatus(Node node, int expect, int update) {
    return unsafe.compareAndSwapInt(node, waitStatusOffset, expect, update);
}

private static final boolean compareAndSetNext(Node node, Node expect, Node update) {
    return unsafe.compareAndSwapObject(node, nextOffset, expect, update);
}

protected final boolean compareAndSetState(int expect, int update) {
    return unsafe.compareAndSwapInt(this, stateOffset, expect, update);
}
```

---

## ReentrantLock可重入锁实现

接下来我们离开AQS，来看看 **可重入锁 `ReentrantLock`** 的实现。通过对可重入锁的实现来更好理解整个AQS是怎么工作的。

### Lock接口

首先它继承自这样一个接口：

```java
public interface Lock {
    void lock();
    
    //除非当前线程被中断，否则阻塞当前线程，直到获取锁。
    void lockInterruptibly() throws InterruptedException;
    
    //尝试获取锁，如果成功则返回true，否则返回false。
    boolean tryLock();
    
    //尝试获取锁，如果在指定的时间内成功则返回true，否则返回false。
    boolean tryLock(long time, @NotNull TimeUnit unit) throws InterruptedException;
    
    //释放锁。
    void unlock();
}
```

**注意区别**：
- 第一个 **`lock`** 无论如何都会阻塞当前线程获取锁
- 第二个 **`lockInterruptibly`** 会在当前线程被中断时抛出`InterruptedException`异常

### ReentrantLock核心字段

在可重入锁中有两个主要字段：

```java
final Sync sync;

//默认锁的状态为0，表示没有被任何线程持有。
private volatile int state;
```

这个**state**和AQS当中的state是一样的，都是用来表示锁的状态。而**Sync**是一个抽象类，继承自AQS，表示同步器。

### Sync同步器实现

里面有这么几个关键方法：

```java
abstract void lock();

final boolean nonfairTryAcquire(int acquires){
    final Thread currentThread = Thread.currentThread();
    int c = getState();
    if(c == 0){
        if(compareAndSetState(0, acquires)){
            setExclusiveOwnerThread(currentThread);
            return true;
        }
    }
    else if(currentThread == getExclusiveOwnerThread()){
        int nextc = c + acquires;
        if(nextc < 0 ){
            throw new Error("Maximum lock count exceeded");
        }
        //更新锁的状态
        setState(nextc);
        return true;
    }
    return false;
}
```

这里面有一个尝试**非公平获取锁**的方式，我们在上文中提到了默认的AQS的整个状态是0，所以：
1. 一开始如果是0，当前这个进入的线程就直接拿到锁，并且把自己设置成**独占线程**
2. 因为它是一个**可重入锁**，所以如果还是当前线程尝试去拿第二次锁，它不会互斥，而是会直接把**state+1**，这样就可以实现一个**可重入性**
3. 如果不是可重入的线程，那么就会返回false，表示获取锁失败

### 释放锁方法

同时还有一个释放锁的方法：

```java
protected final boolean tryRelease(int releases){
    //1.计算释放后的新状态
    int c = getState() - releases;
    //2.如果当前线程不是锁的独占线程，抛出异常
    if(Thread.currentThread() != getExclusiveOwnerThread()){
        throw new IllegalMonitorStateException();
    }
    //3.判断锁是否完全释放
    boolean free = false;
    if(c == 0){
        //如果锁的状态为0，释放锁
        free = true;
        //删除独占线程
        setExclusiveOwnerThread(null);
    }
    setState(c);
    return free;
}
```

**释放流程**：
1. 获取锁减去对应的release中的值
2. 判断当前线程是否是独占线程，如果不是则抛出异常
3. 如果是独占线程，判断锁是否完全释放
4. 如果完全释放了，将独占线程设置为null，并且将锁的状态设置为0
5. 返回是否完全释放的状态

> **重要**：这样就实现了一个可重入锁的基本功能。

---

## 公平锁实现原理

我们从**公平锁**入手来看看，它是怎么利用AQS来做实现。

### FairSync公平同步器

首先这个 **`FairSync`** 类继承自`Sync`，并且重写了`lock`方法：

```java
static final class FairSync extends Sync {
    //公平锁的实现
    @Override
    public void lock() {
        acquire(1);
    }
}
```

### acquire获取锁流程

在可重入锁中，公平锁的实现是通过**`acquire`**方法来获取锁的。这个方法是AQS中的一个方法，用来获取锁。

```java
//在可重入锁中，这个arg参数通常是1，表示获取锁的次数。
public final void acquire(int arg) {
    if (!tryAcquire(arg) && acquireQueued(addWaiter(Node.EXCLUSIVE), arg)) {
        selfInterrupt();
    }
}
```

**获取锁的逻辑**：
1. 在进入排队之前，先尝试再获取一次锁（因为在做排队之前可能有锁被释放了，这样可以避免不必要的排队）
2. 如果获取成功了那就可以返回了
3. 如果获取失败了就创建一个新的节点，然后把这个节点放入**双向链表队列**当中，老老实实排队

### tryAcquire公平获取

这个**`tryAcquire`**方法在AQS中是没有做实现的，需要具体的子类去完成：

```java
protected boolean tryAcquire(int args) {
    throw new UnsupportedOperationException();
}
```

在**公平锁**中是这么重写的：

```java
//公平锁的获取方法
protected final boolean tryAcquire(int acquires){
    final Thread currentThread = Thread.currentThread();
    int c = getState();
    if(c == 0){
        //如果当前线程没有排队的前驱线程节点，那么就尝试获取锁
        if(!hasQueuedPredecessors()&&
            compareAndSetState(0, acquires)){
            //把自己设置为独占线程
            setExclusiveOwnerThread(currentThread);
            return true;
        }
    }
    else if(currentThread == getExclusiveOwnerThread()){
        int nextc = c + acquires;
        if(nextc < 0){
            throw new Error("Maximum lock count exceeded");
        }
        setState(nextc);
        return true;
    }
    return false;
}
```

**关键差异**：可以看到在这里它重写了sync的tryAcquire方法，不会存在只要是0就可以获取锁的情况，而是会先判断当前线程是否有**前驱节点**，如果没有前驱节点，那么就可以尝试获取锁。如果有前驱节点，那么就会返回false，表示获取锁失败。

### hasQueuedPredecessors前驱节点判断

在AQS当中是这么做到对是否存在前驱节点的判断：

```java
//判断是否当前线程在等待队列中有前驱节点。
public final boolean hasQueuedPredecessors() {
    Node t = tail;
    Node h = head;
    Node s;
    //如果头节点和尾节点不同，
    // 并且头节点的下一个节点不为空或者头节点的下一个节点的线程不是当前线程，则说明当前线程有前驱节点。
    return h != t && ((s = h.next) == null || s.thread != Thread.currentThread());
}
```

**判断逻辑的精妙之处**：
1. **基础判断**：`h != t` 判断头尾节点是否相同，如果相同说明队列为空或只有一个虚拟头节点
2. **并发窗口处理**：`(s = h.next) == null` 这个检查处理了一个极其微妙的并发窗口
   - 当一个节点通过 `enq` 方法入队时，`tail` 指针可能已经更新，但旧的 `tail` 的 `next` 指针还没来得及指向新节点
   - 在这种极端的中间状态下，`h.next` 可能为 `null`，但队列实际上已经有节点了
   - 这个检查保证了即使在这种情况下，新来的线程也能正确判断出队列"可能"有前驱，从而**维护了公平性**
3. **线程身份检查**：`s.thread != Thread.currentThread()` 确保当前线程不是队列中的第一个等待者

> **设计精髓**：这个方法不仅仅是防御性编程，它优雅地处理了高并发场景下的竞态条件，体现了AQS设计者对并发编程的深刻理解。

### shouldParkAfterFailedAcquire阻塞判断

在获取锁失败后，要判断当前线程是否需要阻塞，只有当前节点的前驱节点状态是**SIGNAL**时，才能放心阻塞。

```java
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    //获得前驱节点的状态
    int ws = pred.waitStatus;
    if (ws == Node.SIGNAL) {
        return true;
    }

    if (ws > 0) {
        do {
            node.prev = pred = pred.prev;
        }
        while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}
```

**阻塞判断逻辑**：
1. 首先获得前驱节点的状态，如果它是**SIGNAL**状态那么它可以直接返回true，表示你可以安心阻塞，等我获取到锁，我会叫醒你的
2. 如果当前前驱节点状态大于0说明它处于被取消的状态，在可重入锁中的表现就是，它超时了，或者被中断了，它取消了排队不获取锁了，这个时候会把当前节点一直向前移动，直到找到一个没取消的节点
3. 否则进入另一条分支，也就是前驱节点状态为0的情况，这个时候说明前驱节点是正常的，但是还没有设置**SIGNAL**状态。这个时候就会尝试通过**CAS操作**将前驱节点的状态设置为**SIGNAL**，这样就建立了一个**唤醒承诺**

> **SIGNAL的意义**：实质上这个状态是用来标记**前驱节点**会不会在它获取到锁后唤醒**后继节点**的，它会给后继节点一个承诺，告诉后继节点，"苟富贵毋相忘"，自己获取到锁后不会忘了后继节点的，会把后继节点从阻塞状态叫醒而不是让它一直睡下去。**SIGNAL状态设置在前驱节点上，表示前驱节点承诺唤醒后继节点**。

#### 简单示例：前驱节点承诺唤醒后继

让我们通过一个具体的场景来理解这个"承诺机制"：

**场景：队列中有 Node_X -> Node_Y**

1. **情况一：前驱节点状态为0（初始状态）**
```java
Node_X.waitStatus = 0  // 初始状态
Node_Y 尝试获取锁失败
shouldParkAfterFailedAcquire(Node_X, Node_Y) 被调用
```

**处理过程**：
```java
ws = Node_X.waitStatus  // ws = 0
compareAndSetWaitStatus(Node_X, 0, Node.SIGNAL)  // CAS设置SIGNAL
```
**结果**：
- Node_X.waitStatus 变为 SIGNAL (-1)
- 返回 false（需要再次尝试，确保设置成功）
- Node_X 对 Node_Y 作出承诺："我获得锁后会唤醒你"

2. **情况二：前驱节点已是SIGNAL**
```java
Node_X.waitStatus = SIGNAL  // 已经承诺过
Node_Y 再次调用 shouldParkAfterFailedAcquire
```

**处理过程**：
```java
ws = Node_X.waitStatus  // ws = SIGNAL (-1)
return true  // Node_Y可以安心阻塞
```
**结果**：
- 直接返回 true
- Node_Y 可以安全地进入阻塞状态
- Node_Y 相信 Node_X 的承诺，等待被唤醒

3. **情况三：前驱节点已取消**
```java
// 初始队列状态：head -> Node_W(CANCELLED) -> Node_X(CANCELLED) -> Node_Y
Node_Y 调用 shouldParkAfterFailedAcquire
```

**处理过程**：
```java
ws = Node_X.waitStatus  // ws > 0 (CANCELLED)
do {
    Node_Y.prev = Node_X.prev  // 跳过Node_X
    Node_X = Node_X.prev  // 继续检查Node_W
} while (Node_X.waitStatus > 0)  // Node_W也是CANCELLED，继续循环
// 最终找到head节点
head.next = Node_Y  // 链接修复完成
```
**结果**：
- Node_Y 跳过所有取消的节点
- 队列变为：`head -> Node_Y`
- 返回 false（需要下次循环重新检查）

> **设计精髓**：这个方法通过三种情况的处理，保证了：
> 1. 节点只有在确认有人承诺唤醒它时才会阻塞
> 2. 取消的节点会被自动跳过，维护队列的有效性
> 3. 通过多次循环确保设置SIGNAL的操作是成功的

---

## AQS核心方法解析

我们来分析一下AQS当中的一些核心方法，来更好理解它是如何工作的。

### acquireQueued获取锁排队

这个方法是整个AQS的核心，它实现了**自旋获取锁**的逻辑：

```java
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        for (;;) {
            final Node p = node.predecessor();
            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null; // help GC
                failed = false;
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node) &&
                parkAndCheckInterrupt())
                interrupted = true;
        }
    } finally {
        if (failed)
            cancelAcquire(node);
    }
}
```

**获取锁等待过程**：
1. 进入一个**自旋等待**，首先获得当前节点的前驱节点
2. 如果当前节点的前驱节点是**虚拟头节点**，说明前面已经没有节点了，说明它该尝试获取锁了
3. 等它获取锁成功它就把自己设置成头节点，它的前驱节点的next设置为null，然后返回是否被中断的状态

> **巧妙设计**：这里有个非常巧妙的地方，就是它不是直接删除了自己，而是把自己设置为新的**虚拟头节点**。

```java
private void setHead(Node node) {
    head = node;
    node.thread = null;
    node.prev = null;
}
```

**为什么这样设计？** 我们遐想一下如果直接删除了它自己，那么就需要原子更新前一个节点的prev和后一个节点的next，这样就涉及到多个状态的更新，而如果只是把自己设置为新的头节点，那么只需要更新头节点的状态就可以了。

> **setHead的设计哲学**：这里体现了AQS的一个重要设计哲学：**职责的转移**。这不仅仅是避免了复杂的原子更新，它本质上是将队列的元数据（head指针）的更新，与节点本身的状态（线程引用置空）绑定在了一起。**获得锁的线程成为了新的"地标"**，它不再需要排队，它的责任变成了未来唤醒下一个节点。这是一种从"等待者"到"守门人"的身份转换。

#### 简单示例：线程排队获取锁的过程

让我们通过一个简单的场景来直观感受"排队-抢锁-上位"的过程：

**初始状态**：
- 线程 A 持有锁（`state = 1`，`exclusiveOwnerThread = A`）
- 队列：`head (Node_H) -> null`

**线程 B 尝试获取锁**：

1. **入队过程**：
```java
Node_B = new Node(Thread.currentThread());  // 创建节点
Node_B.prev = tail;  // 链接到队尾
tail = Node_B;  // 更新队尾指针
```
队列变为：`head (Node_H) <-> Node_B (thread=B) <- tail`

2. **首次自旋**：
```java
p = Node_B.predecessor();  // p = Node_H
p == head  // true
tryAcquire(1)  // false，因为线程A持有锁
```

3. **准备阻塞**：
```java
shouldParkAfterFailedAcquire(Node_H, Node_B)  // 设置Node_H.waitStatus = SIGNAL
parkAndCheckInterrupt()  // 线程B阻塞
```
队列状态：`head (Node_H, ws=-1) <-> Node_B (thread=B) <- tail`

4. **线程A释放锁**：
```java
unlock()  // state = 0
unparkSuccessor(Node_H)  // 唤醒Node_B
```

5. **线程B被唤醒，第二次自旋**：
```java
p = Node_B.predecessor();  // p = Node_H
p == head  // true
tryAcquire(1)  // true，因为锁已释放
setHead(Node_B)  // B从"等待者"变为"持有者"
```

**最终状态**：
- 线程 B 持有锁（`state = 1`，`exclusiveOwnerThread = B`）
- 队列：`head (原Node_B, thread=null) -> null`
- Node_B 完成了从"等待者"到"守门人"的转变

> **关键理解**：acquireQueued 通过自旋和阻塞的结合，既保证了公平性（先到先得），又避免了无谓的CPU消耗。当线程获取锁成功后，通过setHead完成身份转换，优雅地维护了队列结构。

### shouldParkAfterFailedAcquire阻塞判断

在获取锁失败后，要判断当前线程是否需要阻塞，只有当前节点的前驱节点状态是**SIGNAL**时，才能放心阻塞。

```java
private static boolean shouldParkAfterFailedAcquire(Node pred, Node node) {
    //获得前驱节点的状态
    int ws = pred.waitStatus;
    if (ws == Node.SIGNAL) {
        return true;
    }

    if (ws > 0) {
        do {
            node.prev = pred = pred.prev;
        }
        while (pred.waitStatus > 0);
        pred.next = node;
    } else {
        compareAndSetWaitStatus(pred, ws, Node.SIGNAL);
    }
    return false;
}
```

**阻塞判断逻辑**：
1. 首先获得前驱节点的状态，如果它是**SIGNAL**状态那么它可以直接返回true，表示你可以安心阻塞，等我获取到锁，我会叫醒你的
2. 如果当前前驱节点状态大于0说明它处于被取消的状态，在可重入锁中的表现就是，它超时了，或者被中断了，它取消了排队不获取锁了，这个时候会把当前节点一直向前移动，直到找到一个没取消的节点
3. 否则进入另一条分支，也就是前驱节点状态为0的情况，这个时候说明前驱节点是正常的，但是还没有设置**SIGNAL**状态。这个时候就会尝试通过**CAS操作**将前驱节点的状态设置为**SIGNAL**，这样就建立了一个**唤醒承诺**

> **SIGNAL的意义**：实质上这个状态是用来标记**前驱节点**会不会在它获取到锁后唤醒**后继节点**的，它会给后继节点一个承诺，告诉后继节点，"苟富贵毋相忘"，自己获取到锁后不会忘了后继节点的，会把后继节点从阻塞状态叫醒而不是让它一直睡下去。**SIGNAL状态设置在前驱节点上，表示前驱节点承诺唤醒后继节点**。

### parkAndCheckInterrupt线程阻塞

成功设置**SIGNAL**状态后，当前节点就可以安心阻塞了。因为它保证等它前面的人醒了后会叫醒自己的。

```java
private final boolean parkAndCheckInterrupt() {
    LockSupport.park(this);
    return Thread.interrupted();
}
```

---

## 简单示例：无竞争情况下的锁获取

在深入复杂机制之前，我们先看一个最简单的例子：

### 场景：单线程获取锁

```java
ReentrantLock lock = new ReentrantLock(true); // 公平锁
```

**初始状态**：
- `state = 0`，`exclusiveOwnerThread = null`
- `head = null`，`tail = null`（队列未初始化）

**线程 A 调用 `lock.lock()`**：

1. 调用 `FairSync.tryAcquire(1)`
2. `state == 0`，`hasQueuedPredecessors()` 返回 `false`（队列为空）
3. `compareAndSetState(0, 1)` 成功
4. `setExclusiveOwnerThread(A)`
5. 直接返回，**整个过程没有触及队列机制**

**结果**：
- `state = 1`，`exclusiveOwnerThread = A`
- `head = null`，`tail = null`（队列依然未初始化）

> **关键理解**：在无竞争情况下，AQS的性能接近普通的CAS操作，这是一个重要的性能优化。


## AQS排队与唤醒机制

我们以**acquireQueued**这个方法为例，它是AQS当中用来获取锁的一个方法：

```java
final boolean acquireQueued(final Node node, int arg) {
    boolean failed = true;
    try {
        boolean interrupted = false;
        //自旋等待，直到当前节点的前驱节点是头节点，并且获取锁成功。
        for (; ; ) {

            final Node p = node.predecessor();

            if (p == head && tryAcquire(arg)) {
                setHead(node);
                p.next = null;
                failed = false;
                return interrupted;
            }
            if (shouldParkAfterFailedAcquire(p, node) && parkAndCheckInterrupt()) {
                interrupted = true;
            }
        }
    } finally {
        if (failed) {
            cancelAcquire(node);
        }
    }
}
```

**获取锁等待过程**：
1. 进入一个**自旋等待**，首先获得当前节点的前驱节点
2. 如果当前节点的前驱节点是**虚拟头节点**，说明前面已经没有节点了，说明它该尝试获取锁了
3. 等它获取锁成功它就把自己设置成头节点，它的前驱节点的next设置为null，然后返回是否被中断的状态

> **巧妙设计**：这里有个非常巧妙的地方，就是它不是直接删除了自己，而是把自己设置为新的**虚拟头节点**。

```java
private void setHead(Node node) {
    head = node;
    node.thread = null;
    node.prev = null;
}
```

**为什么这样设计？**我们遐想一下如果直接删除了它自己，那么就需要原子更新前一个节点的prev和后一个节点的next，这样就涉及到多个状态的更新，而如果只是把自己设置为新的头节点，那么只需要更新头节点的状态就可以了。

> **setHead的设计哲学**：这里体现了AQS的一个重要设计哲学：**职责的转移**。这不仅仅是避免了复杂的原子更新，它本质上是将队列的元数据（head指针）的更新，与节点本身的状态（线程引用置空）绑定在了一起。**获得锁的线程成为了新的"地标"**，它不再需要排队，它的责任变成了未来唤醒下一个节点。这是一种从"等待者"到"守门人"的身份转换。

### 简单示例：首次竞争与队列初始化

现在我们看看当出现第一次竞争时，AQS是如何初始化队列的：

**前置条件**：线程 A 已持有锁（`state = 1`，`exclusiveOwnerThread = A`）

**线程 B 调用 `lock.lock()`**：

#### 步骤1：尝试获取锁失败
```java
FairSync.tryAcquire(1) → false // 因为 state = 1
```

#### 步骤2：首次队列初始化
```java
addWaiter(Node.EXCLUSIVE)
```
- 创建 `Node_B(thread=B, waitStatus=0)`
- 因为 `tail == null`，调用 `enq(Node_B)` **首次初始化队列**
- `enq` 方法中：
  - `compareAndSetHead(new Node())` 成功，创建**虚拟头节点 `Node_H`**
  - `head = Node_H`, `tail = Node_H`
  - 第二次循环：将 `Node_B` 链接到队列

**队列状态**：
```
head -> [Node_H (ws=0)] <-> [Node_B (ws=0, thread=B)] <- tail
```

#### 步骤3：建立唤醒承诺
```java
acquireQueued(Node_B, 1)
```
- `Node_B.predecessor() == Node_H`，`Node_H == head`
- 再次尝试 `tryAcquire(1)` 失败
- 调用 `shouldParkAfterFailedAcquire(Node_H, Node_B)`
- **将 `Node_H.waitStatus` 设为 `SIGNAL`**（承诺唤醒后继）

**队列状态**：
```
head -> [Node_H (ws=-1)] <-> [Node_B (ws=0, thread=B)] <- tail
```

#### 步骤4：线程阻塞
- `parkAndCheckInterrupt()` → 线程 B 进入阻塞状态

> **重要概念**：虚拟头节点的 `SIGNAL` 状态表示"我承诺在合适的时候唤醒我的后继节点"。

---

### 简单示例：基本的唤醒过程

继续上面的例子，现在线程 A 释放锁：

**线程 A 调用 `lock.unlock()`**：

#### 步骤1：释放锁
```java
tryRelease(1) → true // state 从 1 变为 0，exclusiveOwnerThread = null
```

#### 步骤2：唤醒后继节点
```java
Node h = head; // Node_H
if (h != null && h.waitStatus != 0) { // -1 != 0
    unparkSuccessor(h);
}
```

#### 步骤3：unparkSuccessor 执行
- `Node_H.waitStatus` 从 `-1` 变为 `0`（履行承诺前清零）
- 找到后继节点 `Node_B`
- **`LockSupport.unpark(Node_B.thread)`** → 唤醒线程 B

#### 步骤4：线程 B 获取锁并职责转移
- 线程 B 从 `park` 返回，继续 `acquireQueued` 循环
- `tryAcquire(1)` 成功（`state = 0`，`hasQueuedPredecessors() = false`）
- **职责转移**：`setHead(Node_B)`
  - `head = Node_B`
  - `Node_B.thread = null`，`Node_B.prev = null`
  - Node_B 从"等待者"变为"守门人"

**最终队列状态**：
```
head -> [Node_B (ws=0, thread=null)] <- tail
```

> **职责转移的精髓**：获得锁的节点不是被"移除"，而是成为新的虚拟头节点，承担起未来唤醒后继者的责任。

---

## 取消排队与异常处理详解

现在我们深入了解AQS是如何处理更复杂的取消情况的。

当超过了很久很久它还没有被唤醒，理论上这个情况是因为超时或者被中断了，这个时候就会调用 **`cancelAcquire`** 方法来取消当前节点的排队。

### cancelAcquire取消获取锁

这个方法是用来处理在获取锁的过程中，线程被中断或者超时的情况。它会把当前节点的状态设置成**CANCELLED**，并且处理好前驱节点和后继节点的关系。

```java
private void cancelAcquire(Node node) {
    if (node == null)
        return;

    node.thread = null;

    Node pred = node.prev;
    while (pred.waitStatus > 0)
        node.prev = pred = pred.prev;

    Node predNext = pred.next;

    node.waitStatus = Node.CANCELLED;

    if (node == tail && compareAndSetTail(node, pred)) {
        compareAndSetNext(pred, predNext, null);
    } else {
        int ws;
        if (pred != head &&
            ((ws = pred.waitStatus) == Node.SIGNAL ||
             (ws <= 0 && compareAndSetWaitStatus(pred, ws, Node.SIGNAL))) &&
            pred.thread != null) {
            Node next = node.next;
            if (next != null && next.waitStatus <= 0)
                compareAndSetNext(pred, predNext, next);
        } else {
            unparkSuccessor(node);
        }

        node.next = node; // help GC
    }
}
```

**取消获取锁的处理步骤**：
1. 首先把当前节点的线程引用设置为null，表示这个节点已经不再被使用
2. 如果前驱节点也被取消了，那么它会一直向前寻找，直到找到一个没有被取消的节点，把当前节点的状态设置成**CANCELLED**
3. 如果它现在是尾节点，那么就直接将尾节点设置为前驱节点，并且将前驱节点的next设置为null
4. 当然也有可能它不是尾节点，那么就需要处理它的后继节点。如果前驱节点是有效的，那么就把这个它找到的正常的没有被取消的节点设置成SIGNAL状态，如果后继节点不为空，并且它没有被取消，就把这个它找到的正常的被设置成SIGNAL的找到的前驱节点的后继节点设置为它。不然，就直接从当前这个被取消的节点开始触发`unparkSuccessor(node);`

#### 简单示例：链表修复过程

让我们通过一个简单的场景来理解节点取消时的链表修复过程：

**初始队列状态**：
```
head -> Node_1 -> Node_2(即将取消) -> Node_3 -> tail
```

**Node_2 调用 cancelAcquire 的处理过程**：

1. **清理节点状态**：
```java
Node_2.thread = null  // 清除线程引用
Node_2.waitStatus = CANCELLED  // 标记为已取消
```

2. **寻找有效前驱**：
```java
pred = Node_2.prev  // pred = Node_1
// 假设 Node_1 状态正常，不需要向前寻找
```

3. **修复链接**：
```java
// 因为 Node_2 不是尾节点，进入else分支
pred = Node_1  // 有效前驱
next = Node_2.next  // next = Node_3

// 如果 Node_1 不是头节点且状态正常
compareAndSetWaitStatus(Node_1, 0, Node.SIGNAL)  // 设置SIGNAL承诺
compareAndSetNext(Node_1, Node_2, Node_3)  // 跳过Node_2
```

4. **最终状态**：
```
head -> Node_1(SIGNAL) -> Node_3 -> tail
(Node_2 仍在内存中，但已从队列逻辑断开，且 Node_2.next 指向自己)
```

> **关键理解**：
> 1. 取消操作通过修改前驱的next指针和后继的prev指针，将节点从逻辑上移除队列
> 2. 设置SIGNAL状态确保了队列的唤醒链不会断裂
> 3. 节点虽然被取消，但保证了其他节点的正常工作不受影响

### unparkSuccessor唤醒后继节点

这个方法是用来唤醒后继节点的，它会找到第一个可以唤醒的后继节点，并且唤醒它。

```java
private void unparkSuccessor(Node node) {
    int ws = node.waitStatus;
    if (ws < 0)
        compareAndSetWaitStatus(node, ws, 0);

    Node s = node.next;
    if (s == null || s.waitStatus > 0) {
        s = null;
        for (Node t = tail; t != null && t != node; t = t.prev)
            if (t.waitStatus <= 0)
                s = t;
    }
    if (s != null)
        LockSupport.unpark(s.thread);
}
```

#### 简单示例：尾部遍历寻找有效节点

让我们看一个具体的场景，理解为什么需要从尾部开始遍历：

**初始队列状态**：
```
head -> Node_1 -> Node_2(CANCELLED) -> Node_3(CANCELLED) -> Node_4 -> tail
```

**当 Node_1 释放锁时的处理过程**：

1. **检查直接后继**：
```java
s = Node_1.next  // s = Node_2
s.waitStatus > 0  // true，Node_2已取消
// 需要寻找其他有效后继
```

2. **从尾部遍历**：
```java
for (t = tail; t != Node_1; t = t.prev) {
    // 第一轮：t = Node_4，ws <= 0，记录 s = Node_4
    // 第二轮：t = Node_3，ws > 0，跳过
    // 第三轮：t = Node_2，ws > 0，跳过
    // 到达Node_1，结束循环
}
// 最终 s = Node_4
```

3. **唤醒有效后继**：
```java
LockSupport.unpark(Node_4.thread)  // 唤醒Node_4的线程
```

> **设计精髓**：
> 1. 从尾部遍历是为了在并发修改时找到最靠前的有效节点
> 2. 即使中间有取消的节点，也能保证找到并唤醒正确的后继
> 3. 通过这种机制，确保了队列中的有效节点最终都能被唤醒

---

## 解锁机制

解锁的过程是非常简单的：

```java
public final boolean release(int arg) {
    if (tryRelease(arg)) {
        Node h = head;
        if (h != null && h.waitStatus != 0) {
            unparkSuccessor(h);
        }
        return true;
    }
    return false;
}
```

**解锁流程**：
1. 尝试去释放锁，然后拿到头节点
2. 只有头节点不为null并且它是正常的没被取消的状态的时候，会调用 **`unparkSuccessor(h)`** 来唤醒后继节点

> **总结**：这样就完成了一整套完整的，可以解决超时、中断、取消排队的公平锁实现。

### selfInterrupt中断处理

```java
static void selfInterrupt() {
    Thread.currentThread().interrupt();
}
```

**为什么可以做一个阻塞？**因为它已经做了很多工作保证前一个节点是**SIGNAL**会唤醒自己了，所以它可以安心阻塞自己而不去做自旋了。


---



## 公平锁完整执行场景分析

我们通过一个复杂的多线程竞争场景来梳理公平锁的完整执行流程。

### 场景设定

假设有一个 **`ReentrantLock`（公平锁）** 和五个线程（A、B、C、D、E）。

### T0: 初始状态

**系统状态**：
- **锁状态**：`state = 0`（未被持有），`exclusiveOwnerThread = null`
- **AQS队列**：`head = null`，`tail = null`（队列为空）

### T1: 线程A获取锁

**执行流程**：
1. 线程A调用 `lock.lock()`
2. `FairSync.tryAcquire(1)` 执行：
   - `state == 0` ✓
   - `hasQueuedPredecessors()` 返回 `false`（队列为空）
   - `compareAndSetState(0, 1)` 成功
   - `setExclusiveOwnerThread(A)`

**结果状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = A`
- **AQS队列**：仍为空（无竞争）

### T2: 线程B尝试获取锁

**执行流程**：
1. 线程B调用 `lock.lock()`
2. `FairSync.tryAcquire(1)` 失败（`state = 1`）
3. 调用 `addWaiter(Node.EXCLUSIVE)` 创建节点并入队：
   - 队列首次初始化：创建虚拟头节点 `Node_H`
   - 将 `Node_B` 链接到队列尾部
4. 进入 `acquireQueued` 自旋：
   - 设置 `Node_H.waitStatus = SIGNAL`（承诺唤醒后继）
   - 线程B进入阻塞状态

**结果状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = A`
- **AQS队列**：`head -> Node_H(ws=-1) <-> Node_B(ws=0, thread=B) <- tail`

### T3: 线程C、D相继入队

**执行流程**：
线程C和D分别尝试获取锁失败，按相同流程入队并阻塞。

**结果状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = A`
- **AQS队列**：
  ```
  head -> Node_H(ws=-1) <-> Node_B(ws=-1, thread=B) <-> 
          Node_C(ws=-1, thread=C) <-> Node_D(ws=0, thread=D) <- tail
  ```

### T4: 线程E超时获取锁

**执行流程**：
1. 线程E调用 `tryLock(5, TimeUnit.SECONDS)`
2. 进入 `doAcquireNanos` 方法
3. 创建 `Node_E` 并入队
4. 设置 `Node_D.waitStatus = SIGNAL`
5. 调用 `LockSupport.parkNanos(this, nanosTimeout)` 带超时阻塞

**结果状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = A`
- **AQS队列**：
  ```
  head -> Node_H(ws=-1) <-> Node_B(ws=-1, thread=B) <-> 
          Node_C(ws=-1, thread=C) <-> Node_D(ws=-1, thread=D) <-> 
          Node_E(ws=0, thread=E) <- tail
  ```

### T5: 线程A释放锁

**执行流程**：
1. 线程A调用 `unlock()`
2. `tryRelease(1)` 执行：
   - `state` 从 `1` 变为 `0`
   - `exclusiveOwnerThread` 设为 `null`
3. 调用 `unparkSuccessor(Node_H)`：
   - `Node_H.waitStatus` 从 `-1` 变为 `0`
   - 唤醒线程B：`LockSupport.unpark(Node_B.thread)`

**结果状态**：
- **锁状态**：`state = 0`，`exclusiveOwnerThread = null`
- **AQS队列**：`head -> Node_H(ws=0) <-> Node_B(ws=0, thread=B) <-> ...`

### T6: 线程B获取锁

**执行流程**：
1. 线程B从 `park` 状态被唤醒
2. 在 `acquireQueued` 循环中：
   - `p = Node_B.predecessor()` 得到 `Node_H`
   - `p == head` 成立
   - `tryAcquire(1)` 成功（队列头部，符合公平性）
3. 执行 `setHead(Node_B)`：
   - `head = Node_B`
   - `Node_B.thread = null`，`Node_B.prev = null`

**结果状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = B`
- **AQS队列**：`head -> Node_B(ws=0) <-> Node_C(ws=-1, thread=C) <-> ...`

### T7: 线程C超时取消

**执行流程**：
1. 线程C的超时时间到达
2. 调用 `cancelAcquire(Node_C)`：
   - `Node_C.thread = null`
   - `Node_C.waitStatus = CANCELLED`
   - 修复链表：`Node_B.next` 直接指向 `Node_D`
   - 设置 `Node_B.waitStatus = SIGNAL`（承诺唤醒Node_D）

**结果状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = B`
- **AQS队列**：
  ```
  head -> Node_B(ws=-1) <-> Node_D(ws=-1, thread=D) <-> 
          Node_E(ws=0, thread=E) <- tail
  ```
- **被取消**：`Node_C`（已断开链接）

### T8: 线程B释放锁，线程D获取锁

**执行流程**：
1. 线程B释放锁
2. 唤醒线程D
3. 线程D获取锁成功并成为新的头节点

**结果状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = D`
- **AQS队列**：`head -> Node_D(ws=0) <-> Node_E(ws=0, thread=E) <- tail`

### T9: 线程E超时取消

**执行流程**：
1. 线程E超时被唤醒
2. 调用 `cancelAcquire(Node_E)`：
   - 由于是尾节点，直接更新 `tail` 指向 `Node_D`
   - `Node_D.next = null`

**最终状态**：
- **锁状态**：`state = 1`，`exclusiveOwnerThread = D`
- **AQS队列**：`head -> Node_D(ws=0) <- tail`

---

### 关键机制总结

通过这个复杂场景，我们可以看到AQS的几个关键机制：

1. **公平性保证**：通过 `hasQueuedPredecessors()` 确保先到先得
2. **SIGNAL承诺机制**：前驱节点承诺唤醒后继节点
3. **职责转移**：获得锁的节点成为新的虚拟头节点
4. **取消处理**：优雅地处理超时和中断，维护队列完整性
5. **链表修复**：取消节点时自动修复前驱和后继的链接关系

* **AQS 队列：** `head -> Node_D (ws=0)` <- `tail`

* (`Node_H`, `Node_B`, `Node_C`, `Node_E` 仍在内存，但 `ws=1` 且已从链表逻辑断开。)