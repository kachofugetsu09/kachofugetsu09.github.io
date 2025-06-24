
// 自动生成的配置文件 - 请勿手动编辑
// 生成时间: 2025-06-24T17:04:55.143Z

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
        }
    },
    "articleLists": {
        "tech": [
            "Kafka和RocketMQ的背压机制解析.md",
            "kafka笔记.md",
            "零拷贝技术解析.md"
        ],
        "redis-mini": [
            "渐进式哈希实现思路.md"
        ],
        "CS-basics": [
            "Java虚拟机.md",
            "计算机网络.md"
        ],
        "MIT6.824": [
            "raft论文研究.md",
            "lab1.md"
        ],
        "interview": [
            "牛客 2025.6.2.md",
            "牛客2025.5.30.md",
            "redis 2025.5.29.md"
        ],
        "chatting": [
            "六月的蝉鸣.md"
        ]
    },
    "articleDetails": {
        "tech/Kafka和RocketMQ的背压机制解析.md": {
            "title": "消息中间件背压机制深度解析",
            "preview": "背压是一种流量控制机制,用于处理系统中生产者和消费者处理能力不匹配的情况。简单来说,就是当下游系统(消费者)处理数据的速度跟不上上游系统(生产者)产生数据的速度时,需要一种机制来对上游进行限流,从而保护系统不会因为负载过高而崩溃。 系统稳定性保护 防止消费者被大量数据压垮 避免内存溢出(OOM)问题 保持系统的可用性和稳定性 资源合理利用 在系统负载高峰期合理分配资源 避免资源浪费和过度消耗 实现...",
            "updateTime": "2025-06-23",
            "wordCount": 3860,
            "readingTime": 26,
            "relativePath": "Kafka和RocketMQ的背压机制解析.md"
        },
        "tech/kafka笔记.md": {
            "title": "kafka笔记",
            "preview": "Kafka 提供高度的容错能力：在包含 n 个副本的集群中，可以容忍 n-1 个节点失败而保持系统可用。 消费者可以组成 Consumer Group，每条消息只会被同一组内的一个消费者处理。这种设计完美匹配 Kafka 的分区特性：当一个主题有多个分区时，消息会动态分配给多个消费者，显著提高并发处理的吞吐量。 `java public class KafkaConsumer<K, V> impl...",
            "updateTime": "2025-06-23",
            "wordCount": 1062,
            "readingTime": 8,
            "relativePath": "kafka笔记.md"
        },
        "tech/零拷贝技术解析.md": {
            "title": "零拷贝技术解析：从麦当劳点餐看I/O优化之道",
            "preview": "# 零拷贝技术解析：从麦当劳点餐看I/O优化之道 在深入理解零拷贝技术之前，我们需要先明确计算机系统中两个至关重要的概念：用户态和内核态。 内核态控制着计算机中最为宝贵的资源： CPU：处理器调度和时间片分配 磁盘：数据存储和读写操作 内存：物理内存的分配和管理 网卡：网络通信和数据传输 只有内核态才有权限直接调用这些核心资源。 用户态是应用程序的运行空间： 每个应用程序拥有独立的内存空间 为了系...",
            "updateTime": "2025-06-23",
            "wordCount": 3561,
            "readingTime": 24,
            "relativePath": "零拷贝技术解析.md"
        },
        "redis-mini/渐进式哈希实现思路.md": {
            "title": "渐进式哈希实现思路",
            "preview": "### 当传统哈希表无法满足我：深入剖析Dict如何用CoW和MVCC打造“强一致性快照”数据结构 > 核心问题：如何在Java环境下实现一个支持以下特性的哈希表？ > - 创建完全一致的数据快照（例如：RDB持久化、AOF重写） > - 支持渐进式扩容（类似Redis的渐进式哈希） > - 在快照创建期间保持高性能写入 > 解决方案： > - 采用MVCC（多版本并发控制）思想 > - 基于不可...",
            "updateTime": "2025-06-24",
            "wordCount": 4069,
            "readingTime": 28,
            "relativePath": "渐进式哈希实现思路.md"
        },
        "CS-basics/Java虚拟机.md": {
            "title": "Java虚拟机笔记",
            "preview": "<link rel=\"stylesheet\" href=\"../assets/css/details.css\"> 让我们通过一个贯穿全文的示例来理解JVM的内存模型： `java // 示例代码：一个简单的学生成绩管理系统 public class Student { // 静态字段：存储在元空间的类信息中 private static String schoolName = \"清华大学\"; pr...",
            "updateTime": "2025-06-23",
            "wordCount": 17416,
            "readingTime": 117,
            "relativePath": "Java虚拟机.md"
        },
        "CS-basics/计算机网络.md": {
            "title": "**Network Edge 网络边缘**",
            "preview": "Servers are often located in data centers. 服务器 通常位于数据中心。 Clients are end-user devices such as PCs, smartphones, etc. 客户端 是终端用户设备，如PC、智能手机等。 Residential Access Network (居民接入网络) Provides internet access...",
            "updateTime": "2025-02-23",
            "wordCount": 12306,
            "readingTime": 83,
            "relativePath": "计算机网络.md"
        },
        "MIT6.824/lab1.md": {
            "title": "lab1",
            "preview": "MapReduce 是一种编程模型和相关的实现，用于处理和生成大数据集。它通过将数据分割并在多台机器上并行处理，大大提高了数据处理的效率。 MapReduce 过程主要由两个阶段组成：Map 和 Reduce。 Map 阶段: 输入数据被自动划分为 M 个输入片段 (Input Splits)，每个片段通常大小为 16-64MB。 这些输入片段可以由不同的机器并行处理。 Map 函数接收一个 (k...",
            "updateTime": "2025-06-06",
            "wordCount": 4270,
            "readingTime": 29,
            "relativePath": "lab1.md"
        },
        "MIT6.824/raft论文研究.md": {
            "title": "Raft算法论文研究",
            "preview": "# Raft算法论文研究 Raft算法是一种用于分布式系统的一致性算法，相比Paxos更易理解和实现。 | 组成部分 | 描述 | |----------|------| | 强领导人 | 日志条目只从leader发送给其他服务器，简化了日志管理 | | 领导选举 | 使用随机计时器来选择leader，避免选票分割 | | 成员关系调整 | 成员变换时系统仍然可以正常工作 | 复制状态机的目的是让...",
            "updateTime": "2025-06-09",
            "wordCount": 7525,
            "readingTime": 51,
            "relativePath": "raft论文研究.md"
        },
        "interview/redis 2025.5.29.md": {
            "title": "redis 2025.5.29",
            "preview": "跳表的实现机制是它本质上是一种多层链表结构。 分层结构： Level 0 (最底层)： 包含所有数据节点，它们按照排序键（例如分数和成员）严格有序排列，形成一个基本的双向链表。 更高层级 (索引层)： 在 Level 0 之上，通过随机选择的方式，将一部分节点“提升”到更高的层级。每一层都是其下一层的“稀疏子集”，就像地图上的不同缩放级别。这种分层结构的核心在于，随着层数的升高，链表中的节点数量呈...",
            "updateTime": "2025-05-28",
            "wordCount": 9245,
            "readingTime": 62,
            "relativePath": "redis 2025.5.29.md"
        },
        "interview/牛客 2025.6.2.md": {
            "title": "牛客 2025.6.2",
            "preview": "每个Thread对象里面都有一个ThreadLocalMap引用 (注：原文为 ThreaLocal 引用，通常指 ThreadLocalMap)。 里面存一个 key 一个 value。 这个 key 是一个 ThreadLocal 的弱引用。 这个 value 是线程局部变量的副本，用户信息在这里作为想该线程保存的变量副本。 布隆过滤器底层是一个位图（字节数组）。 通过多层哈希算法来判断是否存...",
            "updateTime": "2025-06-01",
            "wordCount": 1765,
            "readingTime": 12,
            "relativePath": "牛客 2025.6.2.md"
        },
        "interview/牛客2025.5.30.md": {
            "title": "牛客2025.5.30",
            "preview": "每个Thread对象内部都有一个ThreadLocalMap类型的对象。 Key: ThreadLocal对象本身。这是一个弱引用，目的是为了防止内存泄漏。 注意: 即便使用了弱引用，如果线程长期存活（例如在线程池中），ThreadLocal对象占用的内存也不会被回收。因此，在不需要时应手动释放（调用remove()方法）。 Value: 我们想要存储的线程局部变量的副本。 --- 内存泄漏指的是...",
            "updateTime": "2025-06-01",
            "wordCount": 2237,
            "readingTime": 15,
            "relativePath": "牛客2025.5.30.md"
        },
        "chatting/六月的蝉鸣.md": {
            "title": "六月的蝉鸣",
            "preview": "六月的蝉鸣 写下这些文字时，已是大二下学期最后一门考试的凌晨，辗转反侧，思绪万千。 从小，我并没有什么远大的志向。不像我曾喜欢的一个女孩，她小时候就立志要成为一名“chemphysister”又想当物理学家又想当化学家。有的孩子从小就想当科学家、运动员，但我仔细回想，自己从未有过明确的目标，或许曾短暂地想成为钢琴家，但也只是一瞬的念头。我从小就是个无所事事、爱玩的孩子，和大多数男生没什么两样。 大...",
            "updateTime": "2025-06-17",
            "wordCount": 1923,
            "readingTime": 13,
            "relativePath": "六月的蝉鸣.md"
        }
    }
};
