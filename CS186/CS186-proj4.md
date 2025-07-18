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

最后，必须同步更新 `LockManager` 中全局的 `transactionLocks` 映射，以确保事务持有的所有锁记录保持一致。

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



# Task3: LockContext 



这是我个人认为整个 Project 4 中最烧脑的一个部分。`LockContext` 类是多粒度锁定策略的核心，它抽象了资源层级结构中的单个节点，并负责在该节点上执行所有多粒度锁操作，同时确保层次化约束始终得到满足。

> **任务要求:**
>
> LockContext 类代表层次结构中的单个资源；所有多粒度操作（例如，在获取或执行锁升级之前确保你拥有适当的意图锁）都在这里实现。
>
> 您需要实现 LockContext 中的以下方法：
>
> - `acquire` ：此方法在确保满足所有多粒度约束后，通过底层 `LockManager` 执行获取。例如，如果事务具有 IS(database) 并请求 X(table)，必须抛出适当的异常（见方法上方注释）。如果一个事务有一个 SIX 锁，那么它对任何后代资源拥有 IS/S 锁是多余的。因此，在我们的实现中，如果祖先有 SIX，我们禁止获取 IS/S 锁，并认为这是无效请求。
> - `release` ：此方法在确保释放后仍然满足所有多粒度约束后，通过底层 `LockManager` 执行释放。例如，如果事务具有 X(table) 并尝试释放 IX(database)，必须抛出适当的异常（见方法上方注释）。
> - `promote` : 该方法在确保满足所有多粒度约束后，通过底层 `LockManager` 执行锁升级。例如，如果事务具有 IS(database)且请求从 S(table)升级到 X(table)，必须抛出适当的异常（见方法上方注释）。在从 IS/IX/S 升级到 SIX 的特殊情况下，您应同时释放所有 S/IS 类型的后代锁，因为我们不允许在持有 SIX 锁时，后代上存在 IS/S 锁。如果祖先已持有 SIX 锁，您还应禁止升级到 SIX 锁，因为这将是冗余的。
> - `escalate` : 此方法执行锁升级至当前级别（详见下文）。由于多个事务（在不同线程上运行）允许交错调用多个 `LockManager` ，你必须确保仅对 `LockManager` 使用一次变异数据调用，并且仅从 `LockManager` 请求有关当前事务的信息（因为查询与获取之间的任何其他事务相关信息可能会发生变化）。
> - `getExplicitLockType` : 此方法返回当前级别上显式持有的锁的类型。例如，如果事务对数据库有 X(db)， `dbContext.getExplicitLockType(transaction)` 应返回 X，但 `tableContext.getExplicitLockType(transaction)` 应返回 NL（未显式持有锁）。
> - `getEffectiveLockType` : 这个方法返回当前级别上隐式或显式持有的锁的类型。
>
> 由于意向锁不会隐式授予较低级别的锁定权限，如果一个事务只有 SIX(database)， `tableContext.getEffectiveLockType(transaction)` 应该返回 S（而不是 SIX），因为该事务通过 SIX 锁隐式拥有表上的 S，但不是 SIX 锁的 IX 部分（该部分仅在数据库级别可用）。显式锁类型可以是其中一种类型，而有效锁类型可以是不同的锁类型，特别是如果祖先有一个 SIX 锁。
>
> 对于这项任务，以下辅助方法可能会有所帮助： `LockType` 和 `LockManager` 的方法， `ResourceName#parent` 和 `ResourceName#isDescendantOf` 的方法， `hasSIXAncestor` 和 `sisDescendants` 的方法（你将实现这些方法），以及 `fromResourceName` 。

我们来逐一实现这些关键方法。

首先，让我们了解 `LockContext` 的基本结构。它封装了一个资源在多粒度层次结构中的上下文信息，包括：

- `lockman`: 底层的 **LockManager** 实例，用于实际的锁操作。
- `parent`: 当前资源的父 `LockContext`，用于向上检查层次化约束。
- `name`: 当前资源的 `ResourceName`。
- `readonly`: 标记该上下文是否只读。
- `numChildLocks`: 一个映射表，记录每个事务在当前上下文的 **直接子资源** 上持有的锁数量。这是维护多粒度锁完整性的关键。
- `children`: 一个映射表，存储当前上下文的所有直接子 `LockContext`。

```java
    protected final LockContext parent;

    protected ResourceName name;

    protected boolean readonly;

    protected final Map<Long, Integer> numChildLocks;

    protected final Map<String, LockContext> children;
```

------



### 3.1 `acquire` 方法：获取锁（多粒度规则）

目标: 事务请求在当前资源上获取指定类型的锁。此方法必须严格遵循多粒度锁定的规则，尤其是在父子锁类型之间的兼容性上。

逻辑解析:
在调用底层 `LockManager` 的 `acquire` 方法之前，我们需要执行一系列前置检查，以确保事务能够在该资源上合法地获取锁，并维护 `numChildLocks` 计数。这些检查是多粒度锁体系中“**意图自上而下传递**”原则的体现：

* **只读检查**: 如果 `LockContext` 被标记为只读，表示这个资源是不可修改的，自然不允许任何锁获取操作（包括意向锁，因为它们最终可能导致修改），直接抛出 `UnsupportedOperationException`。
* **NL 锁请求检查**: `NL` 锁是“无锁”状态。请求 `NL` 锁没有任何意义，因为它不提供任何权限，并且通常通过 `release` 方法来达到无锁状态，因此若请求 `NL` 锁则抛出 `InvalidLockException`。
* **重复锁检查**: 获取当前事务在当前资源上已持有的锁类型。如果事务已经持有了非 `NL` 类型的锁，说明是**重复请求**，一个事务不能对同一个资源重复获取锁，应抛出 `DuplicateLockRequestException`。
* **父子锁兼容性检查 (核心)**: 这是多粒度锁定的**基石**。
    * **原理**: 父节点上的锁必须“授权”或“包含”子节点上锁的意图或权限。如果父节点没有表达出足够的“意图”（例如，没有 `IS` 或 `IX` 意向锁），那么子节点就不能直接获取可能需要这种意图的锁（如 `S` 或 `X`）。
    * **实现**: 如果当前资源有父节点 (`parent != null`)，我们需要检查父节点上事务持有的锁 (`parentLockType`) 是否允许子节点获取 `lockType`。这通过 `LockType.canBeParentLock(parentLockType, lockType)` 方法来判断。
    * **例子**: 假设数据库（父）上只有 `S` 锁（共享读），如果你试图在表（子）上获取 `IX` 锁（意向排他写），这将违反规则。因为数据库的 `S` 锁表明它只打算读取其所有子资源，而没有进行修改的意图。如果允许子表获取 `IX`，就会造成父子意图不一致。因此，这种情况下会抛出 `InvalidLockException`。这个检查确保了锁的**层次一致性**。
* **`SIX` 祖先检查**: 如果请求的锁类型是 `IS` 或 `S`，并且其任何祖先节点已经持有了 `SIX` 锁（共享加意向排他），则拒绝此请求。**为什么？** 因为 `SIX` 祖先已经隐式地获得了对当前资源及其所有后代的 `S` 锁权限。在这种情况下，再在当前资源上显式地获取 `IS` 或 `S` 锁是**冗余**的，并且可能导致逻辑上的混乱。为了简化锁管理，直接禁止这种冗余的获取操作，抛出 `InvalidLockException`。这通过辅助方法 `hasSIXAncestor(transaction)` 来判断。

**实际获取锁**: 如果所有前置检查都通过，则表示该锁请求在多粒度层次上是合法的。此时，我们通过 `lockman.acquire(transaction, name, lockType)` 调用底层的 `LockManager` 来实际获取锁。`LockManager` 会负责处理该资源自身的并发冲突和等待队列。

**更新子锁计数 (`numChildLocks`)**:
* **原理**: `numChildLocks` 是 `LockContext` 维护层次完整性的关键机制，它统计了**当前事务**在**当前 `LockContext` 所代表的资源的直接子资源上**持有的非 `NL` 锁的数量。
* **实现**: 如果当前 `LockContext` 有父节点，并且成功获取了锁（这意味着当前锁成为了父节点的“子锁”），我们就需要更新父节点的 `numChildLocks` 映射，将当前事务的子锁计数加 1。这对于后续父锁的释放检查（是否仍有子锁持有）至关重要。


**具体实现代码:**

```java
public void acquire(TransactionContext transaction, LockType lockType)
            throws InvalidLockException, DuplicateLockRequestException {
        // TODO(proj4_part2): implement

        if(this.readonly){
            throw new UnsupportedOperationException("Read only locks are not supported");
        }
        
        if (lockType == LockType.NL) {
            throw new InvalidLockException("Cannot acquire NL lock, use release instead");
        }
        
        long transNum = transaction.getTransNum();
        if(!lockman.getLockType(transaction,name).equals(LockType.NL)){
            throw new DuplicateLockRequestException("Transaction " + transNum + " already holds a lock on " + name);
        }

        if (parent != null) {
            LockType parentLockType = lockman.getLockType(transaction, parent.getResourceName());
            if (!LockType.canBeParentLock(parentLockType, lockType)) {
                throw new InvalidLockException("Parent lock " + parentLockType + 
                    " does not allow child lock " + lockType);
            }
        }

        lockman.acquire(transaction, name, lockType);

        if (parent != null) {
            parent.numChildLocks.put(transNum,
                    parent.numChildLocks.getOrDefault(transNum, 0) + 1);
        }
    }
```

------



### 3.2 `release` 方法：释放锁（多粒度规则）

目标: 事务请求释放当前资源上的锁。此操作同样需要遵循多粒度锁定规则，特别是在是否存在子锁时。

逻辑解析:
释放锁时，我们必须确保释放操作不会破坏多粒度锁定的层次完整性。这意味着如果当前资源有任何子资源被同一个事务持有锁，那么父资源上的锁就不能被轻易释放。这是多粒度锁体系中“**权限自下而上聚合**”原则的体现，也是防止“悬空意图”的关键。
* **只读检查**: 与 `acquire` 类似，只读上下文不允许锁释放操作，抛出 `UnsupportedOperationException`。
* **未持有锁检查**: 检查事务是否实际持有当前资源上的锁。如果事务在该资源上是 `NL` (无锁) 状态，则说明它没有持有锁，无法释放，应抛出 `NoLockHeldException`。
* **子锁存在性检查 (核心)**:
    * **原理**: 在多粒度锁体系中，如果一个事务在父节点上持有意向锁（例如 `IX`），其目的是为了在子节点上获取更细粒度的锁（例如 `X`）。如果父节点上的意向锁被释放了，但子节点上的实际锁仍然存在，这将导致子节点上的锁“失去父级意图的授权”，违反了层次约束（即你不能在没有父级意图锁的情况下直接在子级持有锁）。为了避免这种情况，我们必须确保在释放父锁之前，该事务**在任何直接子资源上都没有持有非 `NL` 类型的锁**。
    * **实现**: 这个信息由 `numChildLocks` 映射表提供。如果 `numChildLocks.getOrDefault(transNum, 0)` 大于 0，表示当前事务在当前资源下仍有直接子锁，此时不能释放当前锁，应抛出 `InvalidLockException`。
* **实际释放锁**: 如果所有检查都通过，表示当前锁可以安全释放。此时，调用 `lockman.release(transaction, name)` 将实际的锁释放。底层 `LockManager` 会负责从持有列表中移除锁并自动调用 `processQueue` 来唤醒等待的事务。
* **更新子锁计数 (`numChildLocks`)**:
    * **原理**: 当当前资源上的锁被成功释放后，它不再是其父节点的“子锁”。
    * **实现**: 如果当前 `LockContext` 有父节点，并且成功释放了锁，则意味着父节点在其子资源上持有的锁数量减少。我们应将父节点的 `numChildLocks` 中对应事务的计数减 1。注意，需要确保计数不会减到负数。

**具体实现代码:**

```java
public void release(TransactionContext transaction)
            throws NoLockHeldException, InvalidLockException {
        // TODO(proj4_part2): implement
        if(this.readonly){
            throw new UnsupportedOperationException("Read only locks are not supported");
        }
        long transNum = transaction.getTransNum();
        LockType lockType = lockman.getLockType(transaction, name);
        if(lockType.equals(LockType.NL)) {
            throw new NoLockHeldException("Transaction " + transNum + " does not hold a lock on " + name);
        }

        // 检查是否有子锁阻止释放
        int childLockCount = numChildLocks.getOrDefault(transNum, 0);
        if (childLockCount > 0) {
            throw new InvalidLockException("Cannot release lock when child locks are held");
        }

        lockman.release(transaction, name);
        if(parent != null){
            int currentCount = parent.numChildLocks.getOrDefault(transNum, 0);
            if (currentCount > 0) {
                parent.numChildLocks.put(transNum, currentCount - 1);
            }
        }

    }
```

------



### 3.3 `promote` 方法：锁升级（多粒度规则）


目标: 将事务在当前资源上持有的锁升级为更强的类型。此操作同样具有高优先级，并涉及对多粒度规则的特殊处理。

逻辑解析:
锁升级是数据库并发控制中常见的操作，它允许事务在不释放现有锁的情况下获取更高级别的权限（例如，从读锁升级到写锁）。在多粒度锁框架下，升级需要考虑以下几点，这些是确保层次约束和优化锁管理的体现：
* **只读检查**: 只读上下文不允许锁升级操作，因为升级通常意味着获取更高权限，可能用于修改数据。
* **未持有锁检查**: 如果事务未持有当前资源上的任何锁（即 `NL` 状态），则无法进行“升级”操作，因为没有“旧锁”可升，抛出 `NoLockHeldException`。
* **重复锁检查**: 如果请求升级的目标锁类型 (`newLockType`) 与当前已持有的锁类型 (`currentLockType`) 相同，则无需升级，这是冗余操作，抛出 `DuplicateLockRequestException`。
* **权限检查**: 确保 `newLockType` 确实比 `currentLockType` 更强，即 `newLockType` 能够**替代** `currentLockType`。这意味着，如果事务拥有 `newLockType`，它必须能够完成所有 `currentLockType` 允许的操作。这通过 `LockType.substitutable(newLockType, currentLockType)` 方法来判断。如果不能替代（例如，从 `X` 降级到 `S`），则抛出 `InvalidLockException`。
* **`SIX` 锁的特殊处理**: 这是 `promote` 方法中的一个复杂点，旨在优化和简化 `SIX` 锁的语义。
    * **祖先 `SIX` 锁禁止升级到 `SIX`**: 如果当前事务的任何祖先节点已经持有了 `SIX` 锁，则不允许将当前锁升级到 `SIX`。**为什么？** 因为 `SIX` 锁（共享加意向排他）意味着事务已经隐式地获得了对**整个子树的 `S` 权限**，并且在**当前节点及其后代可以向下加 `IX`/`X` 锁**。如果父节点已经有了 `SIX` 锁，其子节点再获取 `SIX` 锁就完全是**冗余**的，因为权限已经被祖先的 `SIX` 锁覆盖了。这种冗余不仅浪费资源，还可能引入不必要的复杂性或死锁风险。因此，我们选择禁止。为此，我们首先需要实现一个辅助方法 `hasSIXAncestor(transaction)`。
    * **升级到 `SIX` 时的子锁释放**: 如果事务尝试将 `IS` 或 `IX` 锁（或其他更弱的锁，如 `S`）升级到 `SIX` 锁，并且当前资源没有 `SIX` 祖先，则除了当前锁的升级外，还需要**原子性地释放**该事务在当前资源所有后代上持有的所有 `S` 锁和 `IS` 锁。**为什么？** 当一个资源获得了 `SIX` 锁后，它就**隐式地拥有了对其所有后代的 `S` 锁权限**。因此，这些后代资源再显式地持有 `S` 或 `IS` 锁就变得多余，它们已经被父节点的 `SIX` 锁所“覆盖”或“包含了”。释放这些冗余的子锁可以优化锁的内存使用，并简化后续的锁管理。为了实现这一机制，我们需要另一个辅助方法 `sisDescendants(transaction)`，它会返回所有需要被释放的 `S` 或 `IS` 后代锁的 `ResourceName` 列表。
    * **原子性操作**: 在这种升级到 `SIX` 的特殊情况下，我们不能简单地先释放再获取，因为这可能导致短暂的无保护状态。因此，我们必须使用 `lockman.acquireAndRelease` 方法来**原子性地**完成“释放所有指定后代锁 + 升级当前锁”的操作，确保在整个过程中，资源始终处于受保护的状态。
    * **更新 `numChildLocks`**: 在 `SIX` 升级并释放后代锁后，必须相应地更新当前 `LockContext` 的 `numChildLocks` 计数，减去被释放的子锁数量，以反映实际的锁持有情况。

* **普通升级**: 对于除了升级到 `SIX` 之外的其他情况（即非 `SIX` 锁的升级），直接调用 `lockman.promote(transaction, name, newLockType)` 即可，`LockManager` 会处理其原子性。

------



#### 3.3.1 `hasSIXAncestor` 方法：判断是否存在 SIX 祖先


目标: 检查当前事务是否在当前资源的任何祖先节点上持有 `SIX` 锁。

逻辑解析:
这个方法是辅助 `promote` 方法中的 `SIX` 锁特殊处理的。它的核心逻辑是沿着 `LockContext` 的父链**向上遍历**，查找事务是否在任何祖先节点上持有 `SIX` 锁。
* 从 `this.parent` （当前资源的直接父节点）开始，逐级向上访问父节点。
* 对于每个祖先节点，使用 `current.lockman.getLockType(transaction, current.getResourceName())` 获取事务在该祖先上持有的锁类型。
* 如果找到 `LockType.SIX`，则立即返回 `true`，表示存在 `SIX` 祖先。
* 如果遍历到根节点（`current` 为 `null`）仍未找到，则返回 `false`。

**具体实现代码:**

```java
private boolean hasSIXAncestor(TransactionContext transaction) {
        // TODO(proj4_part2): implement
        LockContext current = this.parent;
        while (current != null) {
            LockType lockType = current.lockman.getLockType(transaction, current.getResourceName());
            if (lockType == LockType.SIX) {
                return true;
            }
            current = current.parent;
        }
        return false;
    }
```

------



#### 3.3.2 `sisDescendants` 方法：获取所有 S/IS 后代锁


目标: 获取当前事务在当前资源所有后代上持有的所有 `S` 或 `IS` 类型的锁的 `ResourceName` 列表。

逻辑解析:
这个方法同样是辅助 `promote` 方法中 `SIX` 锁特殊处理的。当一个事务将当前资源上的锁升级到 `SIX` 时，它会隐式地获得对所有后代的 `S` 权限，这意味着后代显式持有的 `S` 或 `IS` 锁变得冗余。此方法旨在**识别这些需要被释放的冗余锁**。
这是一个**递归方法**，它会遍历当前 `LockContext` 的所有子节点，并递归调用自身来收集所有符合条件的后代锁。
* 初始化一个空的 `List<ResourceName>` 来存储结果。
* 遍历 `children` 映射表中的每一个**直接子 `LockContext`**。
* 对于每个子节点，获取当前事务在该子节点上持有的锁类型。
* 如果该锁类型是 `LockType.S` 或 `LockType.IS`，则将其 `ResourceName` 添加到结果列表中。
* **递归调用**: 无论子节点是否持有 `S` 或 `IS` 锁，都要递归调用 `child.sisDescendants(transaction)` 来获取该子树中所有 `S/IS` 类型的后代锁，并将它们添加到结果列表中。这是深度优先遍历的体现。

**具体实现代码:**

```java
private List<ResourceName> sisDescendants(TransactionContext transaction) {
        // TODO(proj4_part2): implement

        List<ResourceName> result = new ArrayList<>();
        for (Map.Entry<String, LockContext> entry : children.entrySet()) {
            LockContext child = entry.getValue();
            LockType lockType = child.lockman.getLockType(transaction, child.getResourceName());
            if (lockType == LockType.S || lockType == LockType.IS) {
                result.add(child.getResourceName());
            }
            result.addAll(child.sisDescendants(transaction));
        }
        return result;
    }
```

------



#### 3.3.3 `promote` 方法的完整实现



现在，有了 `hasSIXAncestor` 和 `sisDescendants` 的辅助，我们可以完整地实现 `promote` 方法。

```java
public void promote(TransactionContext transaction, LockType newLockType)
            throws DuplicateLockRequestException, NoLockHeldException, InvalidLockException {
        // TODO(proj4_part2): implement
        if(this.readonly){
            throw new UnsupportedOperationException("Read only locks are not supported");
        }
        long transNum = transaction.getTransNum();
        LockType currentLockType = lockman.getLockType(transaction, name);
        
        if(currentLockType.equals(LockType.NL)){
            throw new NoLockHeldException("Transaction " + transNum + " does not hold a lock on " + name);
        }

        if(currentLockType.equals(newLockType)){
            throw new DuplicateLockRequestException("Transaction " + transNum + " already holds " + newLockType + " lock");
        }

        if (!LockType.substitutable(newLockType, currentLockType)) {
            throw new InvalidLockException("Cannot promote " + currentLockType + " to " + newLockType);
        }

        if (newLockType == LockType.SIX && hasSIXAncestor(transaction)) {
            throw new InvalidLockException("Cannot promote to SIX with SIX ancestor");
        }
        
        // 如果升级到 SIX，需要释放所有 S/IS 后代锁
        if (newLockType == LockType.SIX && (currentLockType == LockType.IS || currentLockType == LockType.IX)) {
            List<ResourceName> descendants = sisDescendants(transaction);
            // 创建要释放的锁列表，包括当前锁和所有 S/IS 后代锁
            List<ResourceName> locksToRelease = new ArrayList<>(descendants);
            locksToRelease.add(name);
            
            lockman.acquireAndRelease(transaction, name, newLockType, locksToRelease);

            int releasedCount = descendants.size();
            int currentCount = numChildLocks.getOrDefault(transNum, 0);
            numChildLocks.put(transNum, Math.max(0, currentCount - releasedCount));
        } else {
            lockman.promote(transaction, name, newLockType);
        }
    }
```

------



### 3.4 `escalate` 方法：锁升级至当前级别



**目标:** 将当前资源及其所有后代上的锁进行“合并”或“提升”，使得当前事务只需要在该资源上持有更高级别的 S 或 X 锁，并释放所有被替代的后代锁。

**逻辑解析:**

这个方法是我在 Project 4 中认为最核心也最困难的部分。它的目的是通过将当前资源下的细粒度锁（如 `IS`, `IX`, `S` 在页级别）替换为当前资源上的粗粒度锁（如 `S`, `X` 在表级别），从而减少锁的数量，降低系统开销。

假设事务在一个数据库中持有以下锁：

```
IX(database)
├── IX(table1)
│   ├── S(table1_page3)
│   └── X(table1_page5)
└── S(table2)
```

如果我们在 `table1` 上执行 `escalate` 操作：

- 事务在 `table1` 上持有 `IX` 锁，且其子页面 `table1_page3` 和 `table1_page5` 上分别持有 `S` 和 `X` 锁。
- 由于 `table1_page5` 上有 `X` 锁，这意味着事务需要对 `table1` 进行写入操作。因此，`escalate` 操作会将 `table1` 上的锁升级为 **`X(table1)`**。
- 同时，`table1_page3` 和 `table1_page5` 上的所有后代锁（在这里就是 `S(table1_page3)` 和 `X(table1_page5)`）都将被释放。

升级后的锁状态会变为：

```
IX(database)
├── X(table1)
└── S(table2)
```

注意，如果事务持有的锁在 `escalate` 后没有实际改变（例如，对一个已经持有 `S` 锁且没有子锁的资源进行 `escalate`），则不应该做任何操作。

具体实现步骤如下：

1. **只读检查**: 只读上下文不允许锁升级操作。
2. **未持有锁检查**: 如果事务未持有当前资源上的任何锁，则无法升级，抛出 `NoLockHeldException`。
3. **获取所有后代锁**: 首先，我们需要一个辅助方法 `getAllDescendantLocks(transaction)` 来递归获取当前事务在当前资源所有后代上持有的所有非 `NL` 锁的 `ResourceName` 列表。
4. **确定新的锁类型**:
   - **没有后代锁**: 如果 `getAllDescendantLocks` 返回的列表为空，说明当前资源下没有更细粒度的锁。此时，新的锁类型取决于当前资源自身持有的锁：如果是 `IS` 升级为 `S`，如果是 `IX` 升级为 `X`。如果当前锁已经是 `S` 或 `X`，则无需 `escalate`。
   - **存在后代锁**: 如果存在后代锁，我们需要遍历这些后代锁，判断是否需要升级为 `X` 锁。只要有一个后代锁是 `X`、`IX` 或 `SIX`（这些都代表写入权限或意图），那么当前资源就需要升级到 **`X` 锁** 以覆盖所有潜在的写入操作。否则，如果所有后代锁都是 `S` 或 `IS`（只读权限或意图），则可以升级到 **`S` 锁**。
5. **重复升级检查**: 如果计算出的 `newLockType` 与 `currentLockType` 相同，说明没有实际的锁升级发生，此时直接返回，避免不必要的操作。
6. **准备释放列表**: 创建一个 `List<ResourceName>`，包含当前资源本身的 `ResourceName` 以及所有 `getAllDescendantLocks` 返回的后代锁 `ResourceName`。这些都将在原子操作中被释放。
7. **原子性获取并释放**: 调用 `lockman.acquireAndRelease(transaction, name, newLockType, locksToRelease)`。这个原子操作会先尝试获取 `newLockType` 到当前资源上，然后释放 `locksToRelease` 列表中的所有锁。
8. **清理子锁计数**: 这是 `escalate` 最复杂的部分之一。在 `acquireAndRelease` 成功执行后，所有被释放的后代锁实际上已经不再由当前事务持有。这意味着它们的父 `LockContext` 的 `numChildLocks` 计数需要被更新。
   - 遍历 `descendantLocks` 列表中的每一个 `ResourceName`。
   - 对于每个后代 `ResourceName`，获取其对应的 `LockContext`。
   - 从该后代的父 `LockContext` 开始，向上遍历其祖先链，直到达到当前被 `escalate` 的资源 (`this.name`)。
   - 在遍历过程中，将每个祖先 `LockContext` 的 `numChildLocks` 中对应事务的计数减 1。这个循环条件是 `while (descendantParent != null && !descendantParent.name.equals(name))`，确保我们只更新当前 `escalate` 节点以下的计数，而不是当前节点本身的计数。
   - 最后，将当前 `LockContext` 自身的 `numChildLocks` 中当前事务的计数重置为 0，因为其所有直接子锁（以及更深层次的后代锁）都已被释放。

------



#### 3.4.1 `getAllDescendantLocks` 方法：获取所有后代锁


目标: 获取当前事务在当前资源所有后代上持有的所有**非 `NL` 类型的锁**的 `ResourceName` 列表。

逻辑解析:
这个方法是 `escalate` 操作的另一个辅助函数，与 `sisDescendants` 类似，它也是一个**递归方法**，但它会收集所有非 `NL` 类型的后代锁（包括 `IS`、`IX`、`S`、`SIX`、`X`），而不仅仅是 `S/IS` 锁。
* 初始化一个空的 `List<ResourceName>`。
* 遍历 `children` 映射表中的每一个**直接子 `LockContext`**。
* 对于每个子节点，获取当前事务在该子节点上持有的锁类型。
* 如果该锁类型**不是 `LockType.NL`**，则将其 `ResourceName` 添加到结果列表中。
* **递归调用**: 递归调用 `child.getAllDescendantLocks(transaction)` 来获取该子树中所有非 `NL` 类型的后代锁，并将它们添加到结果列表中。

**具体实现代码:**

```java
private List<ResourceName> getAllDescendantLocks(TransactionContext transaction) {
        List<ResourceName> result = new ArrayList<>();
        for (Map.Entry<String, LockContext> entry : children.entrySet()) {
            LockContext child = entry.getValue();
            LockType lockType = child.lockman.getLockType(transaction, child.getResourceName());
            if (!lockType.equals(LockType.NL)) {
                result.add(child.getResourceName());
            }
            
            result.addAll(child.getAllDescendantLocks(transaction));
        }
        return result;
    }
```

------



#### 3.4.2 `escalate` 方法的完整实现



```java
public void escalate(TransactionContext transaction) throws NoLockHeldException {
        // TODO(proj4_part2): implement

        if (readonly) {
            throw new UnsupportedOperationException("Read only locks are not supported");
        }
        long transNum = transaction.getTransNum();
        LockType currentLockType = lockman.getLockType(transaction, name);
        if (currentLockType.equals(LockType.NL)) {
            throw new NoLockHeldException("Transaction " + transNum + " does not hold a lock on " + name);
        }

        List<ResourceName> descendantLocks = getAllDescendantLocks(transaction);

        LockType newLockType;
        
        if (descendantLocks.isEmpty()) {
            // 如果没有后代锁，根据当前锁类型决定升级
            if (currentLockType == LockType.IS) {
                newLockType = LockType.S;
            } else if (currentLockType == LockType.IX) {
                newLockType = LockType.X;
            } else {
                return; // 如果当前是 S/X/SIX 且没有后代锁，不需要升级
            }
        } else {
            // 如果有后代锁，检查是否需要 X 锁
            boolean needX = false;
            for(ResourceName childLock : descendantLocks){
                LockType childLockType = lockman.getLockType(transaction, childLock);
                // 只要有一个后代是 X, IX, SIX (意味着有写入意图或权限), 就需要升级到 X
                if(childLockType.equals(LockType.X) || childLockType.equals(LockType.IX) || childLockType.equals(LockType.SIX)) {
                    needX = true;
                    break;
                }
            }
            newLockType = needX ? LockType.X : LockType.S;
        }

        // 如果新旧锁类型相同，说明没有实际的升级，直接返回
        if (currentLockType.equals(newLockType)) {
            return;
        }

        // 准备要释放的锁列表：包括当前资源上的旧锁和所有后代锁
        List<ResourceName> locksToRelease = new ArrayList<>(descendantLocks);
        locksToRelease.add(name); // 将当前资源本身添加到释放列表

        // 原子性地获取新锁并释放所有指定锁
        lockman.acquireAndRelease(transaction, name, newLockType, locksToRelease);

        // 清理子锁计数：需要遍历所有被释放的后代锁，并更新它们的父上下文
        for (ResourceName descendantName : descendantLocks) {
            LockContext descendantContext = LockContext.fromResourceName(lockman, descendantName);
            LockContext descendantParent = descendantContext.parentContext();
            
            // 从父上下文中减去这个子锁，直到达到当前被 escalate 的节点 (即 this.name)
            // 这里的逻辑是确保只有在当前escalate的资源以下的层级才更新numChildLocks
            while (descendantParent != null && !descendantParent.name.equals(name)) {
                int currentCount = descendantParent.numChildLocks.getOrDefault(transNum, 0);
                if (currentCount > 0) {
                    descendantParent.numChildLocks.put(transNum, currentCount - 1);
                }
                descendantParent = descendantParent.parentContext();
            }
        }
        
        // 重置当前上下文的子锁计数（因为所有后代锁都被释放了）
        numChildLocks.put(transNum, 0);

    }
```

------



### 3.5 `getExplicitLockType` 方法：获取显式锁类型


目标: 返回事务在当前级别**显式**持有的锁类型。

逻辑解析:
这个方法相对简单，它只关注事务在当前 `ResourceName` 上**直接**持有的锁。它不会向上查找祖先锁，也不会向下查找子孙锁。
它体现的是“**事务直接在当前资源上请求并获得的锁**”这一概念。例如，如果事务在数据库上持有 `X` 锁，那么 `dbContext.getExplicitLockType(transaction)` 会返回 `X`。但是，如果 `tableContext.getExplicitLockType(transaction)` 被调用，即使这个表属于这个数据库，该方法也会返回 `NL`，因为事务没有在表上**显式**地请求任何锁。
直接调用底层 `lockman.getLockType(transaction, name)` 即可。如果事务在该资源上没有显式持有锁，`LockManager` 会返回 `NL`。

**具体实现代码:**

```java
public LockType getExplicitLockType(TransactionContext transaction) {
        // TODO(proj4_part2): implement
        return lockman.getLockType(transaction, name);
    }
```

------



### 3.6 `getEffectiveLockType` 方法：获取有效锁类型


目标: 返回事务在当前级别**隐式或显式**持有的“最强”有效锁类型。

逻辑解析:
这个方法是理解多粒度锁“**隐式授权**”概念的关键。事务可能在祖先节点上持有粗粒度锁，从而间接地获得了对当前节点的某些权限，即使当前节点没有显式锁。这个方法旨在揭示事务对当前资源实际拥有的所有权限。

这里需要考虑的逻辑优先级是：
* **显式锁优先级最高**:
    * 首先检查当前事务是否在当前资源上**显式**持有锁。
    * 如果通过 `lockman.getLockType(transaction, name)` 获取到的显式锁类型不是 `NL`，那么它就是最强的有效锁，直接返回该显式锁类型。

* **祖先锁的隐式权限**:
    * 如果当前资源没有显式锁（即 `getExplicitLockType` 返回 `NL`），我们就需要沿着父链向上查找祖先锁，看它们是否提供了隐式权限。
    * **向上遍历**: 从 `this.parent` 开始，向上迭代直到根节点。
    * **`S` 或 `X` 锁**: 如果任何祖先节点持有 `S` 锁（共享读）或 `X` 锁（独占），这意味着事务已经隐式地获得了对当前资源**至少 `S` 锁的权限**（因为 `X` 锁包含了 `S` 锁的所有权限）。一旦找到这样的祖先，就可以停止查找并返回 `LockType.S`。
    * **`SIX` 锁**: 如果祖先节点持有 `SIX` 锁（共享加意向排他），它会隐式授予其所有后代 `S` 锁权限。因此，如果找到 `SIX` 祖先，也返回 `LockType.S`。需要注意的是，`SIX` 锁的 `IX` 部分（意向排他）仅在持有 `SIX` 锁的那个资源层级有效，它**不会隐式地向下传递 `IX` 或 `X` 权限**给子孙节点。所以 `SIX` 祖先只能带来 `S` 的有效锁类型。
    * **`IS` 或 `IX` 锁**: 意向锁 (`IS`, `IX`) 本身**不授予任何实际的读写权限**，它们只表示事务**打算**在更细粒度上进行操作。因此，即使祖先持有 `IS` 或 `IX` 锁，它们也不会隐式地为当前资源提供 `S` 或 `X` 权限。
* **无有效锁**: 如果遍历完所有祖先都没有找到提供隐式权限的锁，则说明事务在该资源上没有有效锁（无论是显式还是隐式），返回 `LockType.NL`。

**具体实现代码:**

```java
public LockType getEffectiveLockType(TransactionContext transaction) {
        // TODO(proj4_part2): implement
        LockType explicitLock = lockman.getLockType(transaction, name);
        if (explicitLock != LockType.NL) {
            return explicitLock;
        }

        LockContext current = this.parent;
        while (current != null) {
            LockType parentLockType = current.lockman.getLockType(transaction, current.getResourceName());
            if (parentLockType == LockType.S || parentLockType == LockType.X || parentLockType == LockType.SIX) {
                return LockType.S; // S, X, SIX 都隐式授予了 S 权限
            }
            current = current.parent;
        }
        return LockType.NL;
    }
```

至此，`LockContext` 的所有核心功能都已完成。

------



# Task 4: LockUtil

这个任务的目标是创建一个高级 API `ensureSufficientLockHeld`，以简化在数据库代码库中应用多粒度锁的过程。`LockContext` 强制执行了多粒度约束，但直接使用它会很繁琐，因为我们总是需要手动处理意向锁。这个新方法旨在自动化这个过程，确保在请求特定锁（`S` 或 `X`）时，所有必要的祖先意向锁都已就位，同时遵循“最小权限”原则。

> **任务要求:**
> 我们定义了 `ensureSufficientLockHeld` 方法。此方法类似于一个声明性语句。请注意，调用者并不关心事务实际持有哪些锁：如果我们给事务在数据库上提供了 X 锁，事务确实有权读取整个表。但这并发性很低...因此我们额外规定 `ensureSufficientLockHeld` 应尽可能少地授予额外权限：如果 S 锁就足够，我们应该让事务获取 S 锁而不是 X 锁，但如果事务已经持有 X 锁，我们应该保持不变（`ensureSufficientLockHeld` 永远不会减少事务的权限...）。我们建议将这个方法的逻辑分为两个阶段：确保我们拥有祖先的正确锁，以及获取资源上的锁。在某些情况下，你需要提升（promote），在某些情况下，你需要升级（escalate）（这两种情况不是互相排斥的）。

---

### 4.1 `ensureSufficientLockHeld` 方法：确保持有足够权限的锁

**目标:** 自动为当前 `LockContext` 获取或调整锁，确保事务至少拥有 `requestType`（S、X 或 NL）所要求的权限，同时自动处理所有祖先意向锁，并尽可能保持高并发性。

**逻辑解析:**
`ensureSufficientLockHeld` 的核心思想是成为一个“智能”的锁请求接口。它会检查当前事务的锁状态，并决定是获取新锁、升级现有锁、提升锁级别，还是什么都不做。按照注释，整个过程可以分解为以下几种情况：

1.  **请求 NL 锁**: 如果请求的是 `NL` (无锁)，则直接调用 `release` 释放当前资源上的任何显式锁。
2.  **权限已足够**: 如果当前事务在资源上的**有效锁** (`effectiveLockType`) 已经能够替代 (`substitutable`) 请求的锁 (`requestType`)，说明权限已经足够，无需任何操作。例如，已经持有 `X` 锁时请求 `S` 锁。
3.  **特殊情况：IX + S → SIX**: 如果当前显式持有 `IX` 锁，现在请求 `S` 锁，最理想的操作是将锁 `promote` (提升) 为 `SIX`。这样事务既能读取当前资源（`S` 权限），又能继续在子节点上设置排他锁（`IX` 意图）。
4.  **从意向锁升级**: 如果当前显式持有的是意向锁 (`IS` 或 `IX`)，而请求的是实际的读/写锁 (`S` 或 `X`)，这通常意味着我们希望将当前资源的锁级别 `escalate` (升级)。例如，从 `IS` 升级到 `S`，或从 `IX` 升级到 `X`。`escalate` 会将当前锁替换为更强的锁，并释放所有后代锁。
5.  **从 S 锁升级到 X 锁**: 如果当前持有 `S` 锁，请求 `X` 锁，这是一个标准的 `promote` (提升) 操作。但在执行前，必须确保所有祖先节点都持有正确的意向锁（即 `IX`）。
6.  **从零开始获取锁**: 如果当前资源上没有显式锁 (`NL`)，我们需要先确保所有祖先节点都持有正确的意向锁，然后 `acquire` (获取) 请求的锁。

为了处理上述第 5 和第 6 种情况中对祖先锁的要求，我们需要一个辅助方法 `ensureAncestorIntentLocks`。

---

### 4.2 辅助方法：`ensureAncestorIntentLocks`

**目标:** 递归地检查并确保从当前节点的父节点到根节点的所有祖先都持有必要的意向锁。

**逻辑解析:**
这个递归方法是确保多粒度锁层次结构正确的关键。它的存在是为了防止并发问题。

> **我的理解:** 举个例子，假设现在我们要在一个表上获取 `S` 锁，但它的父节点（数据库）上没有任何意向锁。如果事务 T1 成功获取了 `S(table)`，此时另一个事务 T2 想要获取 `X(database)`。由于 `S(table)` 和 `X(database)` 之间没有直接的兼容性检查，T2 可能会成功，这就导致 T1 在读表，而 T2 在写整个数据库，造成严重的并发冲突。
>
> 意向锁就是为了解决这个问题。通过要求在获取 `S(table)` 之前必须先获取 `IS(database)`，T2 在请求 `X(database)` 时会因为与 `IS(database)` 不兼容而被阻塞。意向锁就像一个“预警”机制，通过在更高层级声明意图，严格维护了锁的层次结构。

该方法的实现逻辑如下：
1.  **确定所需意向锁**: 根据子节点请求的锁类型 (`requestType`)，确定父节点需要持有的意向锁。如果子节点请求 `S` 或 `IS`，父节点需要 `IS`；如果子节点请求 `X`、`IX` 或 `SIX`，父节点需要 `IX`。
2.  **递归上溯**: 递归调用自身，确保更上层的祖先也满足意向锁要求。
3.  **检查并操作**:
    *   如果父节点的**有效锁**已经足够强，可以替代所需的意向锁，则无需操作。
    *   如果父节点没有显式锁，则直接 `acquire` 所需的意向锁。
    *   如果父节点有显式锁但不够强，则 `promote` 它。例如，从 `IS` 升级到 `IX`，或者从 `S` 升级到 `SIX`（因为需要 `IX` 意图）。

**具体实现代码:**
```java
private static void ensureAncestorIntentLocks(LockContext lockContext, LockType requestType) {
        LockContext parentContext = lockContext.parentContext();
        if (parentContext == null) return;

        TransactionContext transaction = TransactionContext.getTransaction();
        
        // 确定父节点需要的意向锁类型
        LockType neededIntentLock;
        if (requestType == LockType.S || requestType == LockType.IS) {
            neededIntentLock = LockType.IS;
        } else {
            // requestType == LockType.X || requestType == LockType.IX
            neededIntentLock = LockType.IX;
        }
        
        // 确保祖先有合适的锁
        ensureAncestorIntentLocks(parentContext, neededIntentLock);
        
        LockType parentExplicitLock = parentContext.getExplicitLockType(transaction);
        LockType parentEffectiveLock = parentContext.getEffectiveLockType(transaction);
        
        // 如果父节点的有效锁已经能满足需求，不需要做任何事
        if (LockType.substitutable(parentEffectiveLock, neededIntentLock)) {
            return;
        }
        
        // 如果父节点没有显式锁，获取意向锁
        if (parentExplicitLock == LockType.NL) {
            parentContext.acquire(transaction, neededIntentLock);
        }
        // 如果父节点的显式锁不够强，需要升级
        else if (!LockType.substitutable(parentExplicitLock, neededIntentLock)) {

            if (parentExplicitLock == LockType.IS && neededIntentLock == LockType.IX) {
                parentContext.promote(transaction, LockType.IX);
            }

            else if (parentExplicitLock == LockType.S && neededIntentLock == LockType.IX) {
                parentContext.promote(transaction, LockType.SIX);
            }
        }
    }    // TODO(proj4_part2) add any helper methods you want
```

---

### 4.3 `ensureSufficientLockHeld` 的完整实现

有了辅助方法后，`ensureSufficientLockHeld` 的实现就是将前面分析的逻辑组合起来，形成一个完整的决策树。

> **总结:** `ensureSufficientLockHeld` 方法通过封装复杂的锁操作（`acquire`, `release`, `promote`, `escalate`）和层次约束检查，提供了一个简洁、安全的 API。它的核心作用就是“修复”整个数据库的锁结构，确保在任何节点上获取锁时，其所有祖先都已正确地持有意向锁，从而避免了类似“边读边写”的并发问题。

**具体实现代码:**
```java
public static void ensureSufficientLockHeld(LockContext lockContext, LockType requestType) {
        // requestType must be S, X, or NL
        assert (requestType == LockType.S || requestType == LockType.X || requestType == LockType.NL);

        // Do nothing if the transaction or lockContext is null
        TransactionContext transaction = TransactionContext.getTransaction();
        if (transaction == null || lockContext == null) return;

        // You may find these variables useful
        LockContext parentContext = lockContext.parentContext();
        LockType effectiveLockType = lockContext.getEffectiveLockType(transaction);
        LockType explicitLockType = lockContext.getExplicitLockType(transaction);

        if (requestType == LockType.NL) {
            if (!explicitLockType.equals(LockType.NL)) {
                lockContext.release(transaction);
            }
            return;
        }

        // 情况1：当前有效锁类型已经能替代请求的锁类型
        if (LockType.substitutable(effectiveLockType, requestType)) {
            return;
        }

        // 情况2：当前是 IX 锁，请求 S 锁 → 升级为 SIX
        if (explicitLockType == LockType.IX && requestType == LockType.S) {
            lockContext.promote(transaction, LockType.SIX);
            return;
        }

        // 情况3：当前是意向锁，需要升级
        if (explicitLockType == LockType.IS && requestType == LockType.S) {
            lockContext.escalate(transaction);
            return;
        }

        if (explicitLockType == LockType.IX && requestType == LockType.X) {
            lockContext.escalate(transaction);
            return;
        }

        // 从 S 升级到 X
        if (explicitLockType == LockType.S && requestType == LockType.X) {
            // 确保祖先有足够的意向锁
            ensureAncestorIntentLocks(lockContext, requestType);

            lockContext.promote(transaction, LockType.X);
            return;
        }

        // 情况4：当前没有锁，需要从头获取
        if (explicitLockType == LockType.NL) {
            ensureAncestorIntentLocks(lockContext, requestType);
            lockContext.acquire(transaction, requestType);
            return;
        }

        // TODO(proj4_part2): implement
        return;
    }
```

> **个人提醒:** 直接运行 `LockUtil` 的测试可能会失败，因为它的测试用例之间没有清理环境。每个测试都使用同一个事务，会导致状态被前一个测试污染。建议添加清理方法，或者一次只运行一个测试。

---




# Task 5: Two-Phase Locking

这最后一个任务，就是将我们前面实现的整个多粒度锁框架应用到数据库系统中，真正实现严格的**两阶段锁定 (Two-Phase Locking, 2PL)**。这个过程分为两个阶段：
1.  **增长阶段 (Growing Phase):** 在事务执行过程中，根据需要获取锁。
2.  **缩减阶段 (Shrinking Phase):** 在事务结束时，释放其持有的所有锁。

---

### 5.1 增长阶段：获取锁

**目标:** 在数据库执行读写操作之前，通过调用 `ensureSufficientLockHeld` 在适当的资源上获取正确的锁。

**逻辑解析:**
这是 2PL 的第一阶段。我们需要在访问或修改数据前加上适当的锁，以保证操作的隔离性。根据操作的性质（读或写），我们在不同的方法中添加锁请求。

> **我的想法:** 因为这些修改都只涉及一行代码，即调用 `ensureSufficientLockHeld`，所以这里只做口述。核心就是根据“读上S锁，写上X锁”的原则进行操作。

*   **读操作 (S Lock):** 对于只读取数据的操作，我们请求 `S` 锁。
    *   `Page.PageBuffer#get`: 读取页面数据，需要 `S` 锁。
    *   `RIDIterator`: 遍历记录ID，是读取操作，需要 `S` 锁。
    *   `RecordIterator`: 遍历记录内容，也是读取操作，需要 `S` 锁。

*   **写操作 (X Lock):** 对于会修改数据的操作，我们请求 `X` 锁。
    *   `Page.PageBuffer#put`: 修改页面数据，需要 `X` 锁。
    *   `PageDirectory#getPageWithSpace`: 获取有空间的页面，这通常是为了后续的写入，因此需要 `X` 锁来保证在查找和写入期间页面状态不被改变。
    *   `Table#updateRecord`: 更新记录，是写操作，需要 `X` 锁。
    *   `Table#deleteRecord`: 删除记录，也是写操作，需要 `X` 锁。

---

### 5.2 缩减阶段：释放锁

**目标:** 在事务结束时，修改 `Database.TransactionContextImpl` 的 `close` 方法，以释放该事务持有的所有锁。

**逻辑解析:**
这是 2PL 的第二阶段。当事务完成并提交或中止时，它必须释放所有持有的锁。然而，释放锁不能随意进行，必须遵循多粒度锁的层次约束。

> **任务要求:**
> 你应该只使用 `LockContext#release` 而不是 `LockManager#release` ... `LockManager` 不会验证多粒度约束...请注意，你不能随意释放锁！思考一下你被允许以什么顺序释放锁。

**核心思路：从子到父释放**
我们不能先释放父锁再释放子锁。例如，如果先释放了 `IX(table)`，而 `X(page)` 仍然被持有，这就违反了多粒度锁的规则（子锁失去了父级意图的授权）。因此，我们必须**从最细的粒度（子节点）开始，向上逐级释放到最粗的粒度（根节点）**。

**实现策略:**
1.  **获取所有锁**: 使用 `lockManager.getLocks(this)` 获取当前事务持有的所有锁。
2.  **排序**: 对获取到的锁列表进行排序。排序的依据是资源的层级深度。
    > **我的实现:** 我通过计算资源名字符串中分隔符 `/` 的数量来判断深度。分隔符越多，说明资源层级越深（即越是子节点）。我将列表按深度**降序**排列，这样最深的子节点就会排在最前面。
3.  **依次释放**: 遍历排序后的列表，使用 `LockContext.fromResourceName` 获取每个锁对应的 `LockContext`，然后调用 `context.release(this)` 来安全地释放锁。

**具体实现代码:**
```java
@Override
        public void close() {
            try {
                // TODO(proj4_part2)
                List<Lock> allLocks = Database.this.lockManager.getLocks(this);

                allLocks.sort((lock1, lock2) -> {
                    String name1 = lock1.name.toString();
                    String name2 = lock2.name.toString();
                    int depth1 = (int) name1.chars().filter(ch -> ch == '/').count();
                    int depth2 = (int) name2.chars().filter(ch -> ch == '/').count();
                    return Integer.compare(depth2, depth1);
                });

                for (Lock lock : allLocks) {
                    LockContext context = LockContext.fromResourceName(Database.this.lockManager, lock.name);
                    context.release(this);
                }
                
                return;
            } catch (Exception e) {
                e.printStackTrace();
                throw e;
            } finally {
                if (!this.recoveryTransaction) TransactionContext.unsetTransaction();
            }
        }
```
---

# 总结：


## 1. LockType (规则定义层)

**LockType** 位于整个锁系统的最底层。它不涉及任何状态管理或具体的锁实例，而是纯粹地定义了所有锁操作的**基础规则和语义**。你可以把它看作是锁世界的“宪法”或“字典”，规定了不同锁类型之间如何相互作用。

* **核心职责**: 定义锁的**兼容性**（哪些锁可以在同一资源上共存）、**父子锁关系**（父资源上的锁如何影响子资源上的锁），以及锁的**可替代性**（一种锁能否满足另一种锁的权限要求）。
* **架构角色**: 为上层的所有锁管理和决策提供**不可变的、原子性的判断依据**。它是其他所有锁组件进行逻辑判断的基石。

---

## 2. LockManager (资源级锁管理层)

**LockManager** 是实际执行锁操作的核心引擎，但它只关心**单个资源**的锁状态。它是一个高度并发且高效的组件，负责处理来自事务的原始锁请求（例如，在一个特定页面上获取 X 锁）。

* **核心职责**: 管理每个资源（如数据库、表、页）当前持有的锁实例，并维护一个**等待队列**来处理并发冲突。它确保了对单个资源的锁是**原子且公平**地授予和释放的。
* **架构角色**: 提供了**资源级别的并发控制**。它处理“谁现在能访问这个资源？”的问题，但不直接理解资源之间的层级关系或意图传递。它的内部通过 **ResourceEntry**（每个资源一个实例）来封装具体的锁列表和等待队列管理逻辑。

---

## 3. LockContext (多粒度层次约束层)

**LockContext** 是将底层资源级锁管理（`LockManager`）提升到**多粒度层次语义**的关键。它代表了资源层次结构中的一个节点（如数据库、表、页），并封装了在此节点上执行锁操作时，**必须遵循的所有复杂层次化约束**。

* **核心职责**: 确保锁的**意图自上而下地正确传递**（例如，在获取子资源上的 S 锁前，父资源必须有 IS 锁）；同时确保锁的**权限自下而上地正确聚合**（例如，在子资源仍持有锁时，父资源不能随意释放其意向锁）。它通过维护子锁计数（`numChildLocks`）和执行各种前置检查来实现这些复杂的 MGL 规则。它也处理锁的**升级（promote）和提升（escalate）**，这些操作本质上是在遵守 MGL 规则的前提下改变锁的强度或粒度。
* **架构角色**: 充当了应用程序与底层 `LockManager` 之间的**MGL 规则执行层**。它屏蔽了直接操作 `LockManager` 时的 MGL 复杂性，确保了整个锁层次结构的一致性。

---

## 4. LockUtil (高级 API / 自动化策略层)

**LockUtil** 位于整个锁系统的最顶层。它不是一个状态管理器，而是一个**智能的工具类**，旨在简化应用程序开发人员使用多粒度锁的复杂性。

* **核心职责**: 提供一个高阶的 **`ensureSufficientLockHeld`** 方法。这个方法就像一个“智能助理”，当应用程序需要对某个资源进行操作时，它会自动判断当前事务的锁状态，并根据“**最小权限原则**”和 MGL 规则，决定是获取新锁、升级现有锁、提升粒度，还是什么都不做。它尤其擅长**自动化意向锁的获取和维护**（通过递归调用 `ensureAncestorIntentLocks`），从而大大减少了开发人员手动管理意图锁链的负担。
* **架构角色**: 是**用户友好的门面**。它封装了 `LockContext` 的复杂调用逻辑，使得应用程序无需理解底层 MGL 细节，只需声明所需的操作权限，`LockUtil` 就会负责“修复”整个锁结构以满足要求，同时保持高并发性。

---

# 总结

这种分层架构提供了强大的模块化和清晰的职责分离：

* **LockType** 是基础，定义了 **“是什么”和“能做什么”** 的规则。
* **LockManager** 是执行者，管理**单个资源**上的“**谁拥有**”和“**谁在等**”的具体状态。
* **LockContext** 是规则执行者，它在 `LockManager` 的基础上，确保了**整个资源层级结构**中“**意图如何传递**”和“**权限如何聚合**”的复杂多粒度约束。
* **LockUtil** 是策略优化者，为开发者提供一个**简化的入口**，自动化了“**如何高效安全地获取所需权限**”的决策过程。


总而言之通过这个project4,我懂得了数据库是如何通过意向锁减少不必要的锁竞争，在尽可能保证并发安全性的同时，提高吞吐量。
整体来看project4是比较烧脑的，感觉比project3难度差不多，主要是LockContext比较容易出问题。

以上。


