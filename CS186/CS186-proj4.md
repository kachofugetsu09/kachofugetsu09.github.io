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