
// 自动生成的配置文件 - 请勿手动编辑
// 生成时间: 2025-06-13T12:01:14.677Z

window.SITE_DATA = {
    categories: {
    "tech": {
        "name": "技术分享",
        "description": "技术学习笔记和经验分享",
        "icon": "fas fa-laptop-code",
        "color": "#667eea"
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
    }
},
    articleLists: {
    "tech": [
        "零拷贝技术解析.md",
        "kafka笔记.md"
    ],
    "CS-basics": [
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
    ]
},
    articleDetails: {
    "tech/零拷贝技术解析.md": {
        "title": "零拷贝技术解析：从麦当劳点餐看I/O优化之道",
        "preview": "# 零拷贝技术解析：从麦当劳点餐看I/O优化之道 在深入理解零拷贝技术之前，我们需要先明确计算机系统中两个至关重要的概念：用户态和内核态。 内核态控制着计算机中最为宝贵的资源： CPU：处理器调度和时间片分配 磁盘：数据存储和读写操作 内存：物理内存的分配和管理 网卡：网络通信和数据传输 只有内核态才有权限直接调用这些核心资源。 用户态是应用程序的运行空间： 每个应用程序拥有独立的内存空间 为了系...",
        "updateTime": "2025-06-13"
    },
    "MIT6.824/raft论文研究.md": {
        "title": "Raft算法论文研究",
        "preview": "# Raft算法论文研究 Raft算法是一种用于分布式系统的一致性算法，相比Paxos更易理解和实现。 | 组成部分 | 描述 | |----------|------| | 强领导人 | 日志条目只从leader发送给其他服务器，简化了日志管理 | | 领导选举 | 使用随机计时器来选择leader，避免选票分割 | | 成员关系调整 | 成员变换时系统仍然可以正常工作 | 复制状态机的目的是让...",
        "updateTime": "2025-06-09"
    },
    "tech/kafka笔记.md": {
        "title": "kafka笔记",
        "preview": "Kafka 提供高度的容错能力：在包含 n 个副本的集群中，可以容忍 n-1 个节点失败而保持系统可用。 消费者可以组成 Consumer Group，每条消息只会被同一组内的一个消费者处理。这种设计完美匹配 Kafka 的分区特性：当一个主题有多个分区时，消息会动态分配给多个消费者，显著提高并发处理的吞吐量。 `java public class KafkaConsumer<K, V> impl...",
        "updateTime": "2025-06-06"
    },
    "MIT6.824/lab1.md": {
        "title": "lab1",
        "preview": "MapReduce 是一种编程模型和相关的实现，用于处理和生成大数据集。它通过将数据分割并在多台机器上并行处理，大大提高了数据处理的效率。 MapReduce 过程主要由两个阶段组成：Map 和 Reduce。 Map 阶段: 输入数据被自动划分为 M 个输入片段 (Input Splits)，每个片段通常大小为 16-64MB。 这些输入片段可以由不同的机器并行处理。 Map 函数接收一个 (k...",
        "updateTime": "2025-06-06"
    },
    "interview/牛客 2025.6.2.md": {
        "title": "牛客 2025.6.2",
        "preview": "每个Thread对象里面都有一个ThreadLocalMap引用 (注：原文为 ThreaLocal 引用，通常指 ThreadLocalMap)。 里面存一个 key 一个 value。 这个 key 是一个 ThreadLocal 的弱引用。 这个 value 是线程局部变量的副本，用户信息在这里作为想该线程保存的变量副本。 布隆过滤器底层是一个位图（字节数组）。 通过多层哈希算法来判断是否存...",
        "updateTime": "2025-06-01"
    },
    "interview/牛客2025.5.30.md": {
        "title": "牛客2025.5.30",
        "preview": "每个Thread对象内部都有一个ThreadLocalMap类型的对象。 Key: ThreadLocal对象本身。这是一个弱引用，目的是为了防止内存泄漏。 注意: 即便使用了弱引用，如果线程长期存活（例如在线程池中），ThreadLocal对象占用的内存也不会被回收。因此，在不需要时应手动释放（调用remove()方法）。 Value: 我们想要存储的线程局部变量的副本。 --- 内存泄漏指的是...",
        "updateTime": "2025-06-01"
    },
    "interview/redis 2025.5.29.md": {
        "title": "redis 2025.5.29",
        "preview": "跳表的实现机制是它本质上是一种多层链表结构。 分层结构： Level 0 (最底层)： 包含所有数据节点，它们按照排序键（例如分数和成员）严格有序排列，形成一个基本的双向链表。 更高层级 (索引层)： 在 Level 0 之上，通过随机选择的方式，将一部分节点“提升”到更高的层级。每一层都是其下一层的“稀疏子集”，就像地图上的不同缩放级别。这种分层结构的核心在于，随着层数的升高，链表中的节点数量呈...",
        "updateTime": "2025-05-28"
    },
    "CS-basics/计算机网络.md": {
        "title": "**Network Edge 网络边缘**",
        "preview": "Servers are often located in data centers. 服务器 通常位于数据中心。 Clients are end-user devices such as PCs, smartphones, etc. 客户端 是终端用户设备，如PC、智能手机等。 Residential Access Network (居民接入网络) Provides internet access...",
        "updateTime": "2025-02-23"
    }
}
};
