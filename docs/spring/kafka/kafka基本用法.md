
---
lastUpdated: true
---

# Kafka 基本用法

在 Spring Boot 项目中，Kafka 的使用主要围绕**生产者 (Producer)** 和**消费者 (Consumer)** 两个核心角色展开。

## 生产者服务 (Producer Service)

**生产者服务**负责将消息发送到 Kafka 集群，为消费者提供数据。

### 核心组件：KafkaTemplate

`KafkaTemplate` 是 Spring Kafka 提供的一个核心组件，用于简化 Java 程序与 Kafka 集群的交互。

```java
private final KafkaTemplate<String, String> kafkaTemplate;
private final ObjectMapper objectMapper;
```

  * **泛型参数 `K` 和 `V`**: `KafkaTemplate<K, V>` 中的 `K` 和 `V` 分别代表消息的**键 (Key)** 和**值 (Value)** 的类型。
      * 通常，键用于消息路由（保证相同键的消息发送到同一个分区）和顺序性。
      * 值是消息的实际内容。
  * **序列化**: 在发送消息前，需要将 Java 对象序列化为字符串或字节数组。例如，这里使用 `ObjectMapper` 将 `UserBehavior` 对象序列化为 JSON 字符串。

### 消息发送方式：异步与同步

1.  **异步发送（推荐）**
    为了提高吞吐量和响应速度，通常采用异步发送消息。`KafkaTemplate.send()` 方法会立即返回一个 `CompletableFuture`。

    ```java
    CompletableFuture<SendResult<String, String>> future = kafkaTemplate.send(TOPIC, key, value);
    ```

    你可以利用 `CompletableFuture` 的 `whenComplete` 方法来非阻塞地处理消息发送的结果（成功或失败）：

    ```java
    public void sendSingleMessage(String acksConfig) {
        try {
            // 动态更新acks配置，用于演示不同ack模式
            kafkaTemplate.getProducerFactory().updateConfigs(Collections.singletonMap("acks", acksConfig));

            UserBehavior userBehavior = generateUserBehavior();
            String key = userBehavior.getUserId(); // 示例：使用用户ID作为消息的键
            String value = objectMapper.writeValueAsString(userBehavior); // 示例：消息内容序列化为JSON

            CompletableFuture<SendResult<String, String>> future = kafkaTemplate.send(TOPIC, key, value);

            future.whenComplete((result, ex) -> {
                if (ex == null) {
                    log.info("Single message sent: topic={}, partition={}, offset={}, key={}, messageId={}",
                            result.getRecordMetadata().topic(),
                            result.getRecordMetadata().partition(),
                            result.getRecordMetadata().offset(),
                            key, userBehavior.getMessageId());
                } else {
                    log.error("Error sending single message: {}", ex.getMessage(), ex);
                }
            });

            // 消息计数（仅用于示例）
            messageCount++;
        } catch (Exception e) {
            log.error("Error sending single message: {}", e.getMessage(), e);
        }
    }
    ```

    这种方式实现了简单的 Kafka 消息生产者服务，它异步发送消息到指定 Topic，并处理发送回调。

2.  **同步发送**
    你也可以通过在 `send` 方法后添加 `.get()` 来实现同步发送。这会阻塞当前线程直到消息被 Kafka Broker 确认接收。通常不推荐在高性能场景使用，因为它会降低生产者吞吐量。

    ```java
    // 同步发送示例
    // SendResult<String, String> result = kafkaTemplate.send(TOPIC, key, value).get();
    ```

## 消费者服务 (Consumer Service)

**消费者服务**负责从 Kafka 集群拉取消息并进行业务处理。

### 核心注解：@KafkaListener

在 Spring Boot 中，通过在方法上添加 `@KafkaListener` 注解来监听指定的 Kafka Topic。

```java
@KafkaListener(topics = "user_behavior_logs", groupId = "user_behavior_group_springboot_manual", containerFactory = "manualAckKafkaListenerContainerFactory")
```

`@KafkaListener` 的关键属性包括：

  * **`topics`**: 指定要监听的 Topic 名称。
  * **`groupId`**: 指定消费者所属的消费者组 ID。同一消费者组内的消费者会分摊 Topic 分区。
  * **`containerFactory`**: 指定用于创建和配置 Kafka 消息监听容器的工厂 Bean 名称。这是实现不同消费模式的关键。

### 消息监听容器工厂 (ContainerFactory)

为了定义不同的消费行为（如单条/批量处理、自动/手动确认），我们可以创建不同的 `ConcurrentKafkaListenerContainerFactory` Bean。

```java
@Bean
public ConcurrentKafkaListenerContainerFactory<String, String> manualAckKafkaListenerContainerFactory() {
    ConcurrentKafkaListenerContainerFactory<String, String> factory = new ConcurrentKafkaListenerContainerFactory<>();
    factory.setConsumerFactory(manualConsumerFactory()); // 设置消费者工厂
    factory.getContainerProperties().setAckMode(ContainerProperties.AckMode.MANUAL_IMMEDIATE); // 设置手动确认模式
    factory.setBatchListener(true); // 启用批量监听
    return factory;
}
```

通过配置 `containerFactory`，我们可以指定消费者按照特定的模式处理消息，例如：

  * **手动确认 (`AckMode.MANUAL_IMMEDIATE`)**: 消费者在处理完消息后，需要显式调用 `Acknowledgment.acknowledge()` 来提交偏移量。这提供了更强的可靠性，通常与幂等性结合使用。
  * **批量监听 (`setBatchListener(true)`)**: 消费者方法将接收一个 `List<ConsumerRecord>`，实现批量处理。
  * **自动确认**: 默认模式，Spring Kafka 会定期自动提交偏移量，无需手动干预。

### 消费者业务逻辑示例

当消息被消费时，通常需要进行反序列化，然后执行业务逻辑。在手动确认模式下，完成业务逻辑后必须手动确认。

```java
@KafkaListener(topics = "user_behavior_logs", groupId = "user_behavior_group_springboot_manual", containerFactory = "manualAckKafkaListenerContainerFactory")
public void listenManualCommit(List<ConsumerRecord<String, String>> records, Acknowledgment acknowledgment) {
    try {
        if (!records.isEmpty()) {
            log.info("Manual-commit Consumer received {} records. First offset: {}", records.size(), records.get(0).offset());

            for (ConsumerRecord<String, String> record : records) {
                // 消息计数（仅用于示例）
                manualCommitReceivedCount.incrementAndGet();
                // 反序列化消息
                UserBehavior userBehavior = objectMapper.readValue(record.value(), UserBehavior.class);

                // 核心业务逻辑：存储到Redis，并进行幂等性检查
                // redisStorageService.storeUserBehavior(userBehavior);
            }

            // 批量处理完所有消息后，手动提交偏移量
            acknowledgment.acknowledge();
            log.info("Manual-commit Consumer: Acknowledged {} records. Last offset: {}", records.size(), records.get(records.size() - 1).offset());
            // 模拟消息积压（仅用于演示）
            Thread.sleep(1000);
        }
    } catch (Exception e) {
        log.error("Error processing message in manual-commit consumer: {}", e.getMessage(), e);
        // 如果处理失败，不调用 acknowledgment.acknowledge()，消息会在下次 poll 时重新被拉取
    }
}
```

如果是**自动提交**的消费者，则方法签名不需要 `Acknowledgment` 参数，Spring Kafka 会自动管理偏移量提交。

## 自动提交模式下的异常处理与幂等性

在**自动提交**模式下，如果消费者在处理消息时发生异常，情况可能复杂：

  * **情况一：异常发生在消息处理早期，且在下次自动提交前。**

      * 如果消费者崩溃或触发再平衡，并且偏移量尚未提交，那么**该消息会再次被拉取并重复消费**。

  * **情况二：异常发生在消息处理早期，但该批次偏移量已被自动提交。**

      * 如果异常发生后，自动提交机制已将该批次（包括异常消息）的偏移量提交，那么即使消息处理失败，Kafka 也认为已处理，导致**消息丢失**。

  * **情况三：异常发生在批次后期，部分消息已处理，但整体偏移量未提交。**

      * 如果消费者崩溃，整个批次（包括已处理和未处理的）可能被重新拉取，导致**部分消息重复消费**。

**关键的解决方案是：**

  * **消息处理幂等性**：这是应对重复消费的“银弹”。你的业务逻辑必须设计为即使同一条消息被消费多次，最终结果也是一致的。
      * **实现方式**：可以利用 **Redis Set** (或更推荐的 **Redis String**，因为它更方便设置独立过期时间) 来存储消息的唯一 ID。在处理消息前，先检查该 ID 是否已存在于 Redis 中。如果存在，则跳过处理。
      * **过期策略**：合理设置 Redis 幂等键的过期时间，通常应大于 Kafka 消息的保留时间。同时，**业务层面的幂等性**（例如，数据库唯一约束、乐观锁、业务状态检查）是最终的可靠保障，即使 Redis 幂等键过期导致消息重复，也能确保业务数据的正确性。

## Kafka 的核心优势：异步解耦与高可用

与 Java 内部的异步操作（如 `CompletableFuture`）相比，Kafka 提供了更深层次的**系统级异步解耦**：

  * **服务解耦**：生产者和消费者完全独立，可以由不同的团队、不同的技术栈开发，部署在不同的机器上。它们之间只依赖 Kafka 集群，无需直接通信。
  * **消息持久化**：Kafka 将消息持久化到磁盘，即使生产者或消费者应用实例崩溃，消息也不会丢失。这是你提到“及时业务机器故障了也不会导致对应的消息也故障”的关键所在。
  * **高可用性与弹性伸缩**：Kafka 集群具有高可用性，消息会多副本存储。同时，通过消费者组机制，可以轻松增减消费者实例来应对流量变化，实现负载均衡。
  * **削峰填谷**：Kafka 作为缓冲区，可以平滑系统负载，防止后端服务被突发流量压垮。
  * **故障隔离**：单个服务或机器的故障不会影响整个消息流转和系统的可用性。

这就像我们使用 Redis 而不是 Java 应用程序自身的内存来做持久化存储一样，将存储职责外部化，提高了系统的健壮性和可扩展性。

