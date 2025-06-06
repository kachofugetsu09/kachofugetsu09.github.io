const SITE_CONFIG = {
    // 分类配置
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
    },
    // 文章元数据缓存
    articlesCache: null
};


/**
 * 获取所有文章的元数据
 * 扫描各个分类文件夹，获取文章信息
 */
async function getAllArticles() {
    if (SITE_CONFIG.articlesCache) {
        return SITE_CONFIG.articlesCache;
    }

    const articles = {};
    
    // 遍历每个分类
    for (const [categoryKey, categoryInfo] of Object.entries(SITE_CONFIG.categories)) {
        articles[categoryKey] = [];
        
        // 这里我们需要预定义文章列表，因为静态网站无法动态读取文件系统
        // 实际部署时，可以通过构建脚本自动生成这个列表
        const articleList = await getArticleListForCategory(categoryKey);
        
        for (const filename of articleList) {
            if (filename.endsWith('.md')) {
                const articleInfo = {
                    filename: filename,
                    title: filename.replace('.md', ''),
                    category: categoryKey,
                    categoryName: categoryInfo.name,
                    url: `article.html?category=${categoryKey}&file=${encodeURIComponent(filename)}`,
                    updateTime: '2025-06-06' // 实际项目中可以从文件系统或Git获取
                };
                articles[categoryKey].push(articleInfo);
            }
        }
    }
    
    SITE_CONFIG.articlesCache = articles;
    return articles;
}

/**
 * 获取特定分类的文章列表
 * 使用构建脚本生成的配置数据
 */
async function getArticleListForCategory(category) {
    // 使用构建脚本生成的配置
    if (window.SITE_DATA && window.SITE_DATA.articleLists) {
        return window.SITE_DATA.articleLists[category] || [];
    }
    
    // 备用配置（如果config.js未加载）
    const fallbackLists = {
        'tech': ['计算机网络.md'],
        'interview': ['redis 2025.5.29.md', '牛客 2025.6.2.md', '牛客2025.5.30.md']
    };
    
    return fallbackLists[category] || [];
}

/**
 * 渲染分类卡片
 */
async function renderCategories() {
    const categoriesGrid = document.getElementById('categoriesGrid');
    
    // 使用构建脚本生成的配置或备用配置
    const categories = (window.SITE_DATA && window.SITE_DATA.categories) || SITE_CONFIG.categories;
    const articles = await getAllArticles();
    
    categoriesGrid.innerHTML = '<div class="loading">加载分类中...</div>';
    
    try {
        let categoriesHTML = '';
        
        for (const [categoryKey, categoryInfo] of Object.entries(categories)) {
            const articleCount = articles[categoryKey] ? articles[categoryKey].length : 0;
            
            categoriesHTML += `
                <a href="category.html?category=${categoryKey}" class="category-card">
                    <i class="${categoryInfo.icon} category-icon"></i>
                    <h3 class="category-title">${categoryInfo.name}</h3>
                    <p class="category-description">${categoryInfo.description}</p>
                    <span class="category-count">${articleCount} 篇文章</span>
                </a>
            `;
        }
        
        categoriesGrid.innerHTML = categoriesHTML;
    } catch (error) {
        console.error('渲染分类失败:', error);
        categoriesGrid.innerHTML = `
            <div class="error-message">
                <h3>加载失败</h3>
                <p>无法加载分类信息，请稍后重试。</p>
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
    
    const categories = window.SITE_DATA?.categories || {};
    const articleLists = window.SITE_DATA?.articleLists || {};
    
    // 首页导航项
    const homeNavHTML = `
        <li class="sidebar-home">
            <div class="sidebar-home-link" onclick="showHomePage()">
                <i class="fas fa-home sidebar-home-icon"></i>
                <span class="sidebar-home-name">首页</span>
            </div>
        </li>
    `;
    
    const categoriesHTML = Object.entries(categories).map(([key, category]) => {
        const articles = articleLists[key] || [];
        const articleListHTML = articles.map(article => {
            const title = article.replace('.md', '');
            return `
                <li class="sidebar-article">
                    <a href="#" onclick="loadArticle('${key}', '${article}'); return false;">
                        ${title}
                    </a>
                </li>
            `;
        }).join('');
          return `
            <li class="sidebar-category">
                <div class="sidebar-category-header" onclick="toggleCategory('${key}')" id="header-${key}">
                    <i class="${category.icon || 'fas fa-folder'} sidebar-category-icon"></i>
                    <span class="sidebar-category-name">${category.name}</span>
                    <i class="fas fa-chevron-right sidebar-category-arrow" id="arrow-${key}"></i>
                </div>
                <ul class="sidebar-articles" id="articles-${key}">
                    ${articleListHTML}
                </ul>
            </li>
        `;
    }).join('');
    
    sidebarContainer.innerHTML = homeNavHTML + categoriesHTML;
}

/**
 * 切换分类展开/折叠状态
 */
function toggleCategory(categoryKey) {
    const articlesContainer = document.getElementById(`articles-${categoryKey}`);
    const arrow = document.getElementById(`arrow-${categoryKey}`);
    const header = document.getElementById(`header-${categoryKey}`);
    
    if (!articlesContainer || !arrow || !header) return;
    
    // 切换展开状态
    const isExpanded = articlesContainer.classList.contains('expanded');
    
    if (isExpanded) {
        // 折叠
        articlesContainer.classList.remove('expanded');
        header.classList.remove('expanded');
        arrow.classList.remove('fa-chevron-down');
        arrow.classList.add('fa-chevron-right');
    } else {
        // 展开
        articlesContainer.classList.add('expanded');
        header.classList.add('expanded');
        arrow.classList.remove('fa-chevron-right');
        arrow.classList.add('fa-chevron-down');
    }
}

/**
 * 加载并显示文章内容
 */
async function loadArticle(category, filename) {
    const welcomeSection = document.getElementById('welcomeSection');
    const dynamicContent = document.getElementById('dynamicContent');
    
    // 显示加载状态
    dynamicContent.innerHTML = '<div class="loading">正在加载文章...</div>';
    dynamicContent.style.display = 'block';
    welcomeSection.style.display = 'none';
    
    // 滚动到顶部
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
    
    try {
        // 获取文章内容
        const articlePath = `${category}/${filename}`;
        const response = await fetch(articlePath);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const markdownContent = await response.text();
        
        // 解析Markdown
        const htmlContent = marked.parse(markdownContent);
        
        // 为HTML内容中的标题添加ID
        const processedHTML = addHeadingIds(htmlContent);
        
        // 获取文章标题
        const title = filename.replace('.md', '');
        const categoryInfo = window.SITE_DATA?.categories[category] || SITE_CONFIG.categories[category];
        
        // 尝试从SITE_DATA中获取文章的实际更新时间
        let updateTime = '未知时间';
        if (window.SITE_DATA?.articles?.[category]) {
            const articleDetail = window.SITE_DATA.articles[category].find(a => a.filename === filename);
            if (articleDetail && articleDetail.updateTime) {
                updateTime = articleDetail.updateTime;
            }
        }
        
        // 生成文章HTML
        const articleHTML = `
            <article class="article-content">
                <header class="article-header">
                    <div class="article-meta">
                        <span class="article-category">
                            <i class="${categoryInfo?.icon || 'fas fa-folder'}"></i>
                            ${categoryInfo?.name || category}
                        </span>
                        <span class="article-date">
                            <i class="fas fa-calendar"></i>
                            ${updateTime}
                        </span>
                    </div>
                    <h1 class="article-title">${title}</h1>
                </header>
                <div class="article-body">
                    ${processedHTML}
                </div>
            </article>
        `;
        
        dynamicContent.innerHTML = articleHTML;
        
        // 语法高亮
        if (typeof hljs !== 'undefined') {
            dynamicContent.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
        
        // 生成并显示TOC
        generateTOCFromDOM();
        showTOC();
        
        // 更新浏览器历史
        const url = new URL(window.location);
        url.searchParams.set('category', category);
        url.searchParams.set('file', filename);
        history.pushState({ category, filename }, title, url);
        
        // 更新页面标题
        document.title = `${title} - 我的技术博客`;
        
    } catch (error) {
        console.error('加载文章失败:', error);
        dynamicContent.innerHTML = `
            <div class="error-message">
                <h3>加载失败</h3>
                <p>无法加载文章"${filename}"，请检查文件是否存在。</p>
                <button onclick="showHomePage()" class="btn btn-primary">返回首页</button>
            </div>
        `;
        hideTOC();
    }
}

/**
 * 显示首页
 */
function showHomePage() {
    const welcomeSection = document.getElementById('welcomeSection');
    const dynamicContent = document.getElementById('dynamicContent');
    
    welcomeSection.style.display = 'block';
    dynamicContent.style.display = 'none';
    
    // 隐藏TOC并清理事件监听器
    hideTOC();
    cleanupTOC();
    
    // 更新浏览器历史
    const url = new URL(window.location);
    url.search = '';
    history.pushState({}, '我的技术博客', url);
    
    // 重置页面标题
    document.title = '我的技术博客';
}

/**
 * 处理浏览器前进/后退
 */
window.addEventListener('popstate', function(event) {
    if (event.state && event.state.category && event.state.filename) {
        loadArticle(event.state.category, event.state.filename);
    } else {
        showHomePage();
    }
});

/**
 * 页面加载完成后初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    // 初始化Marked配置
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            highlight: function(code, lang) {
                if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return code;
            },
            breaks: true,
            gfm: true
        });
    }
    
    renderCategories();
    renderSidebarCategories();
    
    // 检查URL参数，如果有文章参数则直接加载
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category');
    const filename = urlParams.get('file');
    
    if (category && filename) {
        loadArticle(category, filename);
    }
});

/**
 * 获取文章预览内容（从Markdown文件的前几行提取）
 */
function getArticlePreview(content, maxLength = 150) {
    // 移除Markdown标记
    const plainText = content
        .replace(/^#+ /gm, '') // 移除标题标记
        .replace(/\*\*(.*?)\*\*/g, '$1') // 移除粗体标记
        .replace(/\*(.*?)\*/g, '$1') // 移除斜体标记
        .replace(/`(.*?)`/g, '$1') // 移除代码标记
        .replace(/^\s*[-*+]\s+/gm, '') // 移除列表标记
        .replace(/^\s*\d+\.\s+/gm, '') // 秼除有序列表标记
        .replace(/\n+/g, ' ') // 将换行符替换为空格
        .trim();
    
    return plainText.length > maxLength 
        ? plainText.substring(0, maxLength) + '...'
        : plainText;
}

// ====== TOC (Table of Contents) 功能 ======

/**
 * 为HTML内容中的标题添加ID
 * @param {string} htmlContent - 已解析的HTML内容
 * @returns {string} - 处理后的HTML内容
 */
function addHeadingIds(htmlContent) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const headingIds = new Set();
    
    headings.forEach((heading, index) => {
        const text = heading.textContent.trim();
        
        // 生成唯一的ID
        let id = text
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5\s-]/g, '') // 保留中文、英文、数字、空格和连字符
            .replace(/\s+/g, '-') // 空格替换为连字符
            .replace(/-+/g, '-') // 多个连字符合并为一个
            .replace(/^-|-$/g, ''); // 移除首尾连字符
        
        // 确保ID唯一
        if (!id) id = `heading-${index}`;
        let uniqueId = id;
        let counter = 1;
        while (headingIds.has(uniqueId)) {
            uniqueId = `${id}-${counter}`;
            counter++;
        }
        headingIds.add(uniqueId);
        
        // 为标题添加ID
        heading.id = uniqueId;
    });
    
    return tempDiv.innerHTML;
}

/**
 * 从DOM中的标题生成TOC
 */
function generateTOCFromDOM() {
    const tocList = document.getElementById('tocList');
    const headings = document.querySelectorAll('.article-body h1[id], .article-body h2[id], .article-body h3[id], .article-body h4[id], .article-body h5[id], .article-body h6[id]');
    
    if (headings.length === 0) {
        tocList.innerHTML = '<li class="toc-empty">此文章暂无目录</li>';
        return;
    }
    
    let tocHTML = '';
    
    headings.forEach(heading => {
        const level = parseInt(heading.tagName.charAt(1)); // 获取标题级别 (1-6)
        const text = heading.textContent.trim();
        const id = heading.id;
        
        // 生成TOC链接
        tocHTML += `
            <li class="toc-item">
                <a href="#${id}" 
                   class="toc-link" 
                   data-level="${level}"
                   onclick="scrollToHeading('${id}'); return false;">
                    ${text}
                </a>
            </li>
        `;
    });
    
    tocList.innerHTML = tocHTML;
    
    // 初始化滚动监听
    initTOCScrollSpy();
}

/**
 * 显示TOC侧边栏
 */
function showTOC() {
    const tocSidebar = document.querySelector('.toc-container');
    if (tocSidebar) {
        tocSidebar.style.display = 'block';
    }
}

/**
 * 隐藏TOC侧边栏
 */
function hideTOC() {
    const tocSidebar = document.querySelector('.toc-container');
    if (tocSidebar) {
        tocSidebar.style.display = 'none';
    }
}

/**
 * 滚动到指定标题
 * @param {string} headingId - 标题的ID
 */
function scrollToHeading(headingId) {
    const targetElement = document.getElementById(headingId);
    if (targetElement) {
        // 计算目标位置：让标题位于视口30%的位置
        const elementRect = targetElement.getBoundingClientRect();
        const absoluteElementTop = elementRect.top + window.pageYOffset;
        const targetPosition = absoluteElementTop - (window.innerHeight * 0.3) + (elementRect.height / 2);
        
        // 平滑滚动到目标位置
        window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
        });
        
        // 更新TOC中的活跃状态
        setTimeout(() => {
            updateActiveTOCLink(headingId);
        }, 100);
    }
}

/**
 * 更新TOC中的活跃链接
 * @param {string} activeId - 当前活跃的标题ID
 */
function updateActiveTOCLink(activeId) {
    // 移除所有活跃状态
    document.querySelectorAll('.toc-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // 添加当前活跃状态
    const activeLink = document.querySelector(`a[href="#${activeId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

/**
 * 初始化TOC滚动监听（自动高亮当前章节）
 */
function initTOCScrollSpy() {
    // 防抖函数
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }    // 滚动处理函数
    const handleScroll = debounce(() => {
        const headings = document.querySelectorAll('.article-body h1[id], .article-body h2[id], .article-body h3[id], .article-body h4[id], .article-body h5[id], .article-body h6[id]');
        
        if (headings.length === 0) return;
        
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const viewportHeight = window.innerHeight;
        const documentHeight = document.documentElement.scrollHeight;
          // 定义视口中央区域 (视口的中间30%区域)
        const viewportCenter = viewportHeight * 0.3;
        const centerThreshold = viewportHeight * 0.15; // 中央区域的阈值
        
        // 如果滚动到页面底部，高亮最后一个标题
        if (scrollTop + viewportHeight >= documentHeight - 50) {
            const lastHeading = headings[headings.length - 1];
            updateActiveTOCLink(lastHeading.id);
            return;
        }
        
        let currentHeading = null;
        let bestScore = -1;
        
        // 找到最适合高亮的标题（基于在视口中央区域的位置）
        headings.forEach(heading => {
            const rect = heading.getBoundingClientRect();
            
            // 如果标题完全不在视口内，跳过
            if (rect.bottom < 0 || rect.top > viewportHeight) {
                return;
            }
            
            // 计算标题在视口中的位置分数
            let score = 0;
            
            // 如果标题在视口中央区域内，给予高分
            if (rect.top <= viewportCenter + centerThreshold && rect.bottom >= viewportCenter - centerThreshold) {
                // 标题在中央区域，计算距离中心的距离（越近分数越高）
                const headingCenter = (rect.top + rect.bottom) / 2;
                const distanceFromCenter = Math.abs(headingCenter - viewportCenter);
                score = 1000 - distanceFromCenter; // 距离中心越近分数越高
            } 
            // 如果标题在视口上半部分
            else if (rect.top < viewportCenter && rect.bottom > 0) {
                // 给予中等分数，越靠近中心分数越高
                score = 500 - rect.top;
            }
            // 如果标题在视口下半部分
            else if (rect.top < viewportHeight && rect.bottom > viewportCenter) {
                // 给予较低分数
                score = 300 - (rect.top - viewportCenter);
            }
            
            // 选择分数最高的标题
            if (score > bestScore) {
                bestScore = score;
                currentHeading = heading;
            }
        });
        
        // 如果没有找到合适的标题，使用第一个可见的标题
        if (!currentHeading) {
            for (const heading of headings) {
                const rect = heading.getBoundingClientRect();
                if (rect.top >= 0 && rect.top <= viewportHeight) {
                    currentHeading = heading;
                    break;
                }
            }
        }
        
        // 如果还是没有找到，使用第一个标题
        if (!currentHeading && headings.length > 0) {
            currentHeading = headings[0];
        }
        
        // 更新活跃状态
        if (currentHeading) {
            updateActiveTOCLink(currentHeading.id);
        }
    }, 50);
    
    // 移除之前的监听器（避免重复绑定）
    window.removeEventListener('scroll', window.tocScrollHandler);
    
    // 添加新的监听器
    window.tocScrollHandler = handleScroll;
    window.addEventListener('scroll', handleScroll);
    
    // 初始化时执行一次
    handleScroll();
}

/**
 * 清理TOC相关的事件监听器
 */
function cleanupTOC() {
    if (window.tocScrollHandler) {
        window.removeEventListener('scroll', window.tocScrollHandler);
        window.tocScrollHandler = null;
    }
}
