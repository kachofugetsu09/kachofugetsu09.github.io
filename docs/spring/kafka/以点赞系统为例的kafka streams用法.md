# Kafka Streams 实现点赞系统

本文将探讨如何利用 **Kafka Streams** 框架，高效且实时地统计文章点赞数，并生成排行榜。我们将分析传统 Redis 方案在大数据量下的局限性，并详细阐述 Kafka Streams 如何解决这些挑战，同时提供一个简化版的 Demo 实现流程。

## 业务场景概述

我们的场景是一个**技术分享平台**，用户可以给文章点赞。核心目标是：

1.  **统计一定时间内的点赞数。**
2.  **展示某一时间段内的文章点赞排行榜。**

### 传统方案的挑战：Redis + Lua 滑动窗口的弊端

传统的解决方案可能会考虑使用 **Redis 配合 Lua 脚本实现滑动窗口**来统计点赞数。这种方案在**数据量不大**（例如每天几万、几十万点赞量）时，确实具有实现简单、直接、延迟低的优点。

然而，当平台规模持续增长，点赞量达到**每天数亿甚至每秒数十万的级别**时，Redis 方案将面临严峻的挑战，使其不再是最佳选择：

-----

### 大数据量下的“Why Not Redis？”深入思考

这里需要深入思考一个问题：**Redis 真的不能承担这种压力吗？** 对于点赞这种业务，如果平台规模不大，比如每天几万、几十万的点赞量，Redis 配合 Lua 脚本实现滑动窗口是完全可行的，甚至可能是最优解，因为它简单、直接、延迟极低。

但我们需要考虑更极端的情况：**如果我们的技术分享平台发展壮大，点赞量达到每天数亿甚至每秒数十万的级别呢？** 这时，传统的 Redis 方案就会面临严峻的挑战：

1.  **内存爆炸：** 为了维护“一定时间”内的点赞数，例如统计过去一小时甚至过去一天的点赞排行榜，Redis 需要在内存中存储**所有窗口内活跃的文章ID和对应的点赞事件数据**。这将导致 Redis 的内存占用呈线性甚至指数级增长。当数据量大到一定程度，Redis 的内存会迅速耗尽，或需要投入高昂的硬件成本。
2.  **频繁淘汰带来的计算瓶颈：** 无论是通过 ZSet 存储事件，还是周期性地清理旧数据，在海量数据和高并发写入下，Redis 的 **过期策略、Key 的删除、以及内部数据结构的调整** 都会带来巨大的 CPU 消耗和 IO 压力。Redis 虽然快，但它毕竟是单线程处理命令（部分功能如持久化可异步），大量的“清理旧数据”操作会阻塞主线程，严重影响其他业务读写性能，导致整体吞吐量下降和延迟急剧增加。
3.  **单点与扩展性挑战：** 即使使用 Redis 集群，对于需要聚合计算的场景，维护跨节点的数据一致性以及滑动窗口逻辑的复杂性也会大大增加。而扩展计算能力，往往需要与存储容量紧密耦合，不够灵活。

因此，在 **数据量巨大、时间窗口较长**（例如分钟级、小时级甚至天级）、**对内存占用和计算资源消耗有严格控制**的场景下，让 Redis 去承担这种持续、高频、大范围的聚合计算，**确实不是一个最佳的选择**。Redis 更适合作为高速缓存或存储最终聚合结果的介质。

-----

## Kafka Streams 解决方案

使用 **Kafka Streams** 可以完美解决上述问题。它是一个强大的流处理库，能够提供对数据处理的支持框架。大致的流程是：通过上游的 Kafka topic 接收数据，经过处理后输出到下游的 Kafka topic。它能够完美与 Kafka 进行集成，具备以下优势：

  * **实时流处理能力：** Kafka Streams 能够以流式方式处理点赞事件，在不增加 Redis 压力的前提下，实时计算点赞数并生成排行榜。
  * **容错性：** Kafka Streams 的状态存储是容错的。它底层使用 RocksDB 进行本地状态存储，RocksDB 的数据可以定期同步到 Kafka 的一个内部 Topic 中（Changelog Topic），确保即使应用实例崩溃，也能从 Kafka 恢复状态，保证计算的准确性，无需担心数据丢失。
  * **开发简便性：** 其操作逻辑远比编写 Lua 脚本方便，且代码可维护性更高。
  * **系统解耦：** 通过事件驱动的方式，将点赞统计逻辑与核心业务逻辑解耦，提高了系统的灵活性和可扩展性。
  * **数据利用：** 处理后的数据可以方便地输出到其他 Kafka Topic，为未来的数据分析和利用提供了可能。
  * **处理长时大流量场景：** 在处理长时间、大流量的场景上，Kafka Streams 提供了远比 Redis 更强的能力。

-----

## Demo 场景下的简化与生产环境的考量

在这里，我们需要明确一点：为了**专注于演示 Kafka Streams 的核心流处理逻辑**，我当前这个 Demo 对用户点赞的源头处理进行了简化。

在**实际生产环境**中，用户点赞通常是一个更复杂的业务流程：

1.  **用户发起点赞请求。**
2.  **业务服务层进行幂等性检查：** 在真正处理点赞之前，服务会查询数据库（或缓存），判断该用户是否已经对该文章点赞。如果已经点赞，可能返回“已点赞”的提示，或处理为取消点赞。这保证了**业务逻辑的正确性**。
3.  **点赞记录落库：** 如果是新的点赞，会将 `ArticleLike` 记录持久化到数据库，这是为了**数据的一致性**和支持用户后续的**取消点赞**等操作。
4.  **异步发送事件：** 数据库操作成功后，点赞事件会**异步地**发送到 Kafka。这种解耦方式可以避免发送 Kafka 的延迟影响用户响应时间，并提高系统吞吐量。

由于我们 Demo 的核心目标是展示 Kafka Streams 如何处理**流入的事件流**，为了快速模拟点赞事件的产生，我采取了以下测试策略来生成点赞数据，**而非严格模拟生产环境下的用户点赞业务逻辑**：

`ArticleLike` 实体类，这些数据是需要落库的：

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
@TableName("article_likes")
public class ArticleLike {
    @TableId(type = IdType.AUTO)
    private Long id;
    
    @TableField("article_id")
    private Long articleId;
    
    @TableField("user_id")
    private Long userId;
    
    @TableField("like_time")
    private Date likeTime;
}
```

按照 Redis + Lua 的设计，此时点赞数据应该被放入 ZSet 进行滑动窗口处理。现在，我们将其替换为 Kafka Streams。

### 1\. 生成点赞事件并落库

为了模拟点赞行为，我们首先生成一个随机用户 ID，并检查该用户是否已对文章点赞。这是为了模拟实际业务中的幂等性检查：

```java
 Long userId = (long) (random.nextInt(10000) + 1);
            
            // 检查是否已经点赞过
            QueryWrapper<ArticleLike> queryWrapper = new QueryWrapper<>();
            queryWrapper.eq("article_id", articleId)
                       .eq("user_id", userId);
            
            ArticleLike existingLike = articleLikeMapper.selectOne(queryWrapper);
            
            if (existingLike != null) {
                log.info("User {} already liked article {}, generating new userId", userId, articleId);
                // 如果已经点赞，重新生成用户ID
                userId = (long) (random.nextInt(10000) + 10001); // 使用更大的范围避免重复
            }
```

接着，将点赞记录持久化到数据库：

```java
ArticleLike articleLike = new ArticleLike();
            articleLike.setArticleId(articleId);
            articleLike.setUserId(userId);
            articleLike.setLikeTime(new Date());
            
            articleLikeMapper.insert(articleLike);
```

### 2\. 发送点赞事件到 Kafka

点赞记录落库成功后，我们将点赞事件异步发送到 Kafka。发送的事件是一个 `ArticleLikeEvent` 对象，包含文章 ID、用户 ID、操作类型（点赞/取消点赞）和时间戳。

```java
articleLikeProducerService.sendArticleLikeEvent(articleId, userId, "LIKE");
```

`sendArticleLikeEvent` 方法内部会构建 `ArticleLikeEvent` 对象，并将其序列化为 JSON 字符串发送到 Kafka：

`ArticleLikeEvent` 结构：

```java
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ArticleLikeEvent {
    private Long articleId;
    private Long userId;
    private String action; // LIKE, UNLIKE
    
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss", timezone = "Asia/Shanghai")
    private Date timestamp;
}
```

事件发送逻辑：

```java
 private static final String TOPIC = "article-likes-events"; // 定义 Kafka Topic 名称
```

```java

            ArticleLikeEvent event = new ArticleLikeEvent(
                    articleId,
                    userId,
                    action,
                    new Date());

            String eventJson = objectMapper.writeValueAsString(event); // 将事件对象序列化为 JSON 字符串
            String key = articleId.toString(); // 将文章 ID 作为 Kafka 消息的 Key，保证相同文章的点赞事件发送到同一个分区

            CompletableFuture<SendResult<String, String>> future = kafkaTemplate.send(TOPIC, key, eventJson);
```

**发送到 Kafka 的数据示例：**

  * **Key:** `"1001"` (文章ID)
  * **Value:** `{"articleId":1001,"userId":12345,"action":"LIKE","timestamp":"2025-08-01 13:00:00"}`

## Kafka Streams 处理流程

Kafka Streams 的核心处理逻辑定义在一个 `KStream` Bean 方法中。这里我们配置了 `article-like-events` 作为输入 Topic。

```java
@Configuration
@EnableKafkaStreams
@Slf4j
public class ArticleLikeStreamsConfig {

    private static final String INPUT_TOPIC = "article-like-events";
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private final ObjectMapper objectMapper;
    private final ArticleRankingService articleRankingService;
    ...
}
```

Kafka Streams 会使用一个传入 `StreamsBuilder` 并返回 `KStream` 的 Bean 方法来做处理。`JsonSerde` 是用于序列化和反序列化 JSON 数据的工具。

```java
@Bean
    public KStream<String, String> articleLikeStream(StreamsBuilder streamsBuilder) {
        log.info("Initializing Article Like Kafka Streams topology...");
        
        try {
            JsonSerde<ArticleLikeEvent> likeEventSerde = new JsonSerde<>(ArticleLikeEvent.class, objectMapper);

            // 1. 从输入Topic读取点赞事件
            KStream<String, String> sourceStream = streamsBuilder.stream(
                    INPUT_TOPIC,
                    Consumed.with(Serdes.String(), Serdes.String()));

            log.info("Created source stream for topic: {}", INPUT_TOPIC);

            // 2. 添加日志来监控消息接收
            sourceStream.foreach((key, value) -> {
                log.info("Received message from Kafka: key={}, value={}", key, value);
            });
            // ... 后续处理
        } catch (Exception e) {
            log.error("Error initializing Kafka Streams topology", e);
            throw new RuntimeException("Kafka Streams initialization failed", e);
        }
    }
```

#### 1\. 反序列化与初步过滤

首先，我们从 `streamsBuilder` 的输入 Topic (`article-like-events`) 中读取原始的 `String` 类型数据。通过 `mapValues` 操作将 JSON 字符串反序列化为 `ArticleLikeEvent` 对象，并对无效事件进行过滤。

```java
 KStream<String, ArticleLikeEvent> likeEventStream = sourceStream.mapValues((key, value) -> {
                try {
                    if (value == null || value.trim().isEmpty()) {
                        log.warn("Received null or empty value for key: {}", key);
                        return null;
                    }
                    ArticleLikeEvent event = objectMapper.readValue(value, ArticleLikeEvent.class);
                    log.info("Successfully deserialized ArticleLikeEvent: articleId={}, userId={}, action={}", 
                            event.getArticleId(), event.getUserId(), event.getAction());
                    return event;
                } catch (Exception e) {
                    log.error("Error deserializing ArticleLikeEvent for key: {}, value: {}", key, value, e);
                    return null;
                }
            }).filter((key, event) -> {
                boolean isValid = event != null && event.getArticleId() != null;
                if (!isValid) {
                    log.warn("Filtered out invalid event: key={}", key);
                }
                return isValid;
            });
            // ... 后续处理
```

  * **`mapValues` 输入/输出示例：**
      * **输入 (key, value):** `("1001", "{\"articleId\":1001,\"userId\":12345,\"action\":\"LIKE\",\"timestamp\":\"2025-08-01 13:00:00\"}")`
      * **输出 (key, value):** `("1001", ArticleLikeEvent{articleId=1001, userId=12345, action='LIKE', timestamp=Fri Aug 01 13:00:00 JST 2025})`
  * **`filter` 过滤逻辑：** 确保 `event` 非空且 `articleId` 存在。

#### 2\. 过滤“LIKE”事件

我们只关注点赞（"LIKE"）事件，因此需要再次进行过滤，忽略“UNLIKE”或其他类型的事件。

```java
 KStream<String, ArticleLikeEvent> likeStream = likeEventStream
                    .filter((key, event) -> {
                        boolean isLike = "LIKE".equals(event.getAction());
                        log.info("Filtering event: articleId={}, action={}, isLike={}", 
                                event.getArticleId(), event.getAction(), isLike);
                        return isLike;
                    });
```

  * **`filter` 过滤逻辑：** 仅保留 `action` 为 "LIKE" 的事件。

#### 3\. 分组、窗口聚合与计数

接下来是核心的统计逻辑。因为我们需要统计每个文章的点赞数并生成排行榜，所以步骤如下：

1.  **按照文章 ID 进行分组 (`map` + `groupByKey`)：** 将流中的事件按 `articleId` 重新设置 key。
2.  **定义时间窗口 (`windowedBy`)：** 设置一个时间窗口，例如 5 秒（为了便于测试，实际应用中会是更长的时间窗口，例如 5 分钟、1 小时等）。
3.  **统计点赞数 (`count`)：** 在每个时间窗口内，对每个文章 ID 的点赞事件进行计数。
4.  **指定状态存储 (`Materialized.as`)：** `count` 操作需要维护每个键的计数。Kafka Streams 会利用其底层的 **RocksDB 本地状态存储**来高效地管理和更新每个文章 ID 在当前时间窗口内的点赞数。RocksDB 是一种高性能的嵌入式键值存储，它能够将状态持久化到本地磁盘，并优化读写性能，尤其擅长处理大规模的增量更新和聚合计算。

<!-- end list -->

```java
 KStream<String, Long> articleLikeCounts = likeStream
                    .map((key, event) -> {
                        String newKey = event.getArticleId().toString();
                        log.info("Mapping event to new key: oldKey={}, newKey={}, articleId={}", 
                                key, newKey, event.getArticleId());
                        return new KeyValue<>(newKey, event);
                    })
                    .groupByKey(Grouped.with(Serdes.String(), likeEventSerde)) // 按照新的文章ID作为Key进行分组，值仍然是ArticleLikeEvent
                    .windowedBy(TimeWindows.ofSizeWithNoGrace(Duration.ofSeconds(5))) // 定义5秒的时间窗口
                    .count(Materialized.as("article-like-counts-store")) // 在窗口内进行计数，并将结果存储到名为 "article-like-counts-store" 的状态存储中
```

  * **`map` 输出示例：**
      * **输入 (key, value):** `("1001", ArticleLikeEvent{...})`
      * **输出 (key, value):** `("1001", ArticleLikeEvent{...})` (这里只是将 `articleId` 作为新的 Key，Value 保持不变，以便 `groupByKey` 使用)
  * **`groupByKey` 输出：** 形成 `KGroupedStream<String, ArticleLikeEvent>`，其中每个 Key 对应一个文章 ID，其 Value 是该文章 ID 下的所有 `ArticleLikeEvent`。
  * **`windowedBy`：** 在每个 Key Group 中，将数据按 5 秒的时间窗口进行切分。
  * **`count` 输出：** 得到一个 `KTable<Windowed<String>, Long>`，表示每个窗口内每个文章 ID 的点赞总数。

#### 4\. 转换回流并更新 Redis

最后，我们将 `KTable` 转换回 `KStream` (`toStream()`)，并对结果进行格式化，将时间窗口信息提取出来，然后将最终的点赞统计结果更新到 Redis 中。

```java
.toStream()
                    .map((windowedKey, count) -> {
                        String articleId = windowedKey.key();
                        long windowStart = windowedKey.window().start();
                        long windowEnd = windowedKey.window().end();
                        
                        // 格式化时间窗口
                        LocalDateTime startTime = LocalDateTime.ofInstant(Instant.ofEpochMilli(windowStart), ZoneId.systemDefault());
                        LocalDateTime endTime = LocalDateTime.ofInstant(Instant.ofEpochMilli(windowEnd), ZoneId.systemDefault());
                        String timeWindow = startTime.format(TIME_FORMATTER) + " - " + endTime.format(TIME_FORMATTER);
                        
                        log.info("Window aggregation result: Article {} like count: {} in window: {}", 
                                articleId, count, timeWindow);
                        
                        // 调用服务更新Redis排行榜
                        articleRankingService.updateArticleLikeCount(Long.parseLong(articleId), count, timeWindow);
                        
                        // 返回一个可以继续链式操作的值，例如将文章ID和点赞数作为新的KV对
                        return new KeyValue<>(articleId, count);
                    });
```

  * **`toStream()` 输出示例：**
      * **输入 (Windowed\<String\> key, Long value):** `("1001"@1678886400000/1678886405000, 50L)` (文章 ID 1001 在某个 5 秒窗口内有 50 个点赞)
      * **输出 (String key, Long value):** `("1001", 50L)` (经过 `map` 转换为普通 `KStream`，并触发 `updateArticleLikeCount` 方法)

#### 5\. 更新 Redis 排行榜

`articleRankingService.updateArticleLikeCount` 方法负责将计算出的点赞数存储到 Redis。我们使用 Redis 的 **Sorted Set (ZSet)** 来存储排行榜数据。

```java
 public void updateArticleLikeCount(Long articleId, Long likeCount, String timeWindow) {
        try {
            // 为每个时间窗口创建一个独立的排行榜 Key
            String rankingKey = RANKING_KEY_PREFIX + timeWindow.replace(" ", "_").replace(":", "-");
            
            log.info("Updating Redis ranking: articleId={}, likeCount={}, timeWindow={}, rankingKey={}", 
                    articleId, likeCount, timeWindow, rankingKey);
            
            // 将文章ID和点赞数存储到有序集合中（分数为点赞数），实现排行榜功能
            redisTemplate.opsForZSet().add(rankingKey, articleId.toString(), likeCount.doubleValue());
            
            // 同时更新一个"当前总排行榜" Key，方便前端直接查询最新总榜
            redisTemplate.opsForZSet().add(CURRENT_RANKING_KEY, articleId.toString(), likeCount.doubleValue());
            
            // 为每个时间窗口的排行榜 Key 设置过期时间，例如 24 小时，避免 Redis 内存无限增长
            redisTemplate.expire(rankingKey, Duration.ofHours(24));
            
            
        } catch (Exception e) {
            log.error("Error updating article ranking for article: {}", articleId, e);
        }
    }
```

**Redis 中存储的数据示例：**

假设 `RANKING_KEY_PREFIX` 为 `"article:likes:ranking:"`，`CURRENT_RANKING_KEY` 为 `"article:likes:current:ranking"`。

  * **针对特定时间窗口的排行榜 Key-Value 示例：**

      * **Key:** `"article:likes:ranking:2025-08-01_13-00-00_-_2025-08-01_13-00-05"` (该 Key 会在 24 小时后过期)
      * **Value (ZSet 成员):** `("1001", 50.0)`, `("1002", 35.0)`, `("1003", 20.0)`
          * `"1001"`: 文章 ID
          * `50.0`: 点赞数 (ZSet 的 Score)

  * **当前总排行榜 Key-Value 示例：**

      * **Key:** `"article:likes:current:ranking"` (该 Key 会持续更新，不设置独立过期时间，除非业务需要)
      * **Value (ZSet 成员):** `("1001", 150.0)`, `("1004", 120.0)`, `("1002", 100.0)` (这是累积的点赞数)

### 查询排行榜

要查询排行榜，可以直接从 `CURRENT_RANKING_KEY` 这个 Redis ZSet 中获取数据。例如，获取点赞数前 N 位的文章：

```java
// 获取当前总排行榜前10名的文章
Set<ZSetOperations.TypedTuple<String>> topArticles = redisTemplate.opsForZSet().reverseRangeWithScores(CURRENT_RANKING_KEY, 0, 9);
if (topArticles != null) {
    for (ZSetOperations.TypedTuple<String> tuple : topArticles) {
        System.out.println("Article ID: " + tuple.getValue() + ", Likes: " + tuple.getScore());
    }
}
```

通过以上步骤，我们成功地利用 Kafka Streams 实现了高吞吐、可扩展、容错的实时点赞统计和排行榜功能，同时避免了传统方案中 Redis 可能面临的压力问题。Kafka Streams 提供了一种优雅的方式来处理流式数据，为大数据量的实时计算场景提供了强大的支持。