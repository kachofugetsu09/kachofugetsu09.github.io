/**
 * 构建脚本 - 自动生成文章配置
 * 运行: node build.js
 * 
 * 这个脚本会扫描所有分类文件夹，生成文章列表配置文件
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 站点配置
const SITE_CONFIG = {    categories: {
        'tech': {
            name: '技术分享',
            description: '技术学习笔记和经验分享',
            icon: 'fas fa-laptop-code',
            color: '#667eea'
        },
        'CS-basics': {
            name: '计算机基础',
            description: '计算机网络、数据结构与算法、组成原理等基础课程笔记',
            icon: 'fas fa-graduation-cap',
            color: '#38b2ac'
        },
        'MIT6.824': {
            name: 'MIT6.824笔记',
            description: 'MIT 6.824 分布式系统课程笔记',
            icon: 'fas fa-network-wired',
            color: '#4299e1'
        },
        'interview': {
            name: '面试笔记',
            description: '面试准备和学习记录',
            icon: 'fas fa-briefcase',
            color: '#764ba2'
        }
    }
};

/**
 * 扫描文件夹获取Markdown文件列表
 */
function scanMarkdownFiles(dirPath) {
    try {
        if (!fs.existsSync(dirPath)) {
            console.warn(`目录不存在: ${dirPath}`);
            return [];
        }
        
        const files = fs.readdirSync(dirPath);
        return files.filter(file => 
            file.endsWith('.md') && 
            fs.statSync(path.join(dirPath, file)).isFile()
        );
    } catch (error) {
        console.error(`扫描目录失败 ${dirPath}:`, error);
        return [];
    }
}

/**
 * 获取文件修改时间（直接使用文件系统时间）
 */
function getFileModifiedTime(filePath) {
    try {
        // 直接使用文件系统修改时间
        const stats = fs.statSync(filePath);
        return stats.mtime.toISOString().split('T')[0];
    } catch (error) {
        console.warn(`获取文件修改时间失败 ${filePath}:`, error);
        return new Date().toISOString().split('T')[0];
    }
}

/**
 * 提取Markdown文件的标题
 */
function extractTitleFromMarkdown(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        
        // 查找第一个# 标题
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('# ')) {
                return trimmed.substring(2).trim();
            }
        }
        
        // 如果没找到标题，使用文件名（去掉.md扩展名）
        return path.basename(filePath, '.md');
    } catch (error) {
        console.warn(`提取标题失败 ${filePath}:`, error);
        return path.basename(filePath, '.md');
    }
}

/**
 * 提取Markdown文件的预览内容
 */
function extractPreviewFromMarkdown(filePath, maxLength = 200) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // 移除Markdown标记并提取纯文本
        const plainText = content
            .replace(/^#{1,6}\s+.*$/gm, '') // 移除标题
            .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体
            .replace(/\*(.*?)\*/g, '$1') // 移除斜体
            .replace(/`(.*?)`/g, '$1') // 移除行内代码
            .replace(/```[\s\S]*?```/g, '') // 移除代码块
            .replace(/^\s*[-*+]\s+/gm, '') // 移除列表标记
            .replace(/^\s*\d+\.\s+/gm, '') // 移除有序列表标记
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // 移除链接标记，保留文本
            .replace(/!\[([^\]]*)\]\([^)]+\)/g, '') // 移除图片
            .replace(/\n+/g, ' ') // 替换换行为空格
            .replace(/\s+/g, ' ') // 合并多个空格
            .trim();
        
        return plainText.length > maxLength 
            ? plainText.substring(0, maxLength) + '...'
            : plainText;
    } catch (error) {
        console.warn(`提取预览失败 ${filePath}:`, error);
        return '暂无预览...';
    }
}

/**
 * 生成文章配置
 */
function generateArticleConfig() {
    const articles = {};
    const allArticles = [];
    
    console.log('开始扫描文章...\n');
    
    // 扫描每个分类
    for (const [categoryKey, categoryInfo] of Object.entries(SITE_CONFIG.categories)) {
        const categoryPath = path.join(__dirname, categoryKey);
        const markdownFiles = scanMarkdownFiles(categoryPath);
        
        console.log(`分类 "${categoryInfo.name}" (${categoryKey}): 找到 ${markdownFiles.length} 个文件`);
        
        articles[categoryKey] = [];
        
        for (const filename of markdownFiles) {
            const filePath = path.join(categoryPath, filename);
            const title = extractTitleFromMarkdown(filePath);
            const preview = extractPreviewFromMarkdown(filePath);
            const updateTime = getFileModifiedTime(filePath);
            
            const articleInfo = {
                filename: filename,
                title: title,
                preview: preview,
                category: categoryKey,
                categoryName: categoryInfo.name,
                url: `article.html?category=${categoryKey}&file=${encodeURIComponent(filename)}`,
                updateTime: updateTime
            };
            
            articles[categoryKey].push(articleInfo);
            allArticles.push(articleInfo);
            
            console.log(`  - ${title} (${filename})`);
        }
        
        console.log('');
    }
    
    // 按更新时间排序
    for (const categoryKey of Object.keys(articles)) {
        articles[categoryKey].sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime));
    }
    
    allArticles.sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime));
    
    return { articles, allArticles, categories: SITE_CONFIG.categories };
}

/**
 * 更新JavaScript配置文件
 */
function updateJavaScriptConfig(config) {
    const jsFiles = [
        'assets/js/main.js',
        'assets/js/category.js',
        'assets/js/article.js'
    ];
    
    // 生成文章列表配置
    const articleListsConfig = {};
    for (const [categoryKey, articleList] of Object.entries(config.articles)) {
        articleListsConfig[categoryKey] = articleList.map(article => article.filename);
    }
    
    // 生成文章详细信息配置
    const articleDetailsConfig = {};
    for (const article of config.allArticles) {
        const key = `${article.category}/${article.filename}`;
        articleDetailsConfig[key] = {
            title: article.title,
            preview: article.preview,
            updateTime: article.updateTime
        };
    }
    
    const configContent = `
// 自动生成的配置文件 - 请勿手动编辑
// 生成时间: ${new Date().toISOString()}

window.SITE_DATA = {
    categories: ${JSON.stringify(config.categories, null, 4)},
    articleLists: ${JSON.stringify(articleListsConfig, null, 4)},
    articleDetails: ${JSON.stringify(articleDetailsConfig, null, 4)}
};
`;
    
    // 写入配置文件
    fs.writeFileSync('assets/js/config.js', configContent);
    console.log('✅ 生成配置文件: assets/js/config.js');
}

/**
 * 生成站点地图
 */
function generateSitemap(config) {
    const baseUrl = 'https://your-username.github.io/your-repo-name'; // 请替换为实际URL
    const sitemap = [];
    
    // 添加首页
    sitemap.push(`${baseUrl}/`);
    
    // 添加分类页面
    for (const categoryKey of Object.keys(config.categories)) {
        sitemap.push(`${baseUrl}/category.html?category=${categoryKey}`);
    }
    
    // 添加文章页面
    for (const article of config.allArticles) {
        sitemap.push(`${baseUrl}/${article.url}`);
    }
    
    const sitemapContent = sitemap.join('\n');
    fs.writeFileSync('sitemap.txt', sitemapContent);
    console.log('✅ 生成站点地图: sitemap.txt');
}

/**
 * 生成README文档
 */
function generateReadme(config) {
    let readmeContent = `# 花月的技术博客

这是一个基于GitHub Pages的静态博客网站，自动生成于 ${new Date().toLocaleString('zh-CN')}。

## 📚 文章分类

`;

    for (const [categoryKey, categoryInfo] of Object.entries(config.categories)) {
        const articleCount = config.articles[categoryKey].length;
        readmeContent += `### ${categoryInfo.icon} ${categoryInfo.name}\n\n`;
        readmeContent += `${categoryInfo.description}\n\n`;
        readmeContent += `共 ${articleCount} 篇文章：\n\n`;
        
        for (const article of config.articles[categoryKey]) {
            readmeContent += `- [${article.title}](${article.url}) (${article.updateTime})\n`;
        }
        
        readmeContent += '\n';
    }

    readmeContent += `
## 🚀 部署说明

1. 将代码推送到GitHub仓库
2. 在仓库设置中启用GitHub Pages
3. 选择分支和文件夹（通常是main分支的根目录）
4. 等待部署完成

## 🔧 添加新文章

1. 在对应分类文件夹中添加Markdown文件
2. 运行 \`node build.js\` 更新配置
3. 提交并推送到GitHub

## 📁 项目结构

\`\`\`
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
\`\`\`

最后更新: ${new Date().toLocaleString('zh-CN')}
`;

    fs.writeFileSync('README.md', readmeContent);
    console.log('✅ 生成README文档: README.md');
}

/**
 * 主函数
 */
function main() {
    console.log('🔨 开始构建博客配置...\n');
    
    try {
        // 生成文章配置
        const config = generateArticleConfig();
        
        // 更新JavaScript配置
        updateJavaScriptConfig(config);
        
        // 生成站点地图
        generateSitemap(config);
        
        // 生成README
        generateReadme(config);
        
        console.log('✅ 构建完成！');
        console.log(`📊 统计信息:`);
        console.log(`   - 分类数量: ${Object.keys(config.categories).length}`);
        console.log(`   - 文章总数: ${config.allArticles.length}`);
        
        for (const [categoryKey, categoryInfo] of Object.entries(config.categories)) {
            console.log(`   - ${categoryInfo.name}: ${config.articles[categoryKey].length} 篇`);
        }
        
        console.log('\n🚀 现在可以部署到GitHub Pages了！');
        
    } catch (error) {
        console.error('❌ 构建失败:', error);
        process.exit(1);
    }
}

// 运行构建
if (require.main === module) {
    main();
}

module.exports = { generateArticleConfig, updateJavaScriptConfig };
