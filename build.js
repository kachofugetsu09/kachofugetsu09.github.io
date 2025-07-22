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
const SITE_CONFIG = {    
    categories: {
        'tech': {
            name: '技术分享',
            description: '技术学习笔记和经验分享',
            icon: 'fas fa-laptop-code',
            color: '#667eea'
        },
        'redis-mini': {
            name: 'Redis实现',
            description: 'Redis源码分析与Java版本实现',
            icon: 'fas fa-database',
            color: '#dc382d'
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
        },
        'chatting': {
            name: '心情随笔',
            description: '生活感悟与内心独白',
            icon: 'fas fa-heart',
            color: '#f093fb'
        },
        'jdk': {
            name: 'JDK源码解析',
            description: 'Java开发工具包源码深度剖析与学习笔记',
            icon: 'fab fa-java',
            color: '#f89820'
        },
        'CS186': {
            name: 'CS186数据库系统',
            description: 'UC Berkeley CS186 数据库系统课程笔记',
            icon: 'fas fa-database',
            color: '#805ad5'
        }
    }
};

/**
 * 计算文章字数
 */
function countWords(content) {
    try {
        // 移除Markdown标记
        const plainText = content
            .replace(/```[\s\S]*?```/g, '') // 移除代码块
            .replace(/`.*?`/g, '') // 移除行内代码
            .replace(/!?\[([^\]]*)\]\([^)]+\)/g, '$1') // 移除链接和图片标记，保留链接文本
            .replace(/[#*`~>]/g, '') // 移除其他Markdown标记
            .replace(/\s+/g, '') // 移除所有空白字符
            .trim();

        // 计算中文字符和英文单词
        const chineseChars = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length;
        const englishWords = (plainText.match(/[a-zA-Z]+/g) || []).length;
        
        // 中文字符算一个字，英文单词算一个字
        return chineseChars + englishWords;
    } catch (error) {
        console.warn('计算字数失败:', error);
        return 0;
    }
}

/**
 * 计算预估阅读时间（分钟）
 */
function calculateReadingTime(wordCount) {

    const WORDS_PER_MINUTE = 150; // 调整为平均每分钟150字
    const minutes = Math.ceil(wordCount / WORDS_PER_MINUTE);
    return Math.max(1, minutes); // 最少1分钟
}

/**
 * 递归扫描文件夹获取Markdown文件列表（支持多级子目录）
 */
function scanMarkdownFiles(dirPath, relativePath = '') {
    try {
        if (!fs.existsSync(dirPath)) {
            console.warn(`目录不存在: ${dirPath}`);
            return [];
        }
        
        const files = fs.readdirSync(dirPath);
        let markdownFiles = [];
        
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const relativeFilePath = relativePath ? path.join(relativePath, file) : file;
            const stat = fs.statSync(fullPath);
            
            if (stat.isFile() && file.endsWith('.md')) {
                // 是Markdown文件，添加到列表
                markdownFiles.push(relativeFilePath);
            } else if (stat.isDirectory()) {
                // 是目录，递归扫描
                const subFiles = scanMarkdownFiles(fullPath, relativeFilePath);
                markdownFiles = markdownFiles.concat(subFiles);
            }
        }
        
        return markdownFiles;
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
    const articleDetailsMap = {};
    
    console.log('开始扫描文章...\n');
    
    // 扫描每个分类
    for (const [categoryKey, categoryInfo] of Object.entries(SITE_CONFIG.categories)) {
        const categoryPath = path.join(__dirname, categoryKey);
        const markdownFiles = scanMarkdownFiles(categoryPath);
        
        console.log(`分类 "${categoryInfo.name}" (${categoryKey}): 找到 ${markdownFiles.length} 个文件`);
        
        articles[categoryKey] = [];
        
        for (const relativePath of markdownFiles) {
            const filePath = path.join(categoryPath, relativePath);
            const content = fs.readFileSync(filePath, 'utf-8');
            const title = extractTitleFromMarkdown(filePath);
            const preview = extractPreviewFromMarkdown(filePath);
            const updateTime = getFileModifiedTime(filePath);
            const wordCount = countWords(content);
            const readingTime = calculateReadingTime(wordCount);
            
            // 构建文章详情对象
            const articleDetails = {
                title: title,
                preview: preview,
                updateTime: updateTime,
                wordCount: wordCount,
                readingTime: readingTime,
                relativePath: relativePath // 添加相对路径信息
            };

            // 将文章详情保存到配置中
            const articlePath = `${categoryKey}/${relativePath}`;
            articles[categoryKey].push(relativePath);
            articleDetailsMap[articlePath] = articleDetails;

            // 构建用于排序的文章信息
            const articleInfo = {
                filename: relativePath,
                title: title,
                preview: preview,
                category: categoryKey,
                categoryName: categoryInfo.name,
                url: `article.html?category=${categoryKey}&file=${encodeURIComponent(relativePath)}`,
                updateTime: updateTime,
                wordCount: wordCount,
                readingTime: readingTime
            };
            
            allArticles.push(articleInfo);
            
            console.log(`  - ${title} (${relativePath}) - ${wordCount}字, ${readingTime}分钟`);
        }
        
        console.log('');
    }
    
    // 按更新时间排序
    for (const categoryKey of Object.keys(articles)) {
        articles[categoryKey].sort((a, b) => {
            const aTime = articleDetailsMap[`${categoryKey}/${a}`].updateTime;
            const bTime = articleDetailsMap[`${categoryKey}/${b}`].updateTime;
            return new Date(bTime) - new Date(aTime);
        });
    }
    
    allArticles.sort((a, b) => new Date(b.updateTime) - new Date(a.updateTime));
    
    return { 
        categories: SITE_CONFIG.categories,
        articleLists: articles,
        articleDetails: articleDetailsMap
    };
}

/**
 * 更新JavaScript配置文件
 */
function updateJavaScriptConfig(config) {
    // 生成配置文件内容
    const configContent = `
// 自动生成的配置文件 - 请勿手动编辑
// 生成时间: ${new Date().toISOString()}

window.SITE_DATA = ${JSON.stringify(config, null, 4)};
`;

    // 写入配置文件
    const configPath = path.join(__dirname, 'assets/js/config.js');
    fs.writeFileSync(configPath, configContent, 'utf-8');
    console.log('✅ 生成配置文件:', 'assets/js/config.js');
}

/**
 * 生成站点地图
 */
function generateSitemap(config) {
    const urls = [];
    
    // 添加首页
    urls.push('index.html');
    
    // 添加分类页面
    for (const categoryKey of Object.keys(config.categories)) {
        urls.push(`category.html?category=${categoryKey}`);
    }
    
    // 添加文章页面
    for (const [categoryKey, articleList] of Object.entries(config.articleLists)) {
        for (const filename of articleList) {
            urls.push(`article.html?category=${categoryKey}&file=${encodeURIComponent(filename)}`);
        }
    }
    
    // 写入站点地图
    const sitemapContent = urls.join('\n');
    fs.writeFileSync('sitemap.txt', sitemapContent, 'utf-8');
    console.log('✅ 生成站点地图:', 'sitemap.txt');
}

/**
 * 生成README文档
 */
function generateReadme(config) {
    const lines = [
        '# 我的博客',
        '',
        '这是一个使用纯静态HTML/CSS/JavaScript构建的个人博客系统。',
        '',
        '## 文章列表',
        ''
    ];
    
    // 添加分类和文章
    for (const [categoryKey, categoryInfo] of Object.entries(config.categories)) {
        lines.push(`### ${categoryInfo.name}`);
        lines.push('');
        
        const articleList = config.articleLists[categoryKey] || [];
        for (const filename of articleList) {
            const articlePath = `${categoryKey}/${filename}`;
            const article = config.articleDetails[articlePath];
            if (article) {
                const title = article.title.replace(/^#+\s*/, '');
                const updateTime = article.updateTime;
                const wordCount = article.wordCount;
                const readingTime = article.readingTime;
                lines.push(`- [${title}](${categoryKey}/${filename}) - ${updateTime} - ${wordCount}字 - ${readingTime}分钟`);
            }
        }
        lines.push('');
    }
    
    // 添加统计信息
    lines.push('## 统计信息');
    lines.push('');
    const totalArticles = Object.values(config.articleLists).reduce((sum, list) => sum + list.length, 0);
    lines.push(`- 分类数量: ${Object.keys(config.categories).length}`);
    lines.push(`- 文章总数: ${totalArticles}`);
    for (const [categoryKey, categoryInfo] of Object.entries(config.categories)) {
        const count = (config.articleLists[categoryKey] || []).length;
        lines.push(`- ${categoryInfo.name}: ${count} 篇`);
    }
    
    // 写入README
    fs.writeFileSync('README.md', lines.join('\n'), 'utf-8');
    console.log('✅ 生成README文档:', 'README.md');
}

/**
 * 主函数
 */
function main() {
    console.log('🔨 开始构建博客配置...\n');
    
    // 生成文章配置
    const config = generateArticleConfig();
    
    // 更新配置文件
    updateJavaScriptConfig(config);
    
    // 生成站点地图
    generateSitemap(config);
    
    // 生成README
    generateReadme(config);
    
    console.log('\n✅ 构建完成！');
    
    // 输出统计信息
    console.log('📊 统计信息:');
    console.log(`   - 分类数量: ${Object.keys(config.categories).length}`);
    const totalArticles = Object.values(config.articleLists).reduce((sum, list) => sum + list.length, 0);
    console.log(`   - 文章总数: ${totalArticles}`);
    for (const [categoryKey, categoryInfo] of Object.entries(config.categories)) {
        const count = (config.articleLists[categoryKey] || []).length;
        console.log(`   - ${categoryInfo.name}: ${count} 篇`);
    }
    
    console.log('\n🚀 现在可以部署到GitHub Pages了！');
}

// 运行构建
if (require.main === module) {
    main();
}

module.exports = { generateArticleConfig, updateJavaScriptConfig };
