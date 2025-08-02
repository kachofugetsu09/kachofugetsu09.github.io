## 高容错特性

Kafka 提供高度的容错能力：在包含 n 个副本的集群中，可以容忍 n-1 个节点失败而保持系统可用。

## Consumer Group 机制

消费者可以组成 Consumer Group，每条消息只会被同一组内的一个消费者处理。这种设计完美匹配 Kafka 的分区特性：当一个主题有多个分区时，消息会动态分配给多个消费者，显著提高并发处理的吞吐量。


```java
public class KafkaConsumer<K, V> implements Consumer<K, V> {
    private final ConsumerCoordinator coordinator;

    public ConsumerRecords<K, V> poll(Duration timeout) {
        // 检查是否需要重新平衡
        coordinator.poll(time.timer(timeout));
        
        // 获取分配的分区
        final Map<TopicPartition, List<ConsumerRecord<K, V>>> records =
            fetcher.fetchedRecords();
            
        if (!records.isEmpty())
            return new ConsumerRecords<>(records);
            
        return ConsumerRecords.empty();
    }
}

```

## 高可用性与再平衡机制

如果某个消费者无法处理其分配的分区，其他消费者会接管这些分区，触发再平衡（rebalance）。这种机制确保即使部分消费者失效，整体系统仍能继续运行，同时提供负载均衡效果。
```java
public class ConsumerCoordinator extends AbstractCoordinator {
    public boolean needRejoin() {
        return subscriptions.partitionsAutoAssigned() &&
               (rejoinNeededOrPending() || assignmentExpired());
    }

    private void onJoinComplete(int generation,
                              String memberId,
                              String assignmentStrategy,
                              ByteBuffer assignmentBuffer) {
        // 处理分区分配结果
        PartitionAssignor.Assignment assignment = assignor.onAssignment(
            assignmentBuffer, partitionAssignor.name());
            
        // 更新分区分配
        subscriptions.assignFromSubscribed(assignment.partitions());
    }
}

```


## 批量处理机制

Kafka 使用批量发送机制，以消息集合为单位进行发送，大幅提高推送效率。整体架构遵循：

- Producer 负责向 Broker 推送消息
- Consumer 负责从 Broker 拉取消息

### 消息发送流程

1. **拦截器处理**：记录处理时间、消息数量、错误数量，可过滤不必要信息，执行数据清洗，处理敏感信息
2. **序列化**：对 key 和 value 进行序列化
3. **批量累积**：将消息累积成批次后发送
```java
public final class RecordAccumulator {
    private final int batchSize;
    private final ConcurrentMap<TopicPartition, Deque<ProducerBatch>> batches;

    public RecordAppendResult append(TopicPartition tp,
                                   long timestamp,
                                   byte[] key,
                                   byte[] value,
                                   Callback callback,
                                   long maxTimeToBlock) {
        // 尝试添加到现有批次
        Deque<ProducerBatch> dq = getOrCreateDeque(tp);
        synchronized (dq) {
            if (dq.isEmpty() || dq.getLast().tryAppend(timestamp, key, value, callback) == null) {
                // 创建新批次
                ProducerBatch batch = new ProducerBatch(tp, produceRequestBuilder,
                    timestamp, key, value, callback);
                dq.addLast(batch);
            }
        }
        // 返回结果
        return new RecordAppendResult(...);
    }
}

```



## Leader 和 Follower 机制

Kafka 集群中的 Broker 承担不同角色：

- 每个 Topic 分为多个分区（Partition）
- 每个分区的数据在多个 Broker 上存储形成副本
- 每个分区的副本中，选出一个 Leader 副本负责处理所有读写请求
- 其他副本作为 Follower，负责从 Leader 同步数据

### 副本失败处理机制

当 Producer 发送消息时，会指定 `acks` 参数，决定 Kafka 返回确认前需满足的条件。如果某个 Follower 副本同步失败：

1. Kafka 通过 ISR (In-Sync Replicas) 机制管理副本状态
2. 失败的 Follower 会从 ISR 集合中移除
3. Producer 会收到一个错误
4. 根据配置的 `retries` 参数进行重试
5. 由于问题 Follower 已被移出 ISR，即使设置了 `acks=all`，重试也可能成功
6. 如果重试达到最大次数仍失败，抛出异常，由应用程序决定如何处理

```java
public class KafkaProducer<K, V> implements Producer<K, V> {
    private Future<RecordMetadata> doSend(ProducerRecord<K, V> record, Callback callback) {
        // 获取分区的元数据
        Cluster cluster = metadata.fetch();
        
        // 计算目标分区
        int partition = partition(record, cluster);
        
        // 序列化记录
        byte[] serializedKey = keySerializer.serialize(record.topic(), record.headers(), record.key());
        byte[] serializedValue = valueSerializer.serialize(record.topic(), record.headers(), record.value());
        
        // 发送到累加器
        RecordAccumulator.RecordAppendResult result = accumulator.append(
            topicPartition,
            timestamp,
            serializedKey,
            serializedValue,
            headers,
            callback,
            maxBlockTimeMs);
            
        // 如果需要立即发送
        if (result.batchIsFull || result.newBatchCreated) {
            sender.wakeup();
        }
        
        return result.future;
    }
}

```
### 重试机制

```java
public class Sender implements Runnable {
    private void sendProducerData(long now) {
        // 获取准备发送的批次
        Map<Integer, List<ProducerBatch>> batches = accumulator.drain(
            cluster,
            maxSize,
            now);
            
        for (Map.Entry<Integer, List<ProducerBatch>> entry : batches.entrySet()) {
            NodeBatch batch = entry.getValue();
            // 发送批次
            sendProducerBatch(batch);
        }
    }
    
    private void handleProduceResponse(ProduceResponse.PartitionResponse response,
                                     ProducerBatch batch,
                                     long now) {
        if (response.error != Errors.NONE) {
            // 处理错误
            if (canRetry(batch, response.error)) {
                // 重试发送
                reenqueueBatch(batch, now);
            } else {
                // 完成发送，带有错误
                completeBatch(batch, response.error);
            }
        } else {
            // 成功完成发送
            completeBatch(batch, null);
        }
    }

    private boolean canRetry(ProducerBatch batch, Errors error) {
        return batch.attempts() < this.retries && error.exception().isRetriable();
    }
}

```
## 分区选择策略

消息写入分区遵循以下原则：

1. 如果指定了 Partition，则写入指定的 Partition
2. 如果设置了数据的 Key，则根据 Key 的哈希值选择 Partition
3. 如果既未指定 Partition 也未设置 Key，则使用轮询方式选择 Partition

## 存储结构

分区在服务器上表现为独立的文件夹，每个分区下包含多组 Segment 文件：

- 每组 Segment 文件包含 `.log`、`.index`、`.timeindex` 文件
- `.log` 文件实际存储消息数据
- `.index` 和 `.timeindex` 文件作为索引用于快速检索信息

```java
public class LogSegment {
    private final FileRecords log;  // 日志文件
    private final LazyIndex<OffsetIndex> lazyOffsetIndex;  // 偏移量索引
    private final LazyIndex<TimeIndex> lazyTimeIndex;  // 时间戳索引
    private final TransactionIndex txnIndex;  // 事务索引
    private final long baseOffset;  // 基础偏移量
}

```

### 消息结构

存储在 Log 中的消息包含：

- **Offset**：序列号，标识每条消息在分区内的位置
- **消息大小**：占用 4 字节，描述消息大小
- **消息体**：实际存储的消息数据（经过压缩）

### 存储策略

Kafka 存储策略基于时间和大小：

- 无论消息是否被消费，都会保存所有满足保留条件的消息
- 读取特定消息的复杂度为 O(1)
- 删除过期文件不会提高 Kafka 性能

## 消息查找机制

查找特定 Offset 的消息过程：

1. 定位消息所在的 Segment 文件（如查找 Offset 为 368801 的消息）
2. 打开该 Segment 的索引文件
3. 计算相对 Offset（相对于该 Segment 起始 Offset）
4. 使用二分查找定位小于等于目标相对 Offset 的索引项
5. 获取对应的物理偏移位置
6. 打开数据文件，从该物理位置开始顺序扫描直到找到目标消息

虽然过程看似复杂，但被认为是 O(1) 复杂度，原因是：

- 二分查找定位 Segment 的复杂度是 O(log(Segment 文件数))
- 但 Segment 数量有限，可视为常数操作
- 基于文件偏移量可以直接定位，不需要遍历整个日志

**注意**：在实际应用中，消费者数量应与分区数量匹配。如果消费者数量多于分区数量，多余的消费者会处于空闲状态。