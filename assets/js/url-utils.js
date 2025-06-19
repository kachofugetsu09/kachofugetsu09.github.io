/**
 * URL工具函数
 */

// 获取当前环境的基础URL
const getBaseUrl = () => {
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        return `${window.location.protocol}//${window.location.host}`;
    } else {
        return 'https://kachofugetsu09.github.io';
    }
};

// 构建文章URL
const buildArticleUrl = (category, filename) => {
    const baseUrl = getBaseUrl();
    const queryParams = new URLSearchParams();
    queryParams.set('category', category);
    queryParams.set('file', filename);
    
    if (baseUrl.includes('localhost')) {
        return `${baseUrl}/index.html?${queryParams.toString()}`;
    } else {
        return `${baseUrl}/?${queryParams.toString()}`;
    }
};

// 从文件路径构建文章链接
const getArticleLink = (filePath) => {
    // 解析文件路径，例如 "tech/零拷贝技术解析.md" -> { category: "tech", filename: "零拷贝技术解析.md" }
    const pathParts = filePath.split('/');
    const category = pathParts[0];
    const filename = pathParts[1];
    
    return buildArticleUrl(category, filename);
};

// 处理文章点击事件
const handleArticleClick = (filePath, event) => {
    event.preventDefault();
    const articleUrl = getArticleLink(filePath);
    window.location.href = articleUrl;
};
