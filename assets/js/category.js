/**
 * 分类页面脚本
 * 显示特定分类下的所有文章
 */

// 从URL获取分类参数
function getCategoryFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('category');
}

// 从main.js导入配置
const SITE_CONFIG = {
    categories: {
        'tech': {
            name: '技术分享',
            description: '技术学习笔记和经验分享',
            icon: 'fas fa-laptop-code',
            color: '#667eea'
        },
        'interview': {
            name: '面试笔记',
            description: '面试笔记',
            icon: 'fas fa-briefcase',
            color: '#764ba2'
        }
    }
};

/**
 * 获取特定分类的文章列表
 */
async function getArticleListForCategory(category) {
    // 使用构建脚本生成的配置
    if (window.SITE_DATA && window.SITE_DATA.articleLists) {
        return window.SITE_DATA.articleLists[category] || [];
    }
    
    // 备用配置
    const fallbackLists = {
        'tech': ['计算机网络.md'],
        'interview': ['redis 2025.5.29.md', '牛客 2025.6.2.md', '牛客2025.5.30.md']
    };
    
    return fallbackLists[category] || [];
}

/**
 * 加载文章内容预览
 */
async function loadArticlePreview(category, filename) {
    // 首先尝试从构建配置中获取预览
    if (window.SITE_DATA && window.SITE_DATA.articleDetails) {
        const key = `${category}/${filename}`;
        const articleDetail = window.SITE_DATA.articleDetails[key];
        if (articleDetail && articleDetail.preview) {
            return articleDetail.preview;
        }
    }
    
    // 如果配置中没有，尝试加载文件内容
    try {
        const response = await fetch(`${category}/${filename}`);
        if (response.ok) {
            const content = await response.text();
            return getArticlePreview(content, 150);
        }
    } catch (error) {
        console.warn(`无法加载文章预览: ${filename}`, error);
    }
    return '暂无预览...';
}

/**
 * 获取文章预览内容
 */
function getArticlePreview(content, maxLength = 150) {
    const plainText = content
        .replace(/^#+ /gm, '')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/^\s*\d+\.\s+/gm, '')
        .replace(/\n+/g, ' ')
        .trim();
    
    return plainText.length > maxLength 
        ? plainText.substring(0, maxLength) + '...'
        : plainText;
}

/**
 * 渲染文章列表
 */
async function renderArticles() {
    const category = getCategoryFromURL();
    const articlesGrid = document.getElementById('articlesGrid');
    const categoryTitle = document.getElementById('categoryTitle');
    const pageTitle = document.getElementById('pageTitle');
    
    // 使用构建脚本生成的配置或备用配置
    const categories = (window.SITE_DATA && window.SITE_DATA.categories) || SITE_CONFIG.categories;
    
    if (!category || !categories[category]) {
        articlesGrid.innerHTML = `
            <div class="error-message">
                <h3>分类不存在</h3>
                <p>请检查URL是否正确。</p>
            </div>
        `;
        return;
    }
    
    const categoryInfo = categories[category];
    categoryTitle.textContent = categoryInfo.name;
    pageTitle.textContent = categoryInfo.name;
    
    articlesGrid.innerHTML = '<div class="loading">加载文章中...</div>';
    
    try {
        const articleList = await getArticleListForCategory(category);
        
        if (articleList.length === 0) {
            articlesGrid.innerHTML = `
                <div class="error-message">
                    <h3>暂无文章</h3>
                    <p>该分类下还没有文章。</p>
                </div>
            `;
            return;
        }
        
        let articlesHTML = '';
        
        for (const filename of articleList) {
            if (filename.endsWith('.md')) {
                // 优先从构建配置获取标题和更新时间
                let title = filename.replace('.md', '');
                let updateTime = '2025-06-06';
                
                if (window.SITE_DATA && window.SITE_DATA.articleDetails) {
                    const key = `${category}/${filename}`;
                    const articleDetail = window.SITE_DATA.articleDetails[key];
                    if (articleDetail) {
                        title = articleDetail.title;
                        updateTime = articleDetail.updateTime;
                    }
                }
                
                const preview = await loadArticlePreview(category, filename);
                const articleUrl = `article.html?category=${category}&file=${encodeURIComponent(filename)}`;
                
                articlesHTML += `
                    <a href="${articleUrl}" class="article-card">
                        <h3 class="article-title">${title}</h3>
                        <p class="article-preview">${preview}</p>
                        <div class="article-meta">
                            <span class="category-tag">${categoryInfo.name}</span>
                            <span class="update-time">${updateTime}</span>
                        </div>
                    </a>
                `;
            }
        }
        
        articlesGrid.innerHTML = articlesHTML;
        
    } catch (error) {
        console.error('渲染文章失败:', error);
        articlesGrid.innerHTML = `
            <div class="error-message">
                <h3>加载失败</h3>
                <p>无法加载文章列表，请稍后重试。</p>
            </div>
        `;
    }
}

/**
 * 渲染侧边栏分类列表（可展开式）
 */
function renderSidebarCategories() {
    const sidebarContainer = document.getElementById('sidebarCategories');
    if (!sidebarContainer) return;
    
    const categories = window.SITE_DATA?.categories || SITE_CONFIG.categories;
    const articleLists = window.SITE_DATA?.articleLists || {};
    const currentCategory = getCategoryFromURL();
    
    sidebarContainer.innerHTML = Object.entries(categories).map(([key, category]) => {
        const articles = articleLists[key] || [];
        const articleListHTML = articles.map(article => {
            const title = article.replace('.md', '');
            return `
                <li class="sidebar-article">
                    <a href="article.html?category=${key}&file=${encodeURIComponent(article)}">
                        ${title}
                    </a>
                </li>
            `;
        }).join('');
        
        return `
            <li class="sidebar-category">
                <div class="sidebar-category-header" onclick="toggleCategory('${key}')">
                    <span class="sidebar-category-name">${category.name}</span>
                    <div class="sidebar-category-meta">
                        <span class="sidebar-category-count">${articles.length}</span>
                        <i class="fas fa-chevron-down sidebar-category-arrow" id="arrow-${key}"></i>
                    </div>
                </div>
                <ul class="sidebar-articles" id="articles-${key}" style="display: ${key === currentCategory ? 'block' : 'none'};">
                    ${articleListHTML}
                </ul>
            </li>
        `;
    }).join('');
    
    // 如果当前页面是某个分类，自动展开该分类
    if (currentCategory) {
        setTimeout(() => {
            const arrow = document.getElementById(`arrow-${currentCategory}`);
            if (arrow) {
                arrow.classList.remove('fa-chevron-down');
                arrow.classList.add('fa-chevron-up');
            }
        }, 100);
    }
}

/**
 * 切换分类展开/折叠状态
 */
function toggleCategory(categoryKey) {
    const articlesContainer = document.getElementById(`articles-${categoryKey}`);
    const arrow = document.getElementById(`arrow-${categoryKey}`);
    
    if (articlesContainer.style.display === 'none') {
        articlesContainer.style.display = 'block';
        arrow.classList.remove('fa-chevron-down');
        arrow.classList.add('fa-chevron-up');
    } else {
        articlesContainer.style.display = 'none';
        arrow.classList.remove('fa-chevron-up');
        arrow.classList.add('fa-chevron-down');
    }
}

/**
 * 页面加载完成后初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    renderArticles();
    renderSidebarCategories();
});
