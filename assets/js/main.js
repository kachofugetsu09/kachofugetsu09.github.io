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
 */
async function getAllArticles() {
    if (SITE_CONFIG.articlesCache) {
        return SITE_CONFIG.articlesCache;
    }

    const articles = {};
    
    // 遍历每个分类
    for (const [categoryKey, categoryInfo] of Object.entries(SITE_CONFIG.categories)) {
        articles[categoryKey] = [];
        
        // 获取文章列表
        const articleList = await getArticleListForCategory(categoryKey);
        
        for (const filename of articleList) {
            if (filename.endsWith('.md')) {
                const articleInfo = {
                    filename: filename,
                    title: filename.replace('.md', ''),
                    category: categoryKey,
                    categoryName: categoryInfo.name,
                    url: `article.html?category=${categoryKey}&file=${encodeURIComponent(filename)}`,
                    updateTime: '2025-06-06'
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
    if (!categoriesGrid) return; // 如果元素不存在，直接返回
    
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
        if (categoriesGrid) {
            categoriesGrid.innerHTML = `
                <div class="error-message">
                    <h3>加载失败</h3>
                    <p>无法加载分类信息，请稍后重试。</p>
                </div>
            `;
        }
    }
}

/**
 * 渲
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
    
    // 如果当前已有内容，先添加淡出效果
    if (dynamicContent.querySelector('.article-content')) {
        const currentContent = dynamicContent.querySelector('.article-content');
        currentContent.classList.add('fade-out');
        
        // 等待淡出动画完成
        await new Promise(resolve => setTimeout(resolve, 300));
    }
      
    // 显示加载状态，并添加淡入效果
    dynamicContent.innerHTML = '<div class="loading animate-fade-in">正在加载文章...</div>';
    dynamicContent.style.display = 'block';
    welcomeSection.style.display = 'none';
    
    // 重置动态内容容器的滚动位置
    dynamicContent.scrollTop = 0;
    
    try {
        // 获取文章内容
        const response = await fetch(`${category}/${filename}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        let markdownContent = await response.text();
        
        // 确保markdownContent是字符串
        if (typeof markdownContent !== 'string') {
            console.warn('markdownContent is not a string:', markdownContent);
            markdownContent = String(markdownContent || '');
        }
        
        // 初始化marked
        marked.use({
            mangle: false,
            headerIds: true,
            gfm: true,
            breaks: true
        });
        
        // 配置marked
        const renderer = {
            paragraph(text) {
                if (typeof text !== 'string') {
                    console.warn('Received non-string text:', text);
                    text = String(text || '');
                }
                // 保护数学公式
                text = text.replace(/\$\$([\s\S]*?)\$\$/g, function(match) {
                    return match.replace(/\n/g, ' ');
                });
                return `<p>${text}</p>`;
            },
            code(code, language) {
                if (language === 'mermaid') {
                    return `<div class="mermaid">${code}</div>`;
                }
                const validLanguage = language && hljs.getLanguage(language) ? language : '';
                try {
                    if (validLanguage) {
                        const highlighted = hljs.highlight(code, { language: validLanguage }).value;
                        return `<pre><code class="hljs language-${validLanguage}">${highlighted}</code></pre>`;
                    }
                    return `<pre><code class="hljs">${hljs.highlightAuto(code).value}</code></pre>`;
                } catch (err) {
                    console.warn('代码高亮失败:', err);
                    return `<pre><code class="hljs">${code}</code></pre>`;
                }
            }
        };
        
        marked.use({ renderer });
        
        // 解析Markdown
        console.log('开始解析Markdown');
        const htmlContent = marked.parse(markdownContent);
        console.log('Markdown解析完成');
        
        // 为HTML内容中的标题添加ID
        const processedHTML = addHeadingIds(htmlContent);
        
        // 获取文章标题
        const title = filename.replace('.md', '');
        const categoryInfo = window.SITE_DATA?.categories[category] || SITE_CONFIG.categories[category];
        
        // 尝试从SITE_DATA中获取文章的详细信息
        let updateTime = '未知时间';
        let wordCount = 0;
        let readingTime = 1;
        let articleDetail = null;

        if (window.SITE_DATA?.articleDetails) {
            const key = `${category}/${filename}`;
            articleDetail = window.SITE_DATA.articleDetails[key];
            if (articleDetail) {
                updateTime = articleDetail.updateTime || '未知时间';
                wordCount = articleDetail.wordCount || 0;
                readingTime = articleDetail.readingTime || 1;
            }
        }

        // 生成文章HTML
        const articleHTML = `
            <article class="article-content fade-in">
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
                        <span class="article-stats">
                            <i class="fas fa-book-reader"></i>
                            ${wordCount}字
                            <i class="fas fa-clock"></i>
                            预计阅读${readingTime}分钟
                        </span>
                    </div>
                    <h1 class="article-title">${title}</h1>
                </header>
                <div class="article-body">
                    ${processedHTML}
                </div>
            </article>
            
            <!-- Giscus 评论区 -->
            <div class="comments-section">
                <div class="comments-header">
                    <h3><i class="fas fa-comments"></i> 讨论区</h3>
                    <p class="comments-description">欢迎参与讨论，分享您的想法</p>
                </div>
                <div id="giscus-container"></div>
            </div>

        `;
        
        dynamicContent.innerHTML = articleHTML;
        
        // 语法高亮
        if (typeof hljs !== 'undefined') {
            dynamicContent.querySelectorAll('pre code').forEach((block) => {
                hljs.highlightElement(block);
            });
        }
        
        // 重新渲染数学公式
        if (typeof MathJax !== 'undefined' && MathJax.typesetPromise) {
            await MathJax.typesetPromise();
        }
        
        // 重新渲染Mermaid图表
        if (typeof mermaid !== 'undefined') {
            mermaid.init(undefined, document.querySelectorAll('.mermaid'));
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
        document.title = `${title} - 花月的技术博客`;
        
        // 添加代码行包装
        wrapCodeLines();
          // 初始化 Giscus 评论区
        initGiscusComments(category, filename);
        
        // 修复：确保每次加载新文章时滚动到页面顶部
        window.scrollTo(0, 0);
        
        // 添加延时，等待DOM完全更新后应用渐变效果
        setTimeout(() => {
            const articleContent = dynamicContent.querySelector('.article-content');
            if (articleContent) {
                articleContent.classList.add('visible');
            }
        }, 100);
        
    } catch (error) {
        console.error('加载文章失败:', error);
        dynamicContent.innerHTML = `
            <div class="error-message">
                <h3>加载失败</h3>
                <p>无法加载文章"${filename}"，请检查文件是否存在。</p>
                <p>错误信息: ${error.message}</p>
                <button onclick="window.location.href='index.html'" class="btn btn-primary">返回首页</button>
            </div>
        `;
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
    history.pushState({}, '花月的技术博客', url);
    
    // 重置页面标题
    document.title = '花月的技术博客';
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
        const renderer = new marked.Renderer();
        const originalParagraph = renderer.paragraph.bind(renderer);
        
        renderer.paragraph = function (text) {
            // 保护数学公式
            text = text.replace(/\$\$([\s\S]*?)\$\$/g, function(match) {
                return match.replace(/\n/g, ' ');
            });
            return originalParagraph(text);
        };
        
        marked.setOptions({
            renderer: renderer,
            highlight: function(code, lang) {
                if (typeof hljs !== 'undefined' && lang) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (err) {
                        console.warn('代码高亮失败:', err);
                        return hljs.highlightAuto(code).value;
                    }
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true,
            pedantic: false,
            mangle: false,
            headerIds: true
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
    
    // 添加代码行包装
    wrapCodeLines();
    
    // 初始化移动端交互
    initMobileInteractions();
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

// 处理代码块的行号显示
function wrapCodeLines() {
    document.querySelectorAll('pre code').forEach(block => {
        const code = block.innerHTML;
        const lines = code.split('\n');
        const wrappedLines = lines.map(line => 
            `<span>${line}</span>`
        ).join('\n');
        block.innerHTML = wrappedLines;
    });
}

/**
 * 移动端交互处理
 */
function initMobileInteractions() {
    // 创建菜单按钮
    const menuButton = document.createElement('button');
    menuButton.className = 'menu-toggle';
    menuButton.innerHTML = '<i class="fas fa-bars"></i>';
    document.body.appendChild(menuButton);

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    // 获取侧边栏
    const sidebar = document.querySelector('.sidebar');

    // 切换侧边栏显示/隐藏
    function toggleSidebar() {
        sidebar.classList.toggle('active');
        menuButton.classList.toggle('active');
        overlay.classList.toggle('active');
        
        if (sidebar.classList.contains('active')) {
            document.body.style.overflow = 'hidden';
            menuButton.innerHTML = '<i class="fas fa-times"></i>';
        } else {
            document.body.style.overflow = '';
            menuButton.innerHTML = '<i class="fas fa-bars"></i>';
        }
    }

    // 绑定事件
    menuButton.addEventListener('click', toggleSidebar);
    overlay.addEventListener('click', toggleSidebar);

    // 处理图片点击放大
    const articleImages = document.querySelectorAll('.article-body img');
    articleImages.forEach(img => {
        if (!img.closest('a')) { // 如果图片不在链接内
            img.classList.add('zoomable');
            img.addEventListener('click', function() {
                if (window.innerWidth <= 768) {
                    this.classList.toggle('zoomed');
                    if (this.classList.contains('zoomed')) {
                        document.body.style.overflow = 'hidden';
                    } else {
                        document.body.style.overflow = '';
                    }
                }
            });
        }
    });

    // 处理移动端滑动手势
    let touchStartX = 0;
    let touchEndX = 0;

    document.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
    }, false);

    document.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].clientX;
        handleSwipe();
    }, false);

    function handleSwipe() {
        const swipeDistance = touchEndX - touchStartX;
        const threshold = 100; // 最小滑动距离

        if (Math.abs(swipeDistance) > threshold) {
            if (swipeDistance > 0 && touchStartX < 50) {
                // 从左向右滑动，显示侧边栏
                if (!sidebar.classList.contains('active')) {
                    toggleSidebar();
                }
            } else if (swipeDistance < 0 && sidebar.classList.contains('active')) {
                // 从右向左滑动，隐藏侧边栏
                toggleSidebar();
            }
        }
    }
}

/**
 * 初始化 Giscus 评论系统
 * 基于 GitHub Discussions 的现代评论解决方案
 * @param {string} category 文章分类
 * @param {string} filename 文章文件名
 */
function initGiscusComments(category, filename) {
    console.log('开始初始化 Giscus 评论系统...', { category, filename });
    
    // 1. 检查评论容器是否存在
    const container = document.getElementById('giscus-container');
    if (!container) {
        console.log('Giscus 容器不存在，跳过初始化');
        return;
    }
    
    // 2. 清空容器内容
    container.innerHTML = '';
    
    // 3. 生成文章唯一标识符
    const articleId = `${category}/${filename}`;
    const articleTitle = `${filename.replace('.md', '')} - ${category}`;
    
    console.log('文章唯一标识:', articleId);
    console.log('文章标题:', articleTitle);
    
    // 4. 创建 Giscus 脚本元素
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo', 'kachofugetsu09/kachofugetsu09.github.io');
    script.setAttribute('data-repo-id', 'R_kgDOO3Q_2g');
    script.setAttribute('data-category', 'General');
    script.setAttribute('data-category-id', 'DIC_kwDOO3Q_2s4CrqTm');
    script.setAttribute('data-mapping', 'specific'); // 使用 specific 映射
    script.setAttribute('data-term', articleId); // 使用文章唯一标识作为 term
    script.setAttribute('data-strict', '0');
    script.setAttribute('data-reactions-enabled', '1');
    script.setAttribute('data-emit-metadata', '0');
    script.setAttribute('data-input-position', 'bottom');
    script.setAttribute('data-theme', 'light'); // 使用 light 主题匹配黑白简约风格
    script.setAttribute('data-lang', 'zh-CN');
    script.setAttribute('crossorigin', 'anonymous');
    script.async = true;
    
    // 5. 添加加载事件监听器
    script.onload = function() {
        console.log('Giscus 评论系统加载成功');
    };
    
    script.onerror = function() {
        console.error('Giscus 评论系统加载失败');
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; background: #f8f9fa; border-radius: 8px;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: #dc3545; margin-bottom: 15px;"></i>
                <h4 style="margin-bottom: 10px;">评论系统加载失败</h4>
                <p>请检查网络连接或稍后重试</p>
            </div>
        `;
    };
    
    // 6. 将脚本添加到容器中
    container.appendChild(script);
    
    console.log('Giscus 脚本已添加到页面，文章ID:', articleId);
}
