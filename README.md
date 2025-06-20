# 花月的技术博客

这是一个基于GitHub Pages的静态博客网站，自动生成于 2025-6-20 00:02:37。

## 📚 文章分类

### fas fa-laptop-code 技术分享

技术学习笔记和经验分享

共 3 篇文章：

- [消息中间件背压机制深度解析](article.html?category=tech&file=Kafka%E5%92%8CRocketMQ%E7%9A%84%E8%83%8C%E5%8E%8B%E6%9C%BA%E5%88%B6%E8%A7%A3%E6%9E%90.md) (2025-06-19)
- [零拷贝技术解析：从麦当劳点餐看I/O优化之道](article.html?category=tech&file=%E9%9B%B6%E6%8B%B7%E8%B4%9D%E6%8A%80%E6%9C%AF%E8%A7%A3%E6%9E%90.md) (2025-06-13)
- [kafka笔记](article.html?category=tech&file=kafka%E7%AC%94%E8%AE%B0.md) (2025-06-06)

### fas fa-graduation-cap 计算机基础

计算机网络、数据结构与算法、组成原理等基础课程笔记

共 2 篇文章：

- [Java虚拟机笔记](article.html?category=CS-basics&file=Java%E8%99%9A%E6%8B%9F%E6%9C%BA.md) (2025-06-19)
- [**Network Edge 网络边缘**](article.html?category=CS-basics&file=%E8%AE%A1%E7%AE%97%E6%9C%BA%E7%BD%91%E7%BB%9C.md) (2025-02-23)

### fas fa-network-wired MIT6.824笔记

MIT 6.824 分布式系统课程笔记

共 2 篇文章：

- [Raft算法论文研究](article.html?category=MIT6.824&file=raft%E8%AE%BA%E6%96%87%E7%A0%94%E7%A9%B6.md) (2025-06-09)
- [lab1](article.html?category=MIT6.824&file=lab1.md) (2025-06-06)

### fas fa-briefcase 面试笔记

面试准备和学习记录

共 3 篇文章：

- [牛客 2025.6.2](article.html?category=interview&file=%E7%89%9B%E5%AE%A2%202025.6.2.md) (2025-06-01)
- [牛客2025.5.30](article.html?category=interview&file=%E7%89%9B%E5%AE%A22025.5.30.md) (2025-06-01)
- [redis 2025.5.29](article.html?category=interview&file=redis%202025.5.29.md) (2025-05-28)

### fas fa-heart 心情随笔

生活感悟与内心独白

共 1 篇文章：

- [六月的蝉鸣](article.html?category=chatting&file=%E5%85%AD%E6%9C%88%E7%9A%84%E8%9D%89%E9%B8%A3.md) (2025-06-17)


## 🚀 部署说明

1. 将代码推送到GitHub仓库
2. 在仓库设置中启用GitHub Pages
3. 选择分支和文件夹（通常是main分支的根目录）
4. 等待部署完成

## 🔧 添加新文章

1. 在对应分类文件夹中添加Markdown文件
2. 运行 `node build.js` 更新配置
3. 提交并推送到GitHub

## 📁 项目结构

```
├── index.html          # 首页
├── category.html       # 分类页面
├── article.html        # 文章详情页
├── assets/
│   ├── css/
│   │   └── style.css   # 样式文件
│   └── js/
│       ├── main.js     # 首页脚本
│       ├── category.js # 分类页面脚本
│       ├── article.js  # 文章页面脚本
│       └── config.js   # 自动生成的配置文件
├── tech/               # 技术分享分类
├── intership/          # 实习笔记分类
├── build.js            # 构建脚本
└── README.md           # 项目说明
```

最后更新: 2025-6-20 00:02:38
