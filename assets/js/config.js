
// 自动生成的配置文件 - 请勿手动编辑
// 生成时间: 2025-07-19T00:53:47.979Z

window.SITE_DATA = {
    "categories": {
        "tech": {
            "name": "技术分享",
            "description": "技术学习笔记和经验分享",
            "icon": "fas fa-laptop-code",
            "color": "#667eea"
        },
        "redis-mini": {
            "name": "Redis实现",
            "description": "Redis源码分析与Java版本实现",
            "icon": "fas fa-database",
            "color": "#dc382d"
        },
        "CS-basics": {
            "name": "计算机基础",
            "description": "计算机网络、数据结构与算法、组成原理等基础课程笔记",
            "icon": "fas fa-graduation-cap",
            "color": "#38b2ac"
        },
        "MIT6.824": {
            "name": "MIT6.824笔记",
            "description": "MIT 6.824 分布式系统课程笔记",
            "icon": "fas fa-network-wired",
            "color": "#4299e1"
        },
        "interview": {
            "name": "面试笔记",
            "description": "面试准备和学习记录",
            "icon": "fas fa-briefcase",
            "color": "#764ba2"
        },
        "chatting": {
            "name": "心情随笔",
            "description": "生活感悟与内心独白",
            "icon": "fas fa-heart",
            "color": "#f093fb"
        },
        "jdk": {
            "name": "JDK源码解析",
            "description": "Java开发工具包源码深度剖析与学习笔记",
            "icon": "fab fa-java",
            "color": "#f89820"
        },
        "CS186": {
            "name": "CS186数据库系统",
            "description": "UC Berkeley CS186 数据库系统课程笔记",
            "icon": "fas fa-database",
            "color": "#805ad5"
        }
    },
    "articleLists": {
        "tech": [
            "Kafka和RocketMQ的背压机制解析.md",
            "零拷贝技术解析.md"
        ],
        "redis-mini": [
            "批处理AOF.md",
            "渐进式哈希实现思路.md"
        ],
        "CS-basics": [
            "IO多路复用.md",
            "Java虚拟机.md",
            "MYSQL笔记.md",
            "kafka笔记.md",
            "计算机网络.md"
        ],
        "MIT6.824": [
            "lab1.md",
            "lab2A.md",
            "lab2B.md",
            "raft论文研究.md"
        ],
        "interview": [
            "redis 2025.5.29.md",
            "牛客 2025.6.2.md",
            "牛客2025.5.30.md"
        ],
        "chatting": [
            "六月的蝉鸣.md"
        ],
        "jdk": [
            "AQS和可重入锁.md"
        ],
        "CS186": [
            "CS186笔记05.md",
            "CS186-proj2.md",
            "CS186-proj3.md",
            "CS186-proj4.md",
            "CS186笔记01.md",
            "CS186笔记02.md",
            "CS186笔记03.md",
            "CS186笔记04.md"
        ]
    },
    "articleDetails": {
        "tech/Kafka和RocketMQ的背压机制解析.md": {
            "title": "消息中间件背压机制深度解析",
            "preview": "背压是一种流量控制机制,用于处理系统中生产者和消费者处理能力不匹配的情况。简单来说,就是当下游系统(消费者)处理数据的速度跟不上上游系统(生产者)产生数据的速度时,需要一种机制来对上游进行限流,从而保护系统不会因为负载过高而崩溃。 系统稳定性保护 防止消费者被大量数据压垮 避免内存溢出(OOM)问题 保持系统的可用性和稳定性 资源合理利用 在系统负载高峰期合理分配资源 避免资源浪费和过度消耗 实现...",
            "updateTime": "2025-07-18",
            "wordCount": 3860,
            "readingTime": 26,
            "relativePath": "Kafka和RocketMQ的背压机制解析.md"
        },
        "tech/零拷贝技术解析.md": {
            "title": "零拷贝技术解析：从麦当劳点餐看I/O优化之道",
            "preview": "# 零拷贝技术解析：从麦当劳点餐看I/O优化之道 在深入理解零拷贝技术之前，我们需要先明确计算机系统中两个至关重要的概念：用户态和内核态。 内核态控制着计算机中最为宝贵的资源： CPU：处理器调度和时间片分配 磁盘：数据存储和读写操作 内存：物理内存的分配和管理 网卡：网络通信和数据传输 只有内核态才有权限直接调用这些核心资源。 用户态是应用程序的运行空间： 每个应用程序拥有独立的内存空间 为了系...",
            "updateTime": "2025-07-18",
            "wordCount": 3561,
            "readingTime": 24,
            "relativePath": "零拷贝技术解析.md"
        },
        "redis-mini/批处理AOF.md": {
            "title": "一个高性能的批处理AOF",
            "preview": "# 一个高性能的批处理AOF AOF（Append Only File）是Redis的持久化机制之一，它通过记录所有的写命令来保证数据的持久性。与RDB快照相比，AOF能提供更好的数据安全性，因为它几乎可以做到不丢失数据。 Redis作为一个内存数据库，所有数据都存在内存中。这带来了极致的性能，但同时也面临着数据易失性的问题： 服务器断电会导致数据丢失 程序崩溃会导致内存数据消失 系统重启需要重新...",
            "updateTime": "2025-07-18",
            "wordCount": 3511,
            "readingTime": 24,
            "relativePath": "批处理AOF.md"
        },
        "redis-mini/渐进式哈希实现思路.md": {
            "title": "渐进式哈希实现思路",
            "preview": "### 当传统哈希表无法满足我：深入剖析Dict如何用CoW和MVCC打造“强一致性快照”数据结构 > 核心问题：如何在Java环境下实现一个支持以下特性的哈希表？ > - 创建完全一致的数据快照（例如：RDB持久化、AOF重写） > - 支持渐进式扩容（类似Redis的渐进式哈希） > - 在快照创建期间保持高性能写入 > 解决方案： > - 采用MVCC（多版本并发控制）思想 > - 基于不可...",
            "updateTime": "2025-07-18",
            "wordCount": 4065,
            "readingTime": 28,
            "relativePath": "渐进式哈希实现思路.md"
        },
        "CS-basics/IO多路复用.md": {
            "title": "IO多路复用",
            "preview": "### 深入理解 I/O 多路复用：从传统阻塞到 epoll 高效事件驱动 在编写 Mini-Redis 时研究 I/O 多路复用是必然的，因为高性能的中间件，如 Redis，正是基于此。让我们用图书馆的比喻来深入理解这背后的技术。 想象一个传统图书馆，每来一位读者（客户端连接），你就专门派一位管理员（服务器线程）去全程服务他。这位管理员会一直陪着读者，直到他找到书或还完书。问题在于，如果读者数量...",
            "updateTime": "2025-07-18",
            "wordCount": 3700,
            "readingTime": 25,
            "relativePath": "IO多路复用.md"
        },
        "CS-basics/Java虚拟机.md": {
            "title": "Java虚拟机笔记",
            "preview": "<link rel=\"stylesheet\" href=\"../assets/css/details.css\"> 让我们通过一个贯穿全文的示例来理解JVM的内存模型： `java // 示例代码：一个简单的学生成绩管理系统 public class Student { // 静态字段：存储在元空间的类信息中 private static String schoolName = \"清华大学\"; pr...",
            "updateTime": "2025-07-18",
            "wordCount": 17416,
            "readingTime": 117,
            "relativePath": "Java虚拟机.md"
        },
        "CS-basics/MYSQL笔记.md": {
            "title": "MySQL 核心概念笔记",
            "preview": "> 🔑 核心要点：SQL语句在MySQL中的执行是一个多阶段协作的过程，涉及连接器、解析器、优化器等多个组件，旨在确保安全、高效、准确地处理数据。 SQL 语句在 MySQL 数据库中的执行流程可以概括为以下核心组件的协同工作： 连接器 (Connector)：负责客户端与数据库的连接建立、身份认证和会话管理，维护连接的权限及状态。 查询缓存 (Query Cache)：（MySQL 8.0 之...",
            "updateTime": "2025-07-18",
            "wordCount": 8803,
            "readingTime": 59,
            "relativePath": "MYSQL笔记.md"
        },
        "CS-basics/kafka笔记.md": {
            "title": "kafka笔记",
            "preview": "Kafka 提供高度的容错能力：在包含 n 个副本的集群中，可以容忍 n-1 个节点失败而保持系统可用。 消费者可以组成 Consumer Group，每条消息只会被同一组内的一个消费者处理。这种设计完美匹配 Kafka 的分区特性：当一个主题有多个分区时，消息会动态分配给多个消费者，显著提高并发处理的吞吐量。 `java public class KafkaConsumer<K, V> impl...",
            "updateTime": "2025-07-18",
            "wordCount": 1062,
            "readingTime": 8,
            "relativePath": "kafka笔记.md"
        },
        "CS-basics/计算机网络.md": {
            "title": "**Network Edge 网络边缘**",
            "preview": "Servers are often located in data centers. 服务器 通常位于数据中心。 Clients are end-user devices such as PCs, smartphones, etc. 客户端 是终端用户设备，如PC、智能手机等。 Residential Access Network (居民接入网络) Provides internet access...",
            "updateTime": "2025-07-18",
            "wordCount": 12306,
            "readingTime": 83,
            "relativePath": "计算机网络.md"
        },
        "MIT6.824/lab1.md": {
            "title": "lab1",
            "preview": "MapReduce 是一种编程模型和相关的实现，用于处理和生成大数据集。它通过将数据分割并在多台机器上并行处理，大大提高了数据处理的效率。 MapReduce 过程主要由两个阶段组成：Map 和 Reduce。 Map 阶段: 输入数据被自动划分为 M 个输入片段 (Input Splits)，每个片段通常大小为 16-64MB。 这些输入片段可以由不同的机器并行处理。 Map 函数接收一个 (k...",
            "updateTime": "2025-07-18",
            "wordCount": 4270,
            "readingTime": 29,
            "relativePath": "lab1.md"
        },
        "MIT6.824/lab2A.md": {
            "title": "lab2A",
            "preview": "## Lab 2A: Raft 领导人选举与心跳 > 本实验要求您在 raft/raft.go 文件中实现 Raft 共识算法。该文件已提供骨架代码，并包含如何发送和接收 RPC 的示例。您的实现必须支持以下接口，测试器和（最终）您的键/值服务器将使用这些接口。raft.go 中的注释提供了更多详细信息。 一个服务通过调用 Make(peers, me, ...) 来创建一个 Raft 节点。pe...",
            "updateTime": "2025-07-18",
            "wordCount": 4352,
            "readingTime": 30,
            "relativePath": "lab2A.md"
        },
        "MIT6.824/lab2B.md": {
            "title": "Lab 2B: 日志复制 (Log Replication)",
            "preview": "我们先来看一遍需求： > 请实现领导者和跟随者代码，以追加新的日志条目，从而通过 go test -run 2B 测试。运行 git pull 以获取最新的实验软件。 > > 您的第一个目标应该是通过 TestBasicAgree2B()。首先实现 Start()，然后按照图 2 的指示，编写通过 AppendEntries RPC 发送和接收新日志条目的代码。您需要实现选举限制（论文第 5.4....",
            "updateTime": "2025-07-18",
            "wordCount": 2308,
            "readingTime": 16,
            "relativePath": "lab2B.md"
        },
        "MIT6.824/raft论文研究.md": {
            "title": "Raft算法论文研究",
            "preview": "# Raft算法论文研究 Raft算法是一种用于分布式系统的一致性算法，相比Paxos更易理解和实现。 | 组成部分 | 描述 | |----------|------| | 强领导人 | 日志条目只从leader发送给其他服务器，简化了日志管理 | | 领导选举 | 使用随机计时器来选择leader，避免选票分割 | | 成员关系调整 | 成员变换时系统仍然可以正常工作 | 复制状态机的目的是让...",
            "updateTime": "2025-07-18",
            "wordCount": 7525,
            "readingTime": 51,
            "relativePath": "raft论文研究.md"
        },
        "interview/redis 2025.5.29.md": {
            "title": "redis 2025.5.29",
            "preview": "跳表的实现机制是它本质上是一种多层链表结构。 分层结构： Level 0 (最底层)： 包含所有数据节点，它们按照排序键（例如分数和成员）严格有序排列，形成一个基本的双向链表。 更高层级 (索引层)： 在 Level 0 之上，通过随机选择的方式，将一部分节点“提升”到更高的层级。每一层都是其下一层的“稀疏子集”，就像地图上的不同缩放级别。这种分层结构的核心在于，随着层数的升高，链表中的节点数量呈...",
            "updateTime": "2025-07-18",
            "wordCount": 9245,
            "readingTime": 62,
            "relativePath": "redis 2025.5.29.md"
        },
        "interview/牛客 2025.6.2.md": {
            "title": "牛客 2025.6.2",
            "preview": "每个Thread对象里面都有一个ThreadLocalMap引用 (注：原文为 ThreaLocal 引用，通常指 ThreadLocalMap)。 里面存一个 key 一个 value。 这个 key 是一个 ThreadLocal 的弱引用。 这个 value 是线程局部变量的副本，用户信息在这里作为想该线程保存的变量副本。 布隆过滤器底层是一个位图（字节数组）。 通过多层哈希算法来判断是否存...",
            "updateTime": "2025-07-18",
            "wordCount": 1765,
            "readingTime": 12,
            "relativePath": "牛客 2025.6.2.md"
        },
        "interview/牛客2025.5.30.md": {
            "title": "牛客2025.5.30",
            "preview": "每个Thread对象内部都有一个ThreadLocalMap类型的对象。 Key: ThreadLocal对象本身。这是一个弱引用，目的是为了防止内存泄漏。 注意: 即便使用了弱引用，如果线程长期存活（例如在线程池中），ThreadLocal对象占用的内存也不会被回收。因此，在不需要时应手动释放（调用remove()方法）。 Value: 我们想要存储的线程局部变量的副本。 --- 内存泄漏指的是...",
            "updateTime": "2025-07-18",
            "wordCount": 2237,
            "readingTime": 15,
            "relativePath": "牛客2025.5.30.md"
        },
        "chatting/六月的蝉鸣.md": {
            "title": "六月的蝉鸣",
            "preview": "六月的蝉鸣 写下这些文字时，已是大二下学期最后一门考试的凌晨，辗转反侧，思绪万千。 从小，我并没有什么远大的志向。不像我曾喜欢的一个女孩，她小时候就立志要成为一名“chemphysister”又想当物理学家又想当化学家。有的孩子从小就想当科学家、运动员，但我仔细回想，自己从未有过明确的目标，或许曾短暂地想成为钢琴家，但也只是一瞬的念头。我从小就是个无所事事、爱玩的孩子，和大多数男生没什么两样。 大...",
            "updateTime": "2025-07-18",
            "wordCount": 1923,
            "readingTime": 13,
            "relativePath": "六月的蝉鸣.md"
        },
        "jdk/AQS和可重入锁.md": {
            "title": "AQS和可重入锁源码解析",
            "preview": "# AQS和可重入锁源码解析 本篇文章我们以解析的方式来学习 AQS 和 可重入锁 在JDK源码中是如何实现的。 --- AQS 是什么？在Java的具体实现中，它是一个抽象类，名字叫 AbstractQueuedSynchronizer，简称 AQS，它是一个专门用来构建锁的框架。 它提供了一个 FIFO队列，实质上是一个 双向链表，来管理线程的等待和唤醒，每一个节点都是对一个线程的封装。简单来...",
            "updateTime": "2025-07-18",
            "wordCount": 6143,
            "readingTime": 41,
            "relativePath": "AQS和可重入锁.md"
        },
        "CS186/CS186-proj2.md": {
            "title": "Task 1: `LeafNode::fromBytes`",
            "preview": "这篇文章是对于CS186的proj2的总结和实现思路。 在这个任务中，我们需要实现LeafNode::fromBytes函数，这个函数就是一个反序列化，我们只需要参考LeafNode::toBytes的实现即可。我们需要从字节数组中读取数据，并将其转换为LeafNode对象。 首先我们分析一下LeafNode::toBytes的实现，它将LeafNode对象的各个字段转换为字节数组。 `java ...",
            "updateTime": "2025-07-18",
            "wordCount": 2477,
            "readingTime": 17,
            "relativePath": "CS186-proj2.md"
        },
        "CS186/CS186-proj3.md": {
            "title": "Task1: Blocking Nested Loop join（BNJL）",
            "preview": "这篇文章是对于CS186的proj3的总结和实现思路。 这个proj有一个不一样的地方是他建议我们阅读一下对应的代码骨架。 那么我们就大致浏览一下，整理一下各个部分的功能。 里面有一个BacktrackingIterator接口，对比普通迭代器他多了一个功能就是可以用一个指针来储存想要回溯的地方，等到需要回溯的时候可以通过reset()方法回到这个位置。 类QueryOperator实现了这个接口...",
            "updateTime": "2025-07-18",
            "wordCount": 8574,
            "readingTime": 58,
            "relativePath": "CS186-proj3.md"
        },
        "CS186/CS186-proj4.md": {
            "title": "Task 1: LockType",
            "preview": "# Task 1: LockType 这个任务的核心是实现对不同锁类型之间关系的判断。 > 任务要求: > 你需要实现 compatible 、 canBeParentLock 和 substitutable 方法。 具体来说，LockType 类中的三个关键方法需要我们实现： compatible(a, b): 判断在同一个资源上，当事务已持有锁 a 时，另一个事务是否可以请求并获得锁 b。 c...",
            "updateTime": "2025-07-18",
            "wordCount": 12397,
            "readingTime": 83,
            "relativePath": "CS186-proj4.md"
        },
        "CS186/CS186笔记01.md": {
            "title": "CS186 笔记01",
            "preview": "DBMS 架构是一个分层的软件系统，负责将用户的高级数据请求（如 SQL）转化为对物理存储设备的底层操作。它像一个精密的工厂，每一层都有明确的分工。 直接操作磁盘是极其复杂和低效的。一个分层的架构可以将复杂的问题分解，每一层专注于解决特定的问题（如查询解析、并发控制、内存管理、磁盘 I/O），从而实现关注点分离。这使得 DBMS 的设计、实现和维护变得更加模块化和高效。 一个典型的 DBMS 从上...",
            "updateTime": "2025-07-18",
            "wordCount": 9536,
            "readingTime": 64,
            "relativePath": "CS186笔记01.md"
        },
        "CS186/CS186笔记02.md": {
            "title": "CS186 笔记02",
            "preview": "缓冲区管理器（Buffer Manager） 是数据库管理系统（DBMS）的核心组件之一，它是一个位于内存中的缓冲区，负责在内存（缓冲池，Buffer Pool）和磁盘之间高效地移动和管理数据页面（Page）。它为上层组件提供了一个抽象，让它们感觉数据“总是在内存中”。 磁盘 I/O 相比内存访问要慢几个数量级。缓冲区管理器的主要目的就是为了最小化磁盘 I/O 的次数，通过将最常访问的数据页保留在...",
            "updateTime": "2025-07-18",
            "wordCount": 18474,
            "readingTime": 124,
            "relativePath": "CS186笔记02.md"
        },
        "CS186/CS186笔记03.md": {
            "title": "CS186 笔记03",
            "preview": "# CS186 笔记03 信息检索 (IR) 是一个传统上与数据库领域分离的研究领域. Hans P. Luhn在1959年提出了“Keyword in Context (KWIC)”. G. Salton在60、70年代开发了SMART系统. 这与关系数据库的革命大约同时发生. 自那时起进行了大量的研究，尤其是在网络时代. IR产品传统上是独立的，最初是文档管理系统. 它们服务于图书馆、政府、法...",
            "updateTime": "2025-07-18",
            "wordCount": 3473,
            "readingTime": 24,
            "relativePath": "CS186笔记03.md"
        },
        "CS186/CS186笔记04.md": {
            "title": "CS186 笔记04",
            "preview": "事务是DBMS（数据库管理系统）中对应应用程序或者活动的一种抽象视图。 它是一系列对数据库对象进行读写操作的序列。 事务作为一个原子单位，其所有工作批次必须要么全部提交（完成），要么全部终止（回滚）。 从应用程序的角度来看，事务的结构始于 begin transaction，包含一系列SQL语句，并最终以 end transaction 结束。 事务管理器（Xact Manager）控制事务的执行...",
            "updateTime": "2025-07-18",
            "wordCount": 5002,
            "readingTime": 34,
            "relativePath": "CS186笔记04.md"
        },
        "CS186/CS186笔记05.md": {
            "title": "CS186 笔记05: ARIES 恢复算法",
            "preview": "在数据库事务的 ACID 四大特性中，原子性 (Atomicity) 和 持久性 (Durability) 是由恢复系统来保证的。 原子性 (Atomicity): 保证一个事务中的所有操作要么全部完成，要么全部不产生任何效果。事务是一个不可分割的工作单元。 为什么需要？ 想象一个转账操作，它包含“账户A减钱”和“账户B加钱”两个步骤。如果系统在第一步完成后崩溃，原子性确保这个未完成的事务会被完全...",
            "updateTime": "2025-07-19",
            "wordCount": 3650,
            "readingTime": 25,
            "relativePath": "CS186笔记05.md"
        }
    }
};
