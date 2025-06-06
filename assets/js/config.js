
// 自动生成的配置文件 - 请勿手动编辑
// 生成时间: 2025-06-06T17:59:33.852Z

window.SITE_DATA = {
    categories: {
    "tech": {
        "name": "技术分享",
        "description": "技术学习笔记和经验分享",
        "icon": "fas fa-laptop-code",
        "color": "#667eea"
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
        "计算机网络.md"
    ],
    "interview": [
        "牛客 2025.6.2.md",
        "牛客2025.5.30.md",
        "redis 2025.5.29.md"
    ]
},
    articleDetails: {
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
    "tech/计算机网络.md": {
        "title": "**Network Edge 网络边缘**",
        "preview": "Servers are often located in data centers. 服务器 通常位于数据中心。 Clients are end-user devices such as PCs, smartphones, etc. 客户端 是终端用户设备，如PC、智能手机等。 Residential Access Network (居民接入网络) Provides internet access...",
        "updateTime": "2025-02-23"
    }
}
};
