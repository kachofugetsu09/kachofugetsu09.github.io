# CS186 Project 4 深度解析与实现

本文是对 UC Berkeley CS186 数据库课程 Project 4: Locking 的个人总结与实现思路分享。

Proj4 是前四个里面我目前认为最烧脑的一个

# Task 1: LockType

这个任务的核心是实现对不同锁类型之间关系的判断。

> **任务要求:**
> 你需要实现 `compatible` 、 `canBeParentLock` 和 `substitutable` 方法。

具体来说，`LockType` 类中的三个关键方法需要我们实现：

1.  `compatible(a, b)`: 判断在同一个资源上，当事务已持有锁 `a` 时，另一个事务是否可以请求并获得锁 `b`。
2.  `canBeParentLock(parent, child)`: 判断当父资源（如表）上持有了 `parent` 锁时，其子资源（如页）上是否可以持有 `child` 锁。这是多粒度锁定的核心。
3.  `substitutable(substitute, required)`: 判断 `substitute` 锁是否可以替代 `required` 锁。替代锁的权限必须大于或等于被替代的锁。

---

### 1.1 `compatible` 方法：判断锁兼容性

**目标:** 判断两种锁类型是否兼容。

实现 `compatible` 方法最直接的参考就是官方提供的锁兼容性矩阵。这个矩阵定义了当一个事务已经持有某种锁（行）时，另一个事务请求另一种锁（列）是否会被允许。

| **已持有锁 (a) \ 请求锁 (b)** | NL   | IS   | IX   | S    | SIX  | X    |
| :---------------------------- | :--: | :--: | :--: | :--: | :--: | :--: |
| **NL**                        |  T   |  T   |  T   |  T   |  T   |  T   |
| **IS**                        |  T   |  T   |  T   |  T   |  T   |  F   |
| **IX**                        |  T   |  T   |  T   |  F   |  F   |  F   |
| **S**                         |  T   |  T   |  F   |  T   |  F   |  F   |
| **SIX**                       |  T   |  T   |  F   |  F   |  F   |  F   |
| **X**                         |  T   |  F   |  F   |  F   |  F   |  F   |

**逻辑解析:**

为了更深刻地理解这个矩阵，我们逐一分析每种请求锁的逻辑：

1.  **请求 NL (No Lock)**: **NL** 锁是“无锁”状态，不施加任何限制，因此它与任何已持有的锁都兼容。
2.  **请求 IS (Intention Shared)**: 意向共享锁，表示事务**打算**在更细的粒度上加 **S** 锁。它只与 **X** 锁冲突。因为如果已有事务持有 **X** 锁（排他锁）那么则不允许任何其他事务（即使是意向）来读取。
3.  **请求 IX (Intention Exclusive)**: 意向排他锁，表示事务**打算**在更细的粒度上加 **X** 锁。它与 **S**, **SIX**, **X** 锁冲突。因为这些锁都包含共享（**S**）或排他（**X**）的成分，不允许其他事务有写入的**意图**。例如，如果已有事务持有 **S** 锁（正在读取），则不能允许另一个事务产生写入意图，这会破坏读一致性。
4.  **请求 S (Shared)**: 共享锁，用于读取。多个事务可以同时持有 **S** 锁。因此，它可以与 **NL** 和 **IS** 兼容。它不能与 **IX**, **SIX**, **X** 兼容，因为这些锁都包含了写入（或意图写入）的权限，会干扰读取。
5.  **请求 SIX (Shared with Intention Exclusive)**: **S** + **IX** 的组合锁。持有此锁的事务可以读取整个资源，并打算在内部更新。它只与 **NL** 和 **IS** 兼容。任何包含 **S** 或 **X** 的锁都会与其冲突。
6.  **请求 X (Exclusive)**: 排他锁，用于写入。它是最严格的锁，与除 **NL** 之外的所有锁都不兼容，实现“独占”访问。

**代码实现:**

```java
public static boolean compatible(LockType a, LockType b) {
    if (a == null || b == null) {
        throw new NullPointerException("null lock type");
    }

    // TODO(proj4_part1): implement
    switch (b){
        case S:
            return a== S|| a == IS|| a == NL;
        case X:
            return a==NL;
        case IS:
            return a== S|| a == IS||a ==IX|| a == SIX|| a == NL;
        case IX:
            return a == IS || a == IX || a == NL;
        case SIX:
            return a == LockType.IS|| a == NL;
        case NL:
            return true;
        default:
            return false;
    }
}
```

---

### 1.2 `canBeParentLock` 方法：判断父子锁关系

**目标:** 在多粒度锁定的层级结构中，判断父节点的锁类型是否允许子节点持有特定的锁类型。

**父子锁关系矩阵:**

| **父锁 (a) \ 子锁 (b)** | NL   | IS   | IX   | S    | SIX  | X    |
| :---------------------- | :--: | :--: | :--: | :--: | :--: | :--: |
| **NL**                  |  T   |  F   |  F   |  F   |  F   |  F   |
| **IS**                  |  T   |  T   |  F   |  T   |  F   |  F   |
| **IX**                  |  T   |  T   |  T   |  T   |  T   |  T   |
| **S**                   |  T   |  F   |  F   |  F   |  F   |  F   |
| **SIX**                 |  T   |  T   |  T   |  T   |  T   |  T   |
| **X**                   |  T   |  T   |  T   |  T   |  T   |  T   |

**逻辑解析:**

这个方法确保了锁的意图从上至下是合理的。

1.  **父锁为 NL 或 S**: 如果父节点是 **NL** (无锁) 或 **S** (共享读)，它没有向下授权修改的意图。因此，子节点不能持有任何意向锁或排他锁，只能是 **NL**。如果父节点是 **S** 锁，意味着整个子树都在被读取，子节点不能单独加锁改变状态。
2.  **父锁为 IS**: 父节点有读意图，那么子节点可以持有 **NL** (无操作)、**IS** (继续向下传递读意图) 或 **S** (直接在子节点上读取)。不允许持有 **IX**, **SIX**, **X**，因为父节点没有写意图。
3.  **父锁为 IX, SIX, 或 X**: 这些父锁都包含了写意图 (**IX**) 或直接的排他控制 (**X**)。它们为子树提供了强大的控制权限，因此允许子节点持有任何类型的锁。父锁已经声明了最强的意图或控制，子节点的任何操作都在其“管辖”范围内。

**代码实现:**

```java
public static boolean canBeParentLock(LockType parentLockType, LockType childLockType) {
    if (parentLockType == null || childLockType == null) {
        throw new NullPointerException("null lock type");
    }
    // TODO(proj4_part1): implement
    switch (parentLockType){
        case NL:
        case S:
            return childLockType == NL;
        case IS:
            return childLockType.equals(LockType.IS)||
                    childLockType.equals(LockType.S)||
                    childLockType.equals(LockType.NL);
        case IX:
        case SIX:
        case X:
            return true;
    }

    return false;
}
```

---

### 1.3 `substitutable` 方法：判断锁的可替代性

**目标:** 检查一种锁类型 (`substitute`) 是否可以替代另一种 (`required`)。

> 这种情况只有在拥有 `substitute` 的事务能做所有拥有 `required` 的事务能做的事情时才成立。另一种理解方式是：让事务请求所需的锁。如果我们偷偷给它替代锁，会有任何问题吗？例如，如果事务请求了 X 锁，而我们悄悄给它 S 锁，当事务尝试写入资源时就会出问题。因此，`substitutable(S, X) = false`。

简单来说，替代锁的权限必须 **大于或等于** 被请求的锁。

**锁替代性矩阵:**

| **替代者 (a) \ 被要求者 (b)** | NL   | IS   | IX   | S    | SIX  | X    |
| :---------------------------- | :--: | :--: | :--: | :--: | :--: | :--: |
| **NL**                        |  T   |  F   |  F   |  F   |  F   |  F   |
| **IS**                        |  T   |  T   |  F   |  F   |  F   |  F   |
| **IX**                        |  T   |  T   |  T   |  F   |  F   |  F   |
| **S**                         |  T   |  F   |  F   |  T   |  F   |  F   |
| **SIX**                       |  T   |  T   |  T   |  T   |  T   |  F   |
| **X**                         |  T   |  T   |  T   |  T   |  T   |  T   |

**逻辑解析:**

1.  **用 NL 替代**: **NL** 是最弱的，只能替代它自己。
2.  **用 IS 替代**: **IS** (读意图) 权限大于 **NL**，可以替代 **NL** 和 **IS**。但它没有写的权限或意图，不能替代其他锁。
3.  **用 IX 替代**: **IX** (写意图) 权限大于 **IS** (读意图)，所以可以替代 **NL**, **IS**, **IX**。但它只是“意图”，没有实际的读写权限，所以不能替代 **S**, **SIX**, **X**。
4.  **用 S 替代**: **S** (共享读) 只能替代 **NL** 和 **S**。它与意向锁是不同维度的权限，不能相互替代。
5.  **用 SIX 替代**: **SIX** = **S** + **IX**。它包含了 **S** 的读权限和 **IX** 的写意图，权限比 **S** 和 **IX** 都大，所以可以替代 **NL, IS, IX, S, SIX**。但它没有最终的排他写权限，不能替代 **X**。
6.  **用 X 替代**: **X** (排他) 是权限最高的锁，可以做任何事，因此可以替代所有其他类型的锁。

**代码实现:**

```java
public static boolean substitutable(LockType substitute, LockType required) {
    if (required == null || substitute == null) {
        throw new NullPointerException("null lock type");
    }
    // TODO(proj4_part1): implement

    switch (substitute) {
        case NL:
            return required == NL;
        case IS:
            return required == IS || required == NL;
        case IX:
            return required == LockType.IX || required == LockType.IS || required == LockType.NL;
        case S:
            return required != X && required != IX && required != SIX&& required != IS;
        case SIX:
            return required == LockType.NL || required == LockType.IS ||
                    required == LockType.IX || required == LockType.S ||
                    required == LockType.SIX;
        case X:
            return true;

    }
    return false;
}
```

---

# Task 2: LockManager

> **任务要求:**
> 你需要实现 `LockManager` 中的以下方法：
>
> *   `acquireAndRelease`: 原子性地获取一个锁并释放零个或多个锁。此操作拥有高优先级，应插队到等待队列的最前端。
> *   `acquire`: 标准的锁获取方法。如果无法立即获取，则在等待队列末尾排队。
> *   `release`: 标准的锁释放方法。
> *   `promote`: 显式地将锁升级为更强的类型。此操作也拥有高优先级。
> *   `getLockType`: 查询事务在特定资源上持有的锁类型。

---

在实现 `LockManager` 之前，我们需要先完成其核心辅助类 `ResourceEntry`。这个类负责管理 **单个资源** 上的所有锁以及对应的等待队列。

### 2.1 `ResourceEntry` 辅助类实现

`ResourceEntry` 内部维护着一个持有锁的列表 (`locks`) 和一个等待锁的请求队列 (`waitingQueue`)。

#### `checkCompatible` 方法

**实现目标:** 检查一个新请求的锁是否与资源上已有的锁兼容。

**实现逻辑:** 遍历当前资源上所有已持有的锁。对于每一个锁，如果它不属于发起请求的事务（由 `except` 参数指定事务ID），就调用 `LockType.compatible` 方法来判断兼容性。一旦发现任何不兼容的锁，立刻返回 `false`。如果遍历完所有锁都没有冲突，则返回 `true`。

**具体实现代码:**
```java
      public boolean checkCompatible(LockType lockType, long except) {
            for(Lock lock: locks){
                if (lock.transactionNum != except && !LockType.compatible(lock.lockType, lockType)) {
                    return false;
                }
            }
            return true;
        }
```

---

#### `grantOrUpdateLock` 方法

**实现目标:** 为事务授予新锁，或更新其在同一资源上已持有的锁。

**实现逻辑:** 首先，查找当前事务是否已持有该资源的锁。
*   如果已持有（`existingLock != null`），则先移除旧锁，再添加新锁，完成锁的更新（例如，在锁升级 `promote` 时）。
*   如果未持有，则直接添加新锁。

最后，必须同步更新 `LockManager` 中全局的 `transactionLocks` 映射，以确保事务持���的所有锁记录保持一致。

**具体实现代码:**
```java
public void grantOrUpdateLock(Lock lock) {
            // TODO(proj4_part1): implement
            long transNum = lock.transactionNum;

            Lock existingLock = null;
            for(Lock l : locks){
                if(l.transactionNum == transNum){
                    existingLock = l;
                    break;
                }
            }

            if(existingLock != null){
                locks.remove(existingLock);
                locks.add(lock);
            }
            else{
                locks.add(lock);
            }

            transactionLocks.putIfAbsent(transNum, new ArrayList<>());
            if (existingLock != null) {
                transactionLocks.get(transNum).remove(existingLock);
            }
            transactionLocks.get(transNum).add(lock);
        }

```

---

#### `releaseLock` 方法

**实现目标:** 释放事务持有的锁，并尝试处理等待队列中的下一个请求。

**实现逻辑:** 从 `locks` 列表中移除要释放的锁，并同步更新 `transactionLocks` 映射。关键在于，释放锁后必须调用 `processQueue()` 方法，以检查并授权等待队列中可能因本次释放而变得兼容的锁请求。

**具体实现代码:**
```java
public void releaseLock(Lock lock) {
            // TODO(proj4_part1): implement
            locks.remove(lock);

            long transNum = lock.transactionNum;
            List<Lock> transLocks = transactionLocks.get(transNum);
            if (transLocks != null) {
                transLocks.remove(lock);
                if (transLocks.isEmpty()) {
                    transactionLocks.remove(transNum);
                }
            }

            processQueue();
        }
```

---

#### `processQueue` 方法

**实现目标:** 按顺序处理等待队列，授权所有兼容的锁请求。

**实现逻辑:** 这是一个先进先出（FIFO）的处理过程。从队列头部开始迭代，对每个 `LockRequest`，检查其请求的锁是否与当前资源上所有已授权的锁兼容。
*   如果兼容，就调用 `grantOrUpdateLock` 授予该锁，将请求移出队列，并调用 `request.transaction.unblock()` 唤醒被阻塞的事务。
*   如果不兼容，则 **立即停止** 处理。因为队列中后续的请求也必须等待当前这个请求被满足。

**具体实现代码:**
```java
private void processQueue() {
            Iterator<LockRequest> iterator = waitingQueue.iterator();
            while (iterator.hasNext()) {
                LockRequest request = iterator.next();
                Lock lock = request.lock;
                long transNum = lock.transactionNum;

                if (checkCompatible(lock.lockType, transNum)) {
                    grantOrUpdateLock(lock);
                    iterator.remove();
                    request.transaction.unblock();
                } else {
                    break;
                }
            }
        }
```

---

#### 其他辅助方法

**实现目标:** 完成 `addToQueue` 和 `getTransactionLockType` 两个简单的辅助方法。

**实现逻辑:**
*   `addToQueue`: 根据 `addFront` 参数，将锁请求添加到等待队列的头部（高优先级）或尾部（普通优先级）。
*   `getTransactionLockType`: 遍历 `locks` 列表，返回指定事务ID持有的锁类型。如果未找到，则返回 `LockType.NL`。

**具体实现代码:**
```java
 public void addToQueue(LockRequest request, boolean addFront) {
            // TODO(proj4_part1): implement
            if(addFront){
                waitingQueue.addFirst(request);
            } else {
                waitingQueue.addLast(request);
            }
        }
```
```java
        public LockType getTransactionLockType(long transaction) {
            // TODO(proj4_part1): implement

            for(Lock lock : locks){
                if(lock.transactionNum == transaction){
                    return lock.lockType;
                }
            }
            return LockType.NL;
        }
```

---

### 2.2 `LockManager` 主体逻辑实现

在 `ResourceEntry` 的支持下，我们可以开始实现 `LockManager` 的核心方法。

#### `acquireAndRelease` 方法

**实现目标:** 原子性地获取一个锁，并释放零个或多个锁，此操作具有高优先级。

**实现逻辑:**
1.  **前置检查:** 抛出异常：如果事务重复请求已持有的同类型锁（且该锁不在释放列表里），或试图释放未持有的锁。
2.  **兼容性检查:** 调用 `entry.checkCompatible` 检查请求的锁是否兼容。
3.  **执行或排队:**
    *   **兼容:** 调用 `entry.grantOrUpdateLock` 授予新锁，然后遍历 `releaseNames` 列表，释放所有指定的旧锁。
    *   **不兼容:** 创建一个 `LockRequest`，通过 `entry.addToQueue(request, true)` 将其插入等待队列的 **最前端**。
4.  **阻塞事务:** 如果不兼容，设置 `shouldBlock = true`，并在 `synchronized` 代码块之外调用 `transaction.block()` 阻塞当前事务。

**具体实现代码:**
```java
    public void acquireAndRelease(TransactionContext transaction, ResourceName name,
                                  LockType lockType, List<ResourceName> releaseNames)
            throws DuplicateLockRequestException, NoLockHeldException {
        
        boolean shouldBlock = false;
        long transNum = transaction.getTransNum();

        synchronized (this) {
            ResourceEntry entry = getResourceEntry(name);


            LockType currentLock = entry.getTransactionLockType(transNum);
            if (currentLock == lockType && !releaseNames.contains(name)) {
                throw new DuplicateLockRequestException("Transaction " + transNum +
                        " already holds a lock on " + name + " of type " + lockType);
            }
            for (ResourceName releaseName : releaseNames) {
                ResourceEntry releaseEntry = getResourceEntry(releaseName);
                if (releaseEntry.getTransactionLockType(transNum) == LockType.NL) {
                    throw new NoLockHeldException("Transaction " + transNum +
                            " does not hold a lock on " + releaseName);
                }
            }


            if (!entry.checkCompatible(lockType, transNum)) {
                shouldBlock = true;
                Lock newLock = new Lock(name, lockType, transNum);
                LockRequest request = new LockRequest(transaction, newLock);
                entry.addToQueue(request, true);
            } else { 
            
                Lock newLock = new Lock(name, lockType, transNum);
                entry.grantOrUpdateLock(newLock);

                for (ResourceName releaseName : releaseNames) {
                    if (!releaseName.equals(name)) {  // 跳过当前资源
                        ResourceEntry releaseEntry = getResourceEntry(releaseName);
                        Lock lockToRelease = null;
                        for (Lock lock : releaseEntry.locks) {
                            if (lock.transactionNum == transNum) {
                                lockToRelease = lock;
                                break;
                            }
                        }
                        if (lockToRelease != null) {
                            releaseEntry.releaseLock(lockToRelease);
                        }
                    }
                }
            }
        }

        if (shouldBlock) {
            transaction.prepareBlock();
            transaction.block();
        }
    }
```

---

#### `acquire` 方法

**实现目标:** 标准的锁获取方法，遵循公平的排队策略。

**实现逻辑:**
1.  **前置检查:** 如果事务已持有该资源的任何非NL锁，则抛出 `DuplicateLockRequestException`。
2.  **兼容性与公平性检查:** 检查必须同时满足两个条件才能立即获取锁：
    *   `resourceEntry.checkCompatible(lockType, transNum)`: 请求的锁与现有锁兼容。
    *   `resourceEntry.waitingQueue.isEmpty()`: 等待队列为空，保证公平性。
3.  **执行或排队:**
    *   **满足条件:** 调用 `resourceEntry.grantOrUpdateLock` 授予锁。
    *   **不满足条件:** 创建 `LockRequest`，通过 `entry.addToQueue(request, false)` 将其插入等待队列的 **末尾**。
4.  **阻塞事务:** 如果需要排队，则在同步块外阻塞事务。

**具体实现代码:**
```java
public void acquire(TransactionContext transaction, ResourceName name,
                        LockType lockType) throws DuplicateLockRequestException {
        boolean shouldBlock = false;
        long transNum = transaction.getTransNum();

        synchronized (this) {
            ResourceEntry resourceEntry = getResourceEntry(name);
            LockType currentLock= resourceEntry.getTransactionLockType(transNum);
            if(currentLock != LockType.NL){
                throw new DuplicateLockRequestException("Transaction " + transNum +
                        " already holds a lock on " + name + " of type " + currentLock);
            }
            if(!resourceEntry.checkCompatible(lockType, transNum)||
                    !resourceEntry.waitingQueue.isEmpty()){
                shouldBlock = true;
                resourceEntry.addToQueue(new LockRequest(transaction,
                        new Lock(name, lockType, transNum)), false);
            }
            else{
                Lock newLock = new Lock(name, lockType, transNum);
                resourceEntry.grantOrUpdateLock(newLock);
            }
        }
        if (shouldBlock) {
            transaction.prepareBlock();
            transaction.block();
        }
    }
```

---

#### `release` 方法

**实现目标:** 标准的锁释放方法。

**实现逻辑:**
1.  **前置检查:** 确保事务持有要释放的锁，否则抛出 `NoLockHeldException`。
2.  **释放锁:** 从 `ResourceEntry` 的锁列表中找到对应的锁，并调用 `entry.releaseLock(lockToRelease)`。该方法会负责移除锁并自动调用 `processQueue` 来唤醒等待的事务。

**具体实现代码:**
```java
public void release(TransactionContext transaction, ResourceName name)
            throws NoLockHeldException {
        synchronized (this) {
            long transNum = transaction.getTransNum();
            ResourceEntry entry = getResourceEntry(name);

            if (entry.getTransactionLockType(transNum) == LockType.NL) {
                throw new NoLockHeldException("Transaction " + transNum +
                        " does not hold a lock on " + name);
            }

            Lock lockToRelease = null;
            for (Lock lock : entry.locks) {
                if (lock.transactionNum == transNum) {
                    lockToRelease = lock;
                    break;
                }
            }

            if (lockToRelease != null) {
                entry.releaseLock(lockToRelease);
            }
        }
    }
```

---

#### `promote` 方法

**实现目标:** 将一个已持有的锁升级为更强的锁，此操作具有高优先级。

**实现逻辑:**
1.  **前置检查:**
    *   `NoLockHeldException`: 事务未持有任何锁。
    *   `DuplicateLockRequestException`: 事务已持有目标升级锁类型。
    *   `InvalidLockException`: 目标锁类型的权限并不比当前锁更高（通过 `LockType.substitutable` 判断）。
2.  **兼容性检查:** 检查升级后的 `newLockType` 是否与资源上的其他锁兼容。
3.  **执行或排队:**
    *   **兼容:** 调用 `entry.grantOrUpdateLock` 将旧锁原子性地替换为新锁。
    *   **不兼容:** 创建 `LockRequest`，并将其插入等待队列的 **最前端**。
4.  **阻塞事务:** 如果需要排队，则在同步块外阻塞事务。

**具体实现代码:**
```java
public void promote(TransactionContext transaction, ResourceName name,
                        LockType newLockType)
            throws DuplicateLockRequestException, NoLockHeldException, InvalidLockException {
        // TODO(proj4_part1): implement
        // You may modify any part of this method.
        boolean shouldBlock = false;
        long transNum = transaction.getTransNum();
        
        synchronized (this) {
            ResourceEntry entry = getResourceEntry(name);
            LockType currentLock = entry.getTransactionLockType(transNum);
            
            if (currentLock == LockType.NL) {
                throw new NoLockHeldException("Transaction " + transNum +
                        " does not hold a lock on " + name);
            }
            
            if (currentLock == newLockType) {
                throw new DuplicateLockRequestException("Transaction " + transNum +
                        " already has a lock of type " + newLockType + " on " + name);
            }
            
            if (!LockType.substitutable(newLockType, currentLock)) {
                throw new InvalidLockException("Cannot promote from " + currentLock + 
                        " to " + newLockType + " - not substitutable");
            }
            
            if (!entry.checkCompatible(newLockType, transNum)) {
                shouldBlock = true;
                Lock newLock = new Lock(name, newLockType, transNum);
                LockRequest request = new LockRequest(transaction, newLock);
                entry.addToQueue(request, true);
            } else {
                Lock newLock = new Lock(name, newLockType, transNum);
                entry.grantOrUpdateLock(newLock);
            }
        }
        
        if (shouldBlock) {
            transaction.prepareBlock();
            transaction.block();
        }
    }
```

---

#### `getLockType` 方法

**实现目标:** 查询事务在特定资源上持有的锁类型。

**实现逻辑:** 这是最简单的方法。只需获取资源的 `ResourceEntry`，然后调用其 `getTransactionLockType` 方法即可。

**具体实现代码:**
```java
 public synchronized LockType getLockType(TransactionContext transaction, ResourceName name) {
        // TODO(proj4_part1): implement
        ResourceEntry resourceEntry = getResourceEntry(name);
        return resourceEntry.getTransactionLockType(transaction.getTransNum());
    }
```

至此，`LockManager` 的所有核心功能都已完成。



---



#  Task3 LockContext