import { defineConfig } from "vitepress";
import { withMermaid } from "vitepress-plugin-mermaid";
// https://vitepress.dev/reference/site-config
export default withMermaid(
  defineConfig({
    title: "花月的Blog",
    description: "huashen's Blog",
    base: "/",
    // 网站图标
    head: [
      ["link", { rel: "icon", href: "/img/logo.jpg" }],
      ["link", { rel: "apple-touch-icon", href: "/img/logo.jpg" }],
      ["meta", { name: "theme-color", content: "#3b82f6" }],
    ],
    // 启用最后更新时间
    lastUpdated: true,
    themeConfig: {
      // 导航栏 logo
      logo: "/img/logo.jpg",
      // https://vitepress.dev/reference/default-theme-config
      // 启用本地搜索
      search: {
        provider: "local",
        options: {
          translations: {
            button: {
              buttonText: "搜索文档",
              buttonAriaLabel: "搜索文档",
            },
            modal: {
              noResultsText: "无法找到相关结果",
              resetButtonTitle: "清除查询条件",
              footer: {
                selectText: "选择",
                navigateText: "切换",
                closeText: "关闭",
              },
            },
          },
        },
      },

      sidebar: [
        {
          text: "主页",
          collapsed: true,
          items: [{ text: "主页", link: "/main" }],
        },
        {
          text: "技术分享",
          collapsed: true,
          items: [
            { text: "ARIES与innodb", link: "/tech/ARIES与innodb" },
            {
              text: "Kafka和RocketMQ的背压机制解析",
              link: "/tech/Kafka和RocketMQ的背压机制解析",
            },
            { text: "零拷贝技术解析", link: "/tech/零拷贝技术解析" },
            {text:"通过例子理解mysql的隔离级别", link:"/tech/通过例子理解mysql的隔离级别"},
          ],
        },
        {
          text: "CS186学习",
          collapsed: true,
          items: [
            {
              text: "CS186笔记",
              collapsed: true,
              items: [
                { text: "CS186笔记-1", link: "/CS186/笔记/CS186笔记01" },
                { text: "CS186笔记-2", link: "/CS186/笔记/CS186笔记02" },
                { text: "CS186笔记-3", link: "/CS186/笔记/CS186笔记03" },
                { text: "CS186笔记-4", link: "/CS186/笔记/CS186笔记04" },
                { text: "CS186笔记-5", link: "/CS186/笔记/CS186笔记05" },
              ],
            },
            {
              text: "CS186Labs",
              collapsed: true,
              items: [
                { text: "CS186Lab02", link: "/CS186/lab/CS186-proj2" },
                { text: "CS186Lab03", link: "/CS186/lab/CS186-proj3" },
                { text: "CS186Lab04", link: "/CS186/lab/CS186-proj4" },
                { text: "CS186Lab05", link: "/CS186/lab/CS186-proj5" },
              ],
            },
          ],
        },
        {
          text: "计算机基础",
          collapsed: true,
          items: [
            { text: "计算机网络", link: "/CS-basics/计算机网络" },
            { text: "IO多路复用", link: "/CS-basics/IO多路复用" },
            { text: "Java虚拟机", link: "/CS-basics/Java虚拟机" },
            { text: "Kafka笔记", link: "/CS-basics/kafka笔记" },
            { text: "MySQL笔记", link: "/CS-basics/MYSQL笔记" },
          ],
        },
        {
          text: "MIT6.824",
          collapsed: true,
          items: [
            { text: "Lab1", link: "/MIT6.824/lab1" },
            { text: "Lab2", link: "/MIT6.824/lab2" },
            { text: "Lab3A", link: "/MIT6.824/lab3A" },
            { text: "Lab3B", link: "/MIT6.824/lab3B" },
            { text : "Lab3C", link: "/MIT6.824/lab3C" },
            {text:"Lab3D",link:"/MIT6.824/lab3D"},
            { text: "Raft论文研究", link: "/MIT6.824/raft论文研究" },
            {text: "Raft理论总结",link:"/MIT6.824/raft总结"}
          ],
        },
        {
          text: "JDK源码解析",
          collapsed: true,
          items: [{ text: "AQS和可重入锁", link: "/jdk/AQS和可重入锁" }],
        },
        {
          text: "Spring框架",
          collapsed: true,
          items: [
            {
              text: "JWT双Token深度解析",
              link: "/spring/JWT双Token深度解析：平衡安全与效率的多端登录实践",
            },
            {
              text: "Spring事务机制",
              link: "/spring/spring当中的事务是如何运作的",
            },
            {
              text: "Kafka专题",
              collapsed: true,
              items: [
                { text: "Kafka基本用法", link: "/spring/kafka/kafka基本用法" },
                {
                  text: "Kafka再平衡机制",
                  link: "/spring/kafka/kafka的再平衡机制",
                },
                {
                  text: "Kafka Streams实践",
                  link: "/spring/kafka/以点赞系统为例的kafka streams用法",
                },
              ],
            },
          ],
        },
        {
          text: "redis-mini实现",
          collapsed: true,
          items: [
            {
              text: "初版渐进式哈希实现思路",
              link: "/redis-mini/渐进式哈希实现思路",
            },
            { text: "初版AOF", link: "/redis-mini/渐进式哈希实现思路" },
          ],
        },
        {
          text: "javaer学习rust",
          collapsed: true,
          items: [
            { text: "rust中的变量", link: "/rust/rust当中的变量" },
            { text: "rust当中的struct与trait", link: "/rust/rust当中的结构体" },
            { text: "rust当中的控制流", link: "/rust/rust当中的控制流" },
            {
              text: "rust当中对于空值的处理",
              link: "/rust/rust当中对于空值的处理",
            },
            { text: "rust当中的错误处理", link: "/rust/rust当中的错误处理" },
            { text: "rust当中的常用数据结构", link: "/rust/rust当中的集合" },
            {text:"rust当中对于迭代器的使用", link: "/rust/rust当中对于迭代器的使用"},
          ],
        },
      ],
    },
    // Mermaid 配置
    mermaid: {
      // 可选配置
      theme: "default",
    },
  }),
);
