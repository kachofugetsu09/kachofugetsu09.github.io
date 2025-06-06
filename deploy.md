# GitHub Pages 博客部署指南

这是一个完整的静态博客网站，支持自动分类导航和文章管理。

## 🚀 部署到 GitHub Pages

### 1. 创建 GitHub 仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角的 "+" 号，选择 "New repository"
3. 仓库名称建议使用: `你的用户名.github.io` 或任意名称
4. 设置为 Public（公开仓库）
5. 点击 "Create repository"

### 2. 上传代码

```bash
# 1. 初始化本地Git仓库
git init

# 2. 添加所有文件
git add .

# 3. 提交
git commit -m "Initial commit: 博客网站上线"

# 4. 添加远程仓库（替换为你的仓库地址）
git remote add origin https://github.com/你的用户名/你的仓库名.git

# 5. 推送到GitHub
git push -u origin main
```

### 3. 启用 GitHub Pages

1. 进入你的GitHub仓库页面
2. 点击 "Settings" 选项卡
3. 在左侧菜单中找到 "Pages"
4. 在 "Source" 部分选择 "Deploy from a branch"
5. 选择 "main" 分支和 "/ (root)" 文件夹
6. 点击 "Save"

### 4. 访问你的网站

- 如果仓库名是 `你的用户名.github.io`，访问地址为: `https://你的用户名.github.io`
- 其他仓库名，访问地址为: `https://你的用户名.github.io/仓库名`

## 📝 添加新文章

### 方法一：使用脚本（推荐）

Windows系统：
```cmd
new-article.bat tech "新文章标题"
```

Linux/Mac系统：
```bash
./new-article.sh tech "新文章标题"
```

### 方法二：手动创建

1. 在对应分类文件夹（`tech/` 或 `interview/`）中创建 `.md` 文件
2. 编写文章内容
3. 运行构建脚本：`node build.js`
4. 提交并推送到GitHub

## 🔧 添加新分类

1. 修改 `build.js` 文件中的 `SITE_CONFIG.categories`
2. 创建对应的文件夹
3. 更新所有 JavaScript 文件中的分类配置
4. 运行构建脚本

## 📁 项目结构

```
├── index.html              # 首页
├── category.html           # 分类页面模板
├── article.html            # 文章页面模板
├── assets/
│   ├── css/
│   │   └── style.css       # 全局样式
│   └── js/
│       ├── main.js         # 首页脚本
│       ├── category.js     # 分类页面脚本
│       ├── article.js      # 文章页面脚本
│       └── config.js       # 自动生成的配置文件
├── tech/                   # 技术分享分类
│   └── *.md               # Markdown文章
├── interview/              # 面试笔记分类
│   └── *.md               # Markdown文章
├── build.js                # 构建脚本
├── new-article.sh          # 新建文章脚本(Linux/Mac)
├── new-article.bat         # 新建文章脚本(Windows)
├── deploy.md               # 本部署指南
├── README.md               # 项目说明
└── sitemap.txt             # 站点地图
```

## ⚙️ 自定义配置

### 修改网站标题和描述

编辑以下文件：
- `index.html` - 修改 `<title>` 和页面内容
- `category.html` - 修改页面标题
- `article.html` - 修改页面标题

### 修改样式主题

编辑 `assets/css/style.css` 文件：
- 修改颜色变量
- 调整布局样式
- 自定义动画效果

### 添加统计分析

在HTML文件的 `<head>` 部分添加：
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

## 🔄 工作流程

### 日常写作流程

1. **创建文章**：使用脚本或手动创建
2. **编写内容**：使用Markdown语法
3. **本地预览**：直接打开 `index.html`
4. **构建配置**：运行 `node build.js`
5. **提交代码**：
   ```bash
   git add .
   git commit -m "Add: 文章标题"
   git push
   ```
6. **等待部署**：GitHub Pages会自动部署

### 自动化脚本

你可以创建一个一键发布脚本：

**Windows (`publish.bat`):**
```cmd
@echo off
echo 正在构建配置...
node build.js
echo 正在提交到Git...
git add .
set /p "commit_msg=请输入提交信息: "
git commit -m "%commit_msg%"
echo 正在推送到GitHub...
git push
echo 发布完成！
```

**Linux/Mac (`publish.sh`):**
```bash
#!/bin/bash
echo "正在构建配置..."
node build.js
echo "正在提交到Git..."
git add .
read -p "请输入提交信息: " commit_msg
git commit -m "$commit_msg"
echo "正在推送到GitHub..."
git push
echo "发布完成！"
```

## 🐛 常见问题

### 1. 页面显示空白
- 检查浏览器控制台是否有JavaScript错误
- 确认所有文件路径正确
- 验证 `config.js` 文件是否正确生成

### 2. 文章无法加载
- 确认Markdown文件存在
- 检查文件名是否包含特殊字符
- 验证构建脚本是否正确执行

### 3. 样式显示异常
- 检查CSS文件路径
- 清除浏览器缓存
- 确认CDN资源正常加载

### 4. GitHub Pages部署失败
- 检查仓库设置
- 确认分支名称正确
- 查看Actions页面的错误信息

## 📞 技术支持

如果遇到问题，可以：
1. 检查浏览器开发者工具的控制台
2. 查看GitHub仓库的Actions页面
3. 参考GitHub Pages官方文档

---

**祝你写作愉快！** 📝✨
