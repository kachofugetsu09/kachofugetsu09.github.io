事务是有多种传播行为的。在 Spring 当中，事务的传播行为定义了一个事务在被调用时的行为。
在 Spring 当中的`TranscationDefinition`接口中定义了七种传播行为。每种传播行为在不同的事务状态下会有不同的执行方式。

为什么：
如果不定义传播级别，Spring 不知道如果一个事务 a 里又使用了一个事务 b 方法，到底是把事务 b 放到事务 a 中作为其中的一部分，还是新建一个事务 b 独立执行。

**更深层的原因：事务传播行为解决的核心问题**

事务传播行为的存在，本质上是为了解决**多层方法调用场景下的 ACID 特性保证问题**。在现代应用开发中，我们经常遇到这样的场景：

```java
@Service
public class OrderService {
    @Transactional
    public void createOrder(Order order) {
        // 1. 保存订单
        orderDao.save(order);

        // 2. 扣减库存 - 这也需要事务
        inventoryService.reduceStock(order.getItems());

        // 3. 记录日志 - 这也可能需要事务
        logService.recordOrder(order);
    }
}
```

在这个例子中，如果没有传播行为机制，我们将面临以下问题：

1. **原子性冲突**：`inventoryService.reduceStock()`内部有自己的事务，它与外层事务的原子性边界如何界定？
2. **一致性保证**：如果库存扣减失败，订单是否应该回滚？如果日志记录失败，前面的操作是否应该回滚？
3. **隔离性管理**：多个事务同时操作时，数据的可见性如何控制？
4. **持久性协调**：哪些操作需要立即持久化，哪些可以延迟到最外层事务提交时？

**并发控制的角度**：

- 在高并发场景下，事务边界的不明确会导致**死锁**、**脏读**、**幻读**等问题
- 传播行为提供了精确的并发控制策略，比如`REQUIRES_NEW`可以避免长事务导致的锁等待

**性能优化的角度**：

- 合理的传播行为可以减少事务的粒度，避免长事务占用数据库连接
- `NOT_SUPPORTED`传播行为可以让某些只读操作避免事务开销

## 提供了更定制化更精细的事务控制，增强了 java 程序与数据库的交互能力。

## Spring 事务传播行为详解

| 传播行为                      | 当前没有事务时                           | 当前存在事务时                                           |
| :---------------------------- | :--------------------------------------- | :------------------------------------------------------- |
| **PROPAGATION_REQUIRED**      | 新建一个事务                             | 加入到当前事务中                                         |
| **PROPAGATION_SUPPORTS**      | 以非事务方式执行                         | 加入到当前事务中                                         |
| **PROPAGATION_MANDATORY**     | 抛出 `TransactionRequiredException` 异常 | 加入到当前事务中                                         |
| **PROPAGATION_REQUIRES_NEW**  | 新建一个事务                             | 暂停当前事务，然后新建一个独立的事务                     |
| **PROPAGATION_NOT_SUPPORTED** | 以非事务方式执行                         | 挂起当前事务，然后以非事务方式执行                       |
| **PROPAGATION_NEVER**         | 以非事务方式执行                         | 抛出 `IllegalTransactionStateException` 异常             |
| **PROPAGATION_NESTED**        | 新建一个事务                             | 在当前事务的**嵌套事务**中执行（使用保存点 `Savepoint`） |

---

为了增强对于这几个传播行为是怎么工作的，我们举出以下的例子。
我们的场景是有两个方法 `methodA` 和 `methodB`，A 会调用 B。

## 事务传播行为详解

### REQUIRED

无论何时都会把自己放到事务中，如果已经有了那么把自己加入，没有就新建。

- **A 没有事务时**：B 会新建一个事务
- **A 有事务时**：B 会加入到 A 的事务中。如果 B 抛出异常，那么 A 会回滚。如果 B 内部回滚，整个 A 也回滚

### SUPPORTS

跟随调用者的事务状态。

- **A 没有事务时**：B 会因为 A 是无事务的所以以非事务方式执行
- **A 有事务时**：B 会加入到 A 的事务中

### MANDATORY

必须在事务中执行。

- **A 没有事务时**：B 会抛出 `TransactionRequiredException` 异常，因为他必须在事务中执行
- **A 有事务时**：B 会加入到 A 的事务中

### REQUIRES_NEW

无论如何都新建一个事务独立执行。

- **A 没有事务时**：B 会新建一个事务来执行
- **A 有事务时**：A 的事务会被挂起，B 按照事务的方式执行。B 执行完毕后，A 的事务会继续执行

### NOT_SUPPORTED

无论如何都不在事务中执行。

- **A 没有事务时**：B 会以非事务方式执行
- **A 有事务时**：B 会挂起 A 的事务，以非事务方式执行

### NEVER

永远不允许在事务中执行。

- **A 没有事务时**：B 会以非事务方式执行
- **A 有事务时**：调用了 NEVER 的 B 会抛出 `IllegalTransactionStateException` 异常，他不允许在事务中执行

### NESTED

在事务中执行，可以独立进行提交和回滚。外层影响内层，内层不影响外层。

- **A 没有事务时**：B 会新建一个事务来执行，行为类似于 REQUIRED
- **A 有事务时**：会在 A 当中生成一个嵌套事务，B 会在这个嵌套事务中执行
  - 如果 B 需要回滚，那么只会回滚 B 的嵌套事务，而不会影响 A 的事务
  - 如果 A 回滚，那么 B 的嵌套事务也会回滚

我们了解了 Spring 事务的传播行为，我们来看看在 Spring 源码当中，事务是如何运作的。

## Spring 事务源码解析

在深入源码之前，先理解 Spring 事务的完整生命周期：

**事务创建阶段** → **事务执行阶段** → **事务提交/回滚阶段** → **资源清理阶段**

### 第一步：事务启动 - getTransaction 方法

当我们使用`@Transactional`注解或手动开启事务时，Spring 会调用`AbstractPlatformTransactionManager.getTransaction()`方法。这是整个事务流程的入口：

```java
public final TransactionStatus getTransaction(@Nullable TransactionDefinition definition) {
    // 1. 获取当前事务对象
    Object transaction = doGetTransaction();

    // 2. 检查是否存在现有事务
    if (isExistingTransaction(transaction)) {
        return handleExistingTransaction(def, transaction, debugEnabled);
    }

    // 3. 根据传播行为创建新事务
    if (def.getPropagationBehavior() == PROPAGATION_REQUIRED ||
        def.getPropagationBehavior() == PROPAGATION_REQUIRES_NEW ||
        def.getPropagationBehavior() == PROPAGATION_NESTED) {
        return startTransaction(def, transaction, false, debugEnabled, null);
    }
}
```

这个方法做了三件关键的事：

1. **获取事务对象**：调用`doGetTransaction()`从当前线程获取或创建事务对象
2. **检查现有事务**：判断当前线程是否已经存在活跃事务
3. **处理传播行为**：根据事务的传播级别决定是加入现有事务、创建新事务还是挂起当前事务

**深入理解 doGetTransaction()方法：**

`doGetTransaction()`是整个事务机制的基础，它的实现涉及 Spring 的核心 ThreadLocal 机制：

```java
// DataSourceTransactionManager的实现
protected Object doGetTransaction() {
    DataSourceTransactionObject txObject = new DataSourceTransactionObject();

    // 从当前线程获取连接持有者
    ConnectionHolder conHolder = (ConnectionHolder)
        TransactionSynchronizationManager.getResource(this.dataSource);

    txObject.setConnectionHolder(conHolder, false);
    return txObject;
}
```

**TransactionSynchronizationManager 的 ThreadLocal 机制：**

Spring 事务的线程隔离是通过`TransactionSynchronizationManager`实现的，它内部使用了多个 ThreadLocal 变量：

```java
public abstract class TransactionSynchronizationManager {
    // 存储事务资源（如数据库连接）
    private static final ThreadLocal<Map<Object, Object>> resources =
        new NamedThreadLocal<>("Transactional resources");

    // 存储事务同步器
    private static final ThreadLocal<Set<TransactionSynchronization>> synchronizations =
        new NamedThreadLocal<>("Transaction synchronizations");

    // 存储事务名称
    private static final ThreadLocal<String> currentTransactionName =
        new NamedThreadLocal<>("Current transaction name");

    // 存储事务只读状态
    private static final ThreadLocal<Boolean> currentTransactionReadOnly =
        new NamedThreadLocal<>("Current transaction read-only status");

    // 存储事务隔离级别
    private static final ThreadLocal<Integer> currentTransactionIsolationLevel =
        new NamedThreadLocal<>("Current transaction isolation level");

    // 存储事务活跃状态
    private static final ThreadLocal<Boolean> actualTransactionActive =
        new NamedThreadLocal<>("Actual transaction active");
}
```

**为什么使用 ThreadLocal？**

1. **线程隔离**：确保每个线程的事务状态相互独立，避免并发问题
2. **无需显式传参**：任何方法都可以通过`TransactionSynchronizationManager`获取当前线程的事务状态
3. **生命周期管理**：事务开始时绑定，事务结束时清理，避免内存泄漏

**bindResource 和 unbindResource 的内部机制：**

```java
// 绑定资源到当前线程
public static void bindResource(Object key, Object value) {
    Map<Object, Object> map = resources.get();
    if (map == null) {
        map = new HashMap<>();
        resources.set(map);
    }
    map.put(key, value);
}

// 从当前线程解绑资源
public static Object unbindResource(Object key) {
    Map<Object, Object> map = resources.get();
    if (map == null) {
        return null;
    }
    Object value = map.remove(key);
    if (map.isEmpty()) {
        resources.remove(); // 防止内存泄漏
    }
    return value;
}
```

这种设计确保了：

- 同一线程内的所有数据库操作使用同一个连接
- 不同线程之间的事务状态完全隔离
- 事务结束时能够正确清理 ThreadLocal，避免内存泄漏

### 第二步：事务资源准备 - doBegin 方法

当确定需要开启新事务时，Spring 会调用具体实现类的`doBegin`方法。以`DataSourceTransactionManager`为例：

```java
protected void doBegin(Object transaction, TransactionDefinition definition) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;

    // 获取数据库连接
    Connection newCon = obtainDataSource().getConnection();
    txObject.setConnectionHolder(new ConnectionHolder(newCon), true);

    // 关闭自动提交
    con.setAutoCommit(false);

    // 将连接绑定到当前线程
    TransactionSynchronizationManager.bindResource(obtainDataSource(),
                                                 txObject.getConnectionHolder());
}
```

这一步完成了事务的基础设施准备：

- **获取数据库连接**：从连接池中获取一个数据库连接
- **关闭自动提交**：将连接的`autoCommit`设置为`false`，这样 SQL 操作不会立即提交
- **线程绑定**：将连接绑定到当前线程的`ThreadLocal`中，确保同一线程内的所有数据库操作使用同一个连接

### 第三步：传播行为处理 - handleExistingTransaction 方法

当检测到当前线程已经存在事务时，Spring 需要根据新事务的传播行为来决定如何处理：

```java
private TransactionStatus handleExistingTransaction(
        TransactionDefinition definition, Object transaction, boolean debugEnabled) {

    if (definition.getPropagationBehavior() == PROPAGATION_REQUIRES_NEW) {
        // 挂起当前事务，创建新的独立事务
        SuspendedResourcesHolder suspendedResources = suspend(transaction);
        return startTransaction(definition, transaction, debugEnabled, suspendedResources);
    }

    if (definition.getPropagationBehavior() == PROPAGATION_NESTED) {
        // 创建嵌套事务（保存点）
        return startTransaction(definition, transaction, true, debugEnabled, null);
    }

    // PROPAGATION_REQUIRED 等：加入现有事务
    return prepareTransactionStatus(definition, transaction, false,
                                  newSynchronization, debugEnabled, null);
}
```

这里展现了 Spring 事务传播行为的核心实现逻辑：

- **REQUIRES_NEW**：挂起当前事务，创建完全独立的新事务
- **NESTED**：在当前事务中创建嵌套事务（使用保存点机制）
- **REQUIRED**：直接加入到现有事务中

### 第四步：事务挂起与恢复机制

当遇到`REQUIRES_NEW`传播行为时，Spring 需要挂起当前事务。这是一个复杂但重要的过程：

```java
protected final SuspendedResourcesHolder suspend(Object transaction) {
    // 保存当前事务的状态信息
    String name = TransactionSynchronizationManager.getCurrentTransactionName();
    boolean readOnly = TransactionSynchronizationManager.isCurrentTransactionReadOnly();
    Integer isolationLevel = TransactionSynchronizationManager.getCurrentTransactionIsolationLevel();

    // 挂起具体的事务资源（如数据库连接）
    Object suspendedResources = doSuspend(transaction);

    // 清空当前线程的事务状态
    TransactionSynchronizationManager.clear();

    return new SuspendedResourcesHolder(suspendedResources, name, readOnly, isolationLevel);
}
```

**挂起过程的关键步骤：**

1. **保存事务状态**：将当前事务的所有状态信息（隔离级别、只读标记等）保存起来
2. **解绑资源**：将数据库连接等资源从当前线程解绑
3. **清空线程状态**：清除当前线程的事务状态，为新事务腾出空间

**恢复过程**则是挂起的逆操作：

```java
protected void doResume(Object transaction, Object suspendedResources) {
    // 重新绑定之前挂起的数据源连接到当前线程
    TransactionSynchronizationManager.bindResource(obtainDataSource(), suspendedResources);
}
```

### 第五步：嵌套事务的保存点机制

对于`NESTED`传播行为，Spring 使用 JDBC 的保存点（Savepoint）机制来实现嵌套事务：

```java
if (definition.getPropagationBehavior() == PROPAGATION_NESTED) {
    // 创建保存点
    DefaultTransactionStatus status = newTransactionStatus(definition, transaction);
    status.createAndHoldSavepoint();
    return status;
}
```

**什么是保存点（Savepoint）？**

保存点是 JDBC 提供的一种机制，它在事务中创建一个"检查点"。具体来说：

```java
// 在ConnectionHolder中创建保存点的实际操作
public Savepoint createSavepoint() throws SQLException {
    this.savepointCounter++;
    return getConnection().setSavepoint("SAVEPOINT_" + this.savepointCounter);
}

// 回滚到保存点
public void rollbackToSavepoint(Savepoint savepoint) throws SQLException {
    getConnection().rollback(savepoint);
}

// 释放保存点
public void releaseSavepoint(Savepoint savepoint) throws SQLException {
    getConnection().releaseSavepoint(savepoint);
}
```

**保存点的实际应用场景：**

假设我们有一个用户注册流程，包含创建用户和发送欢迎邮件两个步骤：

```java
@Service
public class UserService {

    @Transactional
    public void registerUser(User user) {
        // 外层事务开始
        userDao.createUser(user);

        // 调用嵌套事务方法
        sendWelcomeEmail(user);

        // 如果到这里，整个事务提交
    }

    @Transactional(propagation = Propagation.NESTED)
    public void sendWelcomeEmail(User user) {
        // 创建保存点 SAVEPOINT_1
        emailDao.logEmailAttempt(user.getId());

        if (emailService.sendEmail(user.getEmail()) == false) {
            // 邮件发送失败，只回滚到保存点
            // 用户创建仍然有效，只是邮件发送记录被回滚
            throw new EmailException("邮件发送失败");
        }

        emailDao.markEmailSent(user.getId());
        // 释放保存点，等待外层事务统一提交
    }
}
```

**保存点机制的三种情况：**

1. **嵌套事务成功**：释放保存点，等待外层事务提交
2. **嵌套事务失败**：回滚到保存点，外层事务可以继续执行
3. **外层事务失败**：整个事务回滚，包括所有保存点之后的操作

这样设计的好处是：即使邮件发送失败，用户依然能够成功注册，只是没有收到欢迎邮件。

### 第六步：事务提交流程

当业务逻辑执行完毕没有异常时，Spring 会调用`commit`方法来提交事务。提交过程分为几个阶段：

```java
public final void commit(TransactionStatus status) throws TransactionException {
    DefaultTransactionStatus defStatus = (DefaultTransactionStatus) status;

    // 检查回滚标记
    if (defStatus.isLocalRollbackOnly()) {
        processRollback(defStatus, false);
        return;
    }

    // 执行实际的提交
    processCommit(defStatus);
}
```

**commit 方法的核心逻辑：**

1. **检查回滚标记**：即使调用了 commit，如果事务被标记为只能回滚，仍然会执行回滚
2. **执行提交流程**：调用`processCommit`执行实际的提交操作

### 第七步：实际提交处理 - processCommit 方法

`processCommit`是提交流程的核心，它处理了不同类型事务的提交逻辑：

```java
private void processCommit(DefaultTransactionStatus status) throws TransactionException {
    try {
        // 触发提交前回调
        triggerBeforeCommit(status);
        triggerBeforeCompletion(status);

        if (status.hasSavepoint()) {
            // 嵌套事务：释放保存点
            status.releaseHeldSavepoint();
        } else if (status.isNewTransaction()) {
            // 新事务：执行底层提交
            doCommit(status);
        }
        // 其他情况：参与现有事务，不执行实际提交

        // 触发提交后回调
        triggerAfterCommit(status);
    } finally {
        // 清理资源，恢复挂起的事务
        cleanupAfterCompletion(status);
    }
}
```

**提交处理的三种情况：**

1. **嵌套事务**：只是释放保存点，不执行实际的数据库提交
2. **新事务**：调用`doCommit`执行真正的数据库提交操作
3. **参与现有事务**：什么都不做，等待外层事务统一提交

### 第八步：数据库层面的提交 - doCommit 方法

最终的数据库提交操作非常简单，就是调用 JDBC 连接的 commit 方法：

```java
protected void doCommit(DefaultTransactionStatus status) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();
    Connection con = txObject.getConnectionHolder().getConnection();

    con.commit();  // 实际的数据库提交
}
```

这一步将所有在事务中执行的 SQL 操作真正提交到数据库。在调用`commit()`之前，所有的 SQL 操作都只是暂存在事务中，数据库的其他会话是看不到这些变更的。

### 第九步：事务回滚流程

当业务逻辑抛出异常时，Spring 会执行回滚流程。回滚的处理逻辑和提交类似，但更复杂：

```java
private void processRollback(DefaultTransactionStatus status, boolean unexpected) {
    try {
        triggerBeforeCompletion(status);

        if (status.hasSavepoint()) {
            // 嵌套事务：回滚到保存点
            status.rollbackToHeldSavepoint();
        } else if (status.isNewTransaction()) {
            // 新事务：执行实际回滚
            doRollback(status);
        } else {
            // 参与现有事务：标记为回滚，由外层事务处理
            doSetRollbackOnly(status);
        }
    } finally {
        cleanupAfterCompletion(status);
    }
}
```

**Spring 事务回滚的重要机制：异常类型决定回滚策略**

这是一个极其重要但经常被忽视的细节：**Spring 事务默认只对运行时异常（RuntimeException）和 Error 进行回滚，对受检异常（Checked Exception）不回滚**。

```java
// Spring事务回滚规则的默认实现
public boolean rollbackOn(Throwable ex) {
    return (ex instanceof RuntimeException || ex instanceof Error);
}
```

**为什么有这样的设计？**

1. **设计哲学**：受检异常通常表示可预期的业务异常，应该由业务代码处理，不应导致事务回滚
2. **运行时异常**：通常表示程序错误或系统异常，数据可能已经处于不一致状态，需要回滚

**实际开发中的"坑"和解决方案：**

```java
@Service
public class PaymentService {

    // 错误示例：受检异常不会触发回滚
    @Transactional
    public void processPayment(Payment payment) throws PaymentException {
        paymentDao.save(payment);

        if (externalPaymentService.charge(payment) == false) {
            // PaymentException是受检异常，不会触发回滚！
            // 结果：支付失败但数据库中仍有支付记录
            throw new PaymentException("支付失败");
        }
    }

    // 正确示例1：指定rollbackFor
    @Transactional(rollbackFor = PaymentException.class)
    public void processPaymentCorrect1(Payment payment) throws PaymentException {
        paymentDao.save(payment);

        if (externalPaymentService.charge(payment) == false) {
            // 现在PaymentException也会触发回滚
            throw new PaymentException("支付失败");
        }
    }

    // 正确示例2：抛出运行时异常
    @Transactional
    public void processPaymentCorrect2(Payment payment) {
        paymentDao.save(payment);

        if (externalPaymentService.charge(payment) == false) {
            // RuntimeException会自动触发回滚
            throw new PaymentRuntimeException("支付失败");
        }
    }

    // 高级用法：细粒度控制回滚规则
    @Transactional(
        rollbackFor = {PaymentException.class, ValidationException.class},
        noRollbackFor = {MinorException.class}
    )
    public void advancedPayment(Payment payment) throws PaymentException {
        // PaymentException和ValidationException会回滚
        // MinorException不会回滚（即使它是RuntimeException）
        // 其他RuntimeException仍然会回滚
    }
}
```

**回滚规则的源码实现：**

```java
// 在TransactionAspectSupport中
protected void completeTransactionAfterThrowing(TransactionInfo txInfo, Throwable ex) {
    if (txInfo != null && txInfo.hasTransaction()) {
        if (txInfo.transactionAttribute != null &&
            txInfo.transactionAttribute.rollbackOn(ex)) {
            // 执行回滚
            txInfo.getTransactionManager().rollback(txInfo.getTransactionStatus());
        } else {
            // 不回滚，直接提交
            txInfo.getTransactionManager().commit(txInfo.getTransactionStatus());
        }
    }
}

// 自定义回滚规则的实现
public class CustomRollbackRule implements RollbackRuleAttribute {
    @Override
    public boolean rollbackOn(Throwable ex) {
        // 自定义回滚逻辑
        if (ex instanceof BusinessException) {
            BusinessException be = (BusinessException) ex;
            return be.isNeedRollback(); // 基于业务异常的属性决定是否回滚
        }
        return super.rollbackOn(ex);
    }
}
```

**回滚处理的三种情况：**

1. **嵌套事务回滚**：只回滚到保存点，外层事务可以继续
2. **新事务回滚**：执行完整的数据库回滚操作
3. **参与事务回滚**：标记外层事务为"仅回滚"状态

**实际场景中的回滚策略选择：**

````java
@Service
public class OrderService {

    @Transactional
    public void createOrder(Order order) {
        try {
            // 主要业务逻辑
            orderDao.save(order);
            inventoryService.reduceStock(order.getItems());

        } catch (StockInsufficientException e) {
            // 库存不足，整个订单创建应该回滚
            throw new RuntimeException("库存不足，订单创建失败", e);

        } catch (EmailSendException e) {
            // 邮件发送失败，但订单创建成功，不应该回滚
            log.warn("订单创建成功，但邮件发送失败: {}", e.getMessage());
            // 不抛出异常，事务正常提交
        }
    }
}

### 第十步：数据库层面的回滚

实际的数据库回滚操作：

```java
protected void doRollback(DefaultTransactionStatus status) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) status.getTransaction();
    Connection con = txObject.getConnectionHolder().getConnection();

    con.rollback();  // 实际的数据库回滚
}
````

回滚操作会撤销事务中所有的 SQL 操作，将数据库状态恢复到事务开始前的状态。

### 第十一步：事务同步回调机制

Spring 事务框架提供了一套完整的回调机制，允许在事务的不同阶段执行自定义逻辑：

```java
// 提交前回调
protected final void triggerBeforeCommit(DefaultTransactionStatus status) {
    TransactionSynchronizationUtils.triggerBeforeCommit(status.isReadOnly());
}

// 完成前回调（无论提交还是回滚都会调用）
protected final void triggerBeforeCompletion(DefaultTransactionStatus status) {
    TransactionSynchronizationUtils.triggerBeforeCompletion();
}

// 提交后回调
private void triggerAfterCommit(DefaultTransactionStatus status) {
    TransactionSynchronizationUtils.triggerAfterCommit();
}

// 完成后回调
private void triggerAfterCompletion(DefaultTransactionStatus status, int completionStatus) {
    TransactionSynchronizationUtils.triggerAfterCompletion(completionStatus);
}
```

**什么是事务同步回调？**

事务同步回调是 Spring 提供的一种机制，允许我们在事务的特定时刻执行自定义逻辑。这些回调通过`TransactionSynchronization`接口实现：

```java
public interface TransactionSynchronization {
    void beforeCommit(boolean readOnly);          // 提交前
    void beforeCompletion();                      // 完成前
    void afterCommit();                          // 提交后
    void afterCompletion(int status);            // 完成后
}
```

**实际应用场景举例：**

**1. 缓存失效场景**

```java
@Service
public class UserService {

    @Autowired
    private RedisTemplate redisTemplate;

    @Transactional
    public void updateUser(User user) {
        userDao.updateUser(user);

        // 注册事务同步回调，在事务提交后清理缓存
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    // 只有在事务成功提交后才清理缓存
                    redisTemplate.delete("user:" + user.getId());
                    System.out.println("用户缓存已清理");
                }

                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) {
                        System.out.println("事务回滚，缓存保持不变");
                    }
                }
            }
        );
    }
}
```

**2. 消息发送场景**

```java
@Service
public class OrderService {

    @Autowired
    private MessageQueue messageQueue;

    @Transactional
    public void createOrder(Order order) {
        orderDao.saveOrder(order);

        // 注册回调，确保只有订单成功保存后才发送消息
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    // 事务提交后发送订单创建消息
                    messageQueue.send(new OrderCreatedEvent(order));
                    System.out.println("订单创建消息已发送");
                }

                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) {
                        System.out.println("订单创建失败，未发送消息");
                    }
                }
            }
        );
    }
}
```

**3. 文件操作场景**

```java
@Service
public class DocumentService {

    @Transactional
    public void saveDocument(Document doc, MultipartFile file) {
        documentDao.saveDocument(doc);

        // 先暂存文件到临时目录
        String tempPath = saveTempFile(file);

        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    // 事务提交后，将文件从临时目录移动到正式目录
                    moveFileToFinalLocation(tempPath, doc.getFinalPath());
                    System.out.println("文件已保存到正式目录");
                }

                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) {
                        // 事务回滚，删除临时文件
                        deleteTempFile(tempPath);
                        System.out.println("事务回滚，临时文件已删除");
                    }
                }
            }
        );
    }
}
```

**回调执行时机详解：**

1. **beforeCommit**：在实际提交前执行，只有提交时才会调用
   - 用途：最后的数据验证、准备提交后的操作
2. **beforeCompletion**：在事务完成前执行，无论提交还是回滚
   - 用途：清理临时资源、记录日志
3. **afterCommit**：在成功提交后执行
   - 用途：缓存更新、消息发送、文件操作
4. **afterCompletion**：在事务完成后执行，无论成功还是失败
   - 用途：最终清理工作、统计信息记录

**为什么需要这些回调？**

- **数据一致性**：确保外部操作（如缓存、消息）与数据库状态保持一致
- **性能优化**：避免在事务中执行耗时的外部操作
- **错误处理**：根据事务最终状态执行不同的清理策略
- **解耦合**：将业务逻辑与基础设施操作分离

### 第十二步：资源清理与事务恢复

无论事务提交还是回滚，最后都要执行资源清理工作：

```java
private void cleanupAfterCompletion(DefaultTransactionStatus status) {
    // 标记事务完成
    status.setCompleted();

    // 清理同步状态
    if (status.isNewSynchronization()) {
        TransactionSynchronizationManager.clear();
    }

    // 清理事务资源
    if (status.isNewTransaction()) {
        doCleanupAfterCompletion(status.getTransaction());
    }

    // 恢复挂起的事务
    if (status.getSuspendedResources() != null) {
        resume(transaction, status.getSuspendedResources());
    }
}
```

**清理工作包括：**

1. **标记完成状态**：防止事务被重复操作
2. **清理线程状态**：清除`ThreadLocal`中的事务状态
3. **释放数据库资源**：恢复连接状态，归还连接池
4. **恢复挂起事务**：如果有挂起的外层事务，重新激活它

### 最终步：数据库连接的完整清理

```java
protected void doCleanupAfterCompletion(Object transaction) {
    DataSourceTransactionObject txObject = (DataSourceTransactionObject) transaction;

    // 从线程中移除连接持有者
    if (txObject.isNewConnectionHolder()) {
        TransactionSynchronizationManager.unbindResource(obtainDataSource());
    }

    // 重置连接状态
    Connection con = txObject.getConnectionHolder().getConnection();
    if (txObject.isMustRestoreAutoCommit()) {
        con.setAutoCommit(true);  // 恢复自动提交
    }

    // 归还连接到连接池
    if (txObject.isNewConnectionHolder()) {
        DataSourceUtils.releaseConnection(con, this.dataSource);
    }

    txObject.getConnectionHolder().clear();
}
```

**连接清理的关键步骤：**

1. **解除线程绑定**：从`ThreadLocal`中移除连接
2. **恢复连接状态**：将`autoCommit`重新设置为`true`
3. **归还连接池**：将连接返回给数据源的连接池
4. **清空持有者**：清理连接持有者的状态

## Spring 事务完整流程总结

通过以上源码分析，我们可以清晰地看到 Spring 事务从创建到终结的完整流程：

### 流程图

```
事务开始
    ↓
1. getTransaction() - 获取事务状态
    ↓
2. doGetTransaction() - 获取/创建事务对象
    ↓
3. isExistingTransaction() - 检查现有事务
    ↓
4. handleExistingTransaction() - 处理传播行为
    ↓
5. doBegin() - 开启新事务（获取连接，关闭自动提交）
    ↓
6. 业务逻辑执行
    ↓
7. commit()/rollback() - 提交或回滚
    ↓
8. processCommit()/processRollback() - 处理提交/回滚逻辑
    ↓
9. doCommit()/doRollback() - 实际的数据库操作
    ↓
10. triggerAfterCommit()/triggerAfterCompletion() - 执行回调
    ↓
11. cleanupAfterCompletion() - 资源清理
    ↓
12. doCleanupAfterCompletion() - 连接清理和恢复
    ↓
事务结束
```

### 核心设计思想

1. **模板方法模式**：`AbstractPlatformTransactionManager`定义了事务处理的标准流程，具体实现类只需要实现关键的抽象方法
2. **策略模式**：不同的传播行为采用不同的处理策略
3. **ThreadLocal 机制**：通过`TransactionSynchronizationManager`实现事务状态的线程隔离
4. **资源管理**：完善的资源获取、绑定、清理机制确保数据库连接的正确管理

## ThreadLocal 的优劣分析

### ThreadLocal 的优点

1. **线程隔离**：每个线程拥有独立的事务状态，避免并发问题
2. **简单易用**：无需在方法签名中传递连接参数，代码更简洁
3. **透明性**：业务代码无需关心事务管理细节

### ThreadLocal 的缺点与考虑

1. **内存泄漏风险**：如果不正确清理，可能导致内存泄漏
   - **Spring 的解决方案**：`TransactionSynchronizationManager` 在事务完成后自动调用 `clear()` 方法清理 ThreadLocal

```java
// Spring的内存泄漏防护机制
private void cleanupAfterCompletion(DefaultTransactionStatus status) {
    if (status.isNewSynchronization()) {
        TransactionSynchronizationManager.clear(); // 自动清理ThreadLocal
    }
}
```

2. **上下文传递的局限性**：跨线程无法直接传递事务上下文
   - **问题场景**：异步任务、线程池、消息队列处理
   - **解决方案**：需要手动传递事务状态或使用 `@Async` 的事务传播配置

```java
@Service
public class AsyncService {

    // 错误示例：异步方法中无法获取主线程的事务
    @Transactional
    public void processOrder(Order order) {
        orderDao.save(order);

        // 这里开启新线程，无法共享事务
        CompletableFuture.runAsync(() -> {
            // 这里的事务状态是空的！
            auditService.logOrder(order); // 可能在不同事务中执行
        });
    }

    // 正确示例：手动传递事务状态
    @Transactional
    public void processOrderCorrect(Order order) {
        orderDao.save(order);

        // 获取当前事务状态
        TransactionStatus currentTx = TransactionAspectSupport.currentTransactionStatus();

        CompletableFuture.runAsync(() -> {
            // 在新线程中创建新的事务
            transactionTemplate.execute(status -> {
                auditService.logOrder(order);
                return null;
            });
        });
    }
}
```

3. **无法跨进程**：微服务架构下，ThreadLocal 无法跨服务传递事务状态
4. **调试困难**：事务状态隐藏在 ThreadLocal 中，调试时不易观察

### Spring 的 TransactionSynchronizationManager 内存泄漏防护

```java
public abstract class TransactionSynchronizationManager {

    // 事务完成后的清理机制
    public static void clear() {
        synchronizations.remove();
        currentTransactionName.remove();
        currentTransactionReadOnly.remove();
        currentTransactionIsolationLevel.remove();
        actualTransactionActive.remove();

        // 关键：清理资源映射，防止内存泄漏
        Map<Object, Object> resourceMap = resources.get();
        if (resourceMap != null) {
            resourceMap.clear();
            resources.remove();
        }
    }
}
```

### 微服务环境下的局限性

在微服务架构中，ThreadLocal 的局部上下文特性成为限制：

```java
// 微服务A
@Service
public class OrderService {

    @Transactional
    public void createOrder(Order order) {
        orderDao.save(order);

        // 调用微服务B，ThreadLocal无法传递
        paymentService.processPayment(order.getPayment()); // HTTP调用

        // 如果支付失败，订单事务无法自动回滚
    }
}
```

**解决方案**：分布式事务（如 Seata、TCC 模式）或最终一致性模式。

## AOP 与动态代理：Spring 事务的实现基础

Spring 事务是基于 AOP（面向切面编程）实现的，这是事务能够透明生效的关键。

### 事务代理对象的创建

当 Spring 容器启动时，会为标注了 `@Transactional` 的类创建代理对象：

```java
// Spring AOP 创建事务代理的核心逻辑
@Component
public class TransactionProxyCreator implements BeanPostProcessor {

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        // 检查是否需要创建事务代理
        if (shouldCreateTransactionProxy(bean)) {
            return createTransactionProxy(bean);
        }
        return bean;
    }

    private Object createTransactionProxy(Object target) {
        ProxyFactory proxyFactory = new ProxyFactory(target);

        // 添加事务拦截器
        proxyFactory.addAdvice(new TransactionInterceptor());

        return proxyFactory.getProxy();
    }
}
```

### 动态代理的两种实现方式

Spring 根据目标类的特点选择代理方式：

1. **JDK 动态代理**：目标类实现了接口
2. **CGLIB 代理**：目标类没有实现接口

```java
// JDK动态代理示例
public interface UserService {
    void createUser(User user);
}

@Service
public class UserServiceImpl implements UserService {
    @Transactional
    public void createUser(User user) {
        userDao.save(user);
    }
}

// Spring会创建如下代理：
UserService proxy = (UserService) Proxy.newProxyInstance(
    classLoader,
    new Class[]{UserService.class},
    new TransactionInvocationHandler(userServiceImpl)
);
```

```java
// CGLIB代理示例
@Service
public class OrderService { // 没有实现接口
    @Transactional
    public void createOrder(Order order) {
        orderDao.save(order);
    }
}

// Spring会使用CGLIB创建子类代理：
public class OrderService$$EnhancerBySpringCGLIB extends OrderService {
    @Override
    public void createOrder(Order order) {
        // 事务拦截逻辑
        TransactionStatus status = transactionManager.getTransaction(definition);
        try {
            super.createOrder(order); // 调用原方法
            transactionManager.commit(status);
        } catch (Exception e) {
            transactionManager.rollback(status);
            throw e;
        }
    }
}
```

### 事务拦截器的工作原理

`TransactionInterceptor` 是事务 AOP 的核心组件：

```java
public class TransactionInterceptor implements MethodInterceptor {

    @Override
    public Object invoke(MethodInvocation invocation) throws Throwable {
        // 1. 获取事务属性
        TransactionAttribute txAttr = getTransactionAttribute(invocation.getMethod());

        if (txAttr == null) {
            // 没有事务注解，直接执行
            return invocation.proceed();
        }

        // 2. 开启事务
        TransactionStatus status = transactionManager.getTransaction(txAttr);

        try {
            // 3. 执行目标方法
            Object result = invocation.proceed();

            // 4. 提交事务
            transactionManager.commit(status);
            return result;

        } catch (Throwable ex) {
            // 5. 回滚事务
            if (txAttr.rollbackOn(ex)) {
                transactionManager.rollback(status);
            } else {
                transactionManager.commit(status);
            }
            throw ex;
        }
    }
}
```

### 何时拦截方法调用

事务拦截只在以下情况生效：

1. **外部调用**：通过 Spring 容器获取的代理对象调用方法
2. **跨类调用**：从一个 Spring Bean 调用另一个 Spring Bean 的方法

```java
@Service
public class UserService {

    @Autowired
    private OrderService orderService; // 注入的是代理对象

    public void businessMethod() {
        // 这里会触发事务拦截，因为调用的是代理对象
        orderService.createOrder(order);
    }
}
```

## 事务失效场景详解

### 1. 自调用问题：同类内部方法调用

这是 Spring 事务最常见的"坑"：

```java
@Service
public class UserService {

    @Autowired
    private UserDao userDao;

    // 错误示例：内部调用不会触发事务
    public void registerUser(User user) {
        validateUser(user);
        saveUser(user); // 这里调用的是this.saveUser()，不是代理对象！
    }

    @Transactional
    public void saveUser(User user) {
        userDao.save(user);

        // 模拟业务逻辑中的多个操作
        userProfileDao.createProfile(user.getId());

        // 如果这里抛异常，数据不会回滚！
        // 因为@Transactional注解没有生效，每个DAO操作都是独立的
        if (user.getAge() < 0) {
            throw new IllegalArgumentException("年龄不能为负数");
        }

        // 结果：user已保存，userProfile也已保存，但没有事务保护
    }
}
```

**为什么会失效？**

因为 `registerUser()` 中的 `saveUser()` 调用实际上是 `this.saveUser()`，调用的是原始对象而不是代理对象，所以事务拦截器不会生效。虽然 `userDao.save()` 等 DAO 操作会正常执行（因为 DAO 是注入的代理对象），但这些操作没有被包装在同一个事务中，每个操作都是独立提交的。

**问题演示：**

```java
// 测试自调用事务失效
@Service
public class UserService {
    @Autowired
    private UserDao userDao;
    @Autowired
    private UserProfileDao userProfileDao;

    public void registerUser(User user) {
        saveUser(user); // 自调用，事务不生效
    }

    @Transactional
    public void saveUser(User user) {
        userDao.save(user);           // 操作1：会立即提交
        userProfileDao.save(profile); // 操作2：会立即提交

        // 如果这里抛异常，前面的操作已经提交，无法回滚！
        throw new RuntimeException("模拟异常");
    }
}

// 结果：user和profile都已保存到数据库，无法回滚
```

**解决方案：**

```java
// 方案1：拆分到不同的Service
@Service
public class UserService {
    @Autowired
    private UserTransactionService userTransactionService;

    public void registerUser(User user) {
        validateUser(user);
        userTransactionService.saveUser(user); // 跨类调用，事务生效
    }
}

@Service
public class UserTransactionService {
    @Transactional
    public void saveUser(User user) {
        userDao.save(user);
    }
}

// 方案2：自注入（不推荐，但可行）
@Service
public class UserService {
    @Autowired
    private UserService self; // 注入自己的代理

    public void registerUser(User user) {
        validateUser(user);
        self.saveUser(user); // 通过代理调用
    }

    @Transactional
    public void saveUser(User user) {
        userDao.save(user);
    }
}

// 方案3：使用AopContext（需要开启expose-proxy）
@EnableAspectJAutoProxy(exposeProxy = true)
@Service
public class UserService {

    public void registerUser(User user) {
        validateUser(user);
        // 获取当前代理对象
        UserService proxy = (UserService) AopContext.currentProxy();
        proxy.saveUser(user);
    }

    @Transactional
    public void saveUser(User user) {
        userDao.save(user);
    }
}

// 方案4：使用编程式事务
@Service
public class UserService {
    @Autowired
    private TransactionTemplate transactionTemplate;

    public void registerUser(User user) {
        validateUser(user);

        transactionTemplate.execute(status -> {
            userDao.save(user);
            return null;
        });
    }
}
```

### 2. 异常捕获问题

内部方法捕获了异常但没有重新抛出 RuntimeException，导致事务不回滚：

```java
@Service
public class PaymentService {

    // 错误示例：异常被吞掉，事务不会回滚
    @Transactional
    public void processPayment(Payment payment) {
        try {
            paymentDao.save(payment);

            if (externalService.charge(payment) == false) {
                throw new PaymentException("支付失败");
            }

        } catch (PaymentException e) {
            // 异常被捕获但没有重新抛出，事务不会回滚！
            log.error("支付失败", e);
            // 数据库中仍然会保存支付记录
        }
    }

    // 正确示例1：重新抛出RuntimeException
    @Transactional
    public void processPaymentCorrect1(Payment payment) {
        try {
            paymentDao.save(payment);

            if (externalService.charge(payment) == false) {
                throw new PaymentException("支付失败");
            }

        } catch (PaymentException e) {
            log.error("支付失败", e);
            throw new RuntimeException("支付处理失败", e); // 重新抛出运行时异常
        }
    }

    // 正确示例2：手动标记回滚
    @Transactional
    public void processPaymentCorrect2(Payment payment) {
        try {
            paymentDao.save(payment);

            if (externalService.charge(payment) == false) {
                throw new PaymentException("支付失败");
            }

        } catch (PaymentException e) {
            log.error("支付失败", e);
            // 手动标记事务为回滚状态
            TransactionAspectSupport.currentTransactionStatus().setRollbackOnly();
        }
    }

    // 正确示例3：配置rollbackFor
    @Transactional(rollbackFor = PaymentException.class)
    public void processPaymentCorrect3(Payment payment) throws PaymentException {
        paymentDao.save(payment);

        if (externalService.charge(payment) == false) {
            throw new PaymentException("支付失败"); // 现在会触发回滚
        }
    }
}
```

### 3. 其他常见失效场景

```java
// 场景3：方法不是public
@Service
public class UserService {
    @Transactional
    private void saveUser(User user) { // private方法，事务不生效
        userDao.save(user);
    }
}

// 场景4：类没有被Spring管理
public class UserService { // 没有@Service注解
    @Transactional
    public void saveUser(User user) { // 事务不生效
        userDao.save(user);
    }
}

// 场景5：数据库引擎不支持事务
// 如果使用MyISAM引擎，事务注解无效，因为MyISAM不支持事务
```

## 事务传播行为的设计意图与应用场景

### REQUIRED - 最常用的传播行为

**设计意图**：确保方法在事务中执行，这是最符合直觉的事务行为。

**解决的问题**：

- 保证数据一致性
- 简化事务管理
- 提供默认的事务保障

**典型应用场景**：

```java
@Service
public class OrderService {

    // 订单创建：需要保证订单和订单项的一致性
    @Transactional // 默认REQUIRED
    public void createOrder(Order order) {
        orderDao.save(order);

        for (OrderItem item : order.getItems()) {
            orderItemDao.save(item); // 加入同一事务
        }

        // 如果任何一步失败，整个订单创建都会回滚
    }
}
```

### REQUIRES_NEW - 独立事务

**设计意图**：创建完全独立的事务，不受外层事务影响。

**解决的问题**：

- 避免长事务锁定资源
- 确保关键操作的独立性
- 实现事务隔离

**典型应用场景**：

```java
@Service
public class AuditService {

    // 审计日志必须独立保存，即使业务操作失败
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void logOperation(String operation, String details) {
        auditDao.save(new AuditLog(operation, details));
        // 即使外层事务回滚，审计日志也会保存
    }
}

@Service
public class UserService {
    @Autowired
    private AuditService auditService;

    @Transactional
    public void updateUser(User user) {
        // 记录操作日志（独立事务）
        auditService.logOperation("UPDATE_USER", user.toString());

        userDao.update(user);

        // 即使这里抛异常，审计日志已经提交，不会丢失
        if (user.getAge() < 0) {
            throw new IllegalArgumentException("年龄不能为负数");
        }
    }
}
```

### NESTED - 嵌套事务

**设计意图**：在当前事务中创建子事务，实现部分回滚能力。

**解决的问题**：

- 允许部分操作失败而不影响整体
- 提供更细粒度的事务控制
- 实现复杂的业务逻辑

**典型应用场景**：

```java
@Service
public class BatchProcessService {

    @Transactional
    public void processBatch(List<DataItem> items) {
        int successCount = 0;
        int failCount = 0;

        for (DataItem item : items) {
            try {
                processItem(item); // 嵌套事务
                successCount++;
            } catch (Exception e) {
                failCount++;
                log.warn("处理项目失败: {}", item.getId(), e);
                // 单个项目失败不影响其他项目
            }
        }

        // 保存批处理结果
        batchResultDao.save(new BatchResult(successCount, failCount));
    }

    @Transactional(propagation = Propagation.NESTED)
    public void processItem(DataItem item) {
        // 复杂的业务逻辑
        validateItem(item);
        transformItem(item);
        saveItem(item);

        // 如果这里失败，只回滚当前项目的处理
    }
}
```

### SUPPORTS - 跟随调用者

**设计意图**：灵活适应调用环境，既可以在事务中运行，也可以非事务运行。

**解决的问题**：

- 提供灵活的事务策略
- 避免不必要的事务开销
- 适应不同的调用场景

**典型应用场景**：

```java
@Service
public class CacheService {

    // 缓存操作：如果在事务中就参与事务，否则直接执行
    @Transactional(propagation = Propagation.SUPPORTS)
    public void updateCache(String key, Object value) {
        cacheDao.save(new CacheEntry(key, value));
        // 在事务中：等事务提交后生效
        // 非事务中：立即生效
    }
}
```

### MANDATORY - 强制事务

**设计意图**：确保方法必须在事务环境中执行，防止数据不一致。

**解决的问题**：

- 强制事务约束
- 防止误用
- 确保数据安全

**典型应用场景**：

```java
@Service
public class CriticalOperationService {

    // 关键操作必须在事务中执行
    @Transactional(propagation = Propagation.MANDATORY)
    public void transferMoney(Account from, Account to, BigDecimal amount) {
        // 这个方法涉及多个账户操作，必须在事务中执行
        accountDao.debit(from, amount);
        accountDao.credit(to, amount);

        // 如果没有在事务中调用，会抛出异常
    }
}
```

### NOT_SUPPORTED - 非事务执行

**设计意图**：确保方法在非事务环境中执行，避免事务开销。

**解决的问题**：

- 避免不必要的事务开销
- 防止长时间占用连接
- 适用于只读操作

**典型应用场景**：

```java
@Service
public class ReportService {

    // 报表查询：不需要事务，避免长时间占用连接
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public List<ReportData> generateReport(ReportQuery query) {
        // 复杂的只读查询，可能耗时很长
        return reportDao.complexQuery(query);
        // 即使外层有事务，这里也会挂起事务执行
    }
}
```

### NEVER - 禁止事务

**设计意图**：明确禁止在事务中执行，通常用于特殊的系统操作。

**解决的问题**：

- 防止误用
- 确保操作的即时性
- 避免事务冲突

**典型应用场景**：

```java
@Service
public class SystemService {

    // 系统监控：必须立即执行，不能等事务提交
    @Transactional(propagation = Propagation.NEVER)
    public void recordSystemMetrics() {
        systemMetricsDao.save(getCurrentMetrics());
        // 如果在事务中调用，会抛出异常
        // 确保监控数据的实时性
    }
}
```

## 事务同步器（TransactionSynchronization）的深入应用

### 最终一致性场景中的重要性

在微服务架构中，事务同步器是实现最终一致性的关键工具：

```java
@Service
public class OrderService {

    @Autowired
    private MessageProducer messageProducer;

    @Transactional
    public void createOrder(Order order) {
        // 1. 保存订单到数据库
        orderDao.save(order);

        // 2. 注册事务同步器，确保消息在事务提交后发送
        TransactionSynchronizationManager.registerSynchronization(
            new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    // 只有在数据库事务成功提交后才发送消息
                    messageProducer.sendOrderCreatedEvent(order);
                }

                @Override
                public void afterCompletion(int status) {
                    if (status == STATUS_ROLLED_BACK) {
                        log.info("订单创建失败，未发送消息");
                    }
                }
            }
        );
    }
}
```

### 避免数据不一致的典型场景

```java
@Service
public class PaymentService {

    @Transactional
    public void processPayment(Payment payment) {
        // 1. 更新支付状态
        paymentDao.updateStatus(payment.getId(), PaymentStatus.PROCESSING);

        // 2. 调用第三方支付
        PaymentResult result = thirdPartyPaymentService.charge(payment);

        if (result.isSuccess()) {
            // 3. 更新为成功状态
            paymentDao.updateStatus(payment.getId(), PaymentStatus.SUCCESS);

            // 4. 注册同步器，在事务提交后执行后续操作
            TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        // 发送支付成功通知
                        notificationService.sendPaymentSuccessNotification(payment);

                        // 更新用户积分（可能是另一个数据源）
                        pointsService.addPoints(payment.getUserId(), payment.getAmount());

                        // 发送MQ消息
                        messageProducer.sendPaymentCompletedEvent(payment);
                    }
                }
            );
        } else {
            paymentDao.updateStatus(payment.getId(), PaymentStatus.FAILED);
            throw new PaymentException("支付失败: " + result.getErrorMessage());
        }
    }
}
```
