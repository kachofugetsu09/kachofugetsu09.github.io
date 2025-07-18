/**
 * 文章页面脚本
 * 加载并显示Markdown文章内容
 */

// 从URL获取参数
function getURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        category: urlParams.get('category'),
        file: urlParams.get('file')
    };
}

// 分类配置
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
 * 配置marked.js
 */
function configureMarked() {
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
            // 语言别名映射
            const langMap = {
                'java': 'java',
                'javascript': 'javascript', 
                'js': 'javascript',
                'python': 'python',
                'py': 'python',
                'cpp': 'cpp',
                'c++': 'cpp',
                'sql': 'sql',
                'html': 'xml',
                'xml': 'xml'
            };
            
            if (lang) {
                // 标准化语言名称
                const normalizedLang = langMap[lang.toLowerCase()] || lang.toLowerCase();
                try {
                    const result = hljs.highlight(code, { language: normalizedLang });
                    return result.value;
                } catch (err) {
                    console.warn(`代码高亮失败 (${lang}):`, err);
                    // 如果指定语言失败，尝试自动检测
                    try {
                        const autoResult = hljs.highlightAuto(code, ['java', 'javascript', 'python', 'cpp', 'sql']);
                        return autoResult.value;
                    } catch (autoErr) {
                        console.warn('自动检测高亮也失败:', autoErr);
                        return hljs.util.escapeHtml(code);
                    }
                }
            }
            // 没有指定语言时自动检测
            try {
                const autoResult = hljs.highlightAuto(code, ['java', 'javascript', 'python', 'cpp', 'sql']);
                return autoResult.value;
            } catch (err) {
                console.warn('自动检测高亮失败:', err);
                return hljs.util.escapeHtml(code);
            }
        },
        breaks: true,
        gfm: true,
        pedantic: false,
        mangle: false,
        headerIds: true
    });
}

/**
 * 加载并渲染文章
 */
async function loadAndRenderArticle() {
    const { category, file } = getURLParams();
    const articleBody = document.getElementById('articleBody');
    const articleTitle = document.getElementById('articleTitleHeader');
    const articleTitlePage = document.getElementById('articleTitle');
    const categoryTag = document.getElementById('categoryTag');
    const categoryName = document.getElementById('categoryName');
    const categoryLink = document.getElementById('categoryLink');
    const updateTime = document.getElementById('updateTime');
    
    if (!category || !file) {
        articleBody.innerHTML = `
            <div class="error-message">
                <h3>参数错误</h3>
                <p>缺少必要的URL参数。</p>
            </div>
        `;
        return;
    }
    
    // 使用构建脚本生成的配置或备用配置
    const categories = (window.SITE_DATA && window.SITE_DATA.categories) || SITE_CONFIG.categories;
    const categoryInfo = categories[category];
    
    if (!categoryInfo) {
        articleBody.innerHTML = `
            <div class="error-message">
                <h3>分类不存在</h3>
                <p>指定的分类不存在。</p>
            </div>
        `;
        return;
    }
    
    // 设置页面标题和分类信息
    let title = file.replace('.md', '');
    let updateTimeText = '更新于 2025-06-06';
    
    // 从构建配置获取更准确的信息
    if (window.SITE_DATA && window.SITE_DATA.articleDetails) {
        const key = `${category}/${file}`;
        const articleDetail = window.SITE_DATA.articleDetails[key];
        if (articleDetail) {
            title = articleDetail.title;
            updateTimeText = `更新于 ${articleDetail.updateTime}`;
        }
    }
    
    articleTitle.textContent = title;
    articleTitlePage.textContent = title;
    categoryTag.textContent = categoryInfo.name;
    categoryName.textContent = categoryInfo.name;
    categoryLink.href = `category.html?category=${category}`;
    updateTime.textContent = updateTimeText;
    
    // 显示加载状态
    articleBody.innerHTML = '<div class="loading">加载文章中...</div>';
    
    try {
        // 加载文章内容
        const response = await fetch(`${category}/${file}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const markdownContent = await response.text();
        
        // 配置marked
        configureMarked();
        
        // 转换Markdown为HTML
        const htmlContent = marked.parse(markdownContent);        // 渲染到页面
        articleBody.innerHTML = htmlContent;
        
        // 确保文章内容从顶部显示
        articleBody.scrollTop = 0;
        window.scrollTo(0, 0);
        
        // 重新应用代码高亮
        if (typeof hljs !== 'undefined') {
            articleBody.querySelectorAll('pre code').forEach((block) => {
                // 清除之前的高亮
                block.removeAttribute('data-highlighted');
                
                // 尝试从父元素获取语言信息
                const pre = block.parentElement;
                const className = block.className || '';
                let language = '';
                
                // 从class中提取语言
                const langMatch = className.match(/language-(\w+)/);
                if (langMatch) {
                    language = langMatch[1];
                    // 设置语言属性以便CSS识别
                    block.setAttribute('data-language', language);
                }
                
                // 应用highlight.js高亮
                try {
                    if (language) {
                        const result = hljs.highlight(block.textContent, { language: language });
                        block.innerHTML = result.value;
                    } else {
                        hljs.highlightElement(block);
                    }
                } catch (err) {
                    console.warn('代码高亮失败:', err);
                    hljs.highlightElement(block);
                }
            });
        }
        
        // 处理图片懒加载
        articleBody.querySelectorAll('img').forEach((img) => {
            img.loading = 'lazy';
            img.onerror = function() {
                this.style.display = 'none';
                console.warn('图片加载失败:', this.src);
            };
        });
        
        // 添加锚点链接到标题
        addAnchorLinksToHeadings();
        
    } catch (error) {
        console.error('加载文章失败:', error);
        articleBody.innerHTML = `
            <div class="error-message">
                <h3>加载失败</h3>
                <p>无法加载文章内容: ${error.message}</p>
                <p>请检查文件是否存在或稍后重试。</p>
            </div>
        `;
    }
}

/**
 * 为标题添加锚点链接并生成目录
 */
function addAnchorLinksToHeadings() {
    const headings = document.querySelectorAll('.article-body h1, .article-body h2, .article-body h3, .article-body h4, .article-body h5, .article-body h6');
    const tocList = document.getElementById('tocList');
    const tocItems = [];
    
    if (headings.length === 0) {
        // 如果没有标题，显示空状态提示
        if (tocList) {
            tocList.innerHTML = '<div class="toc-empty">本文没有目录</div>';
        }
        return;
    }
    
    headings.forEach((heading, index) => {
        const id = `heading-${index}`;
        const level = parseInt(heading.tagName.substring(1), 10);
        const text = heading.textContent;
        
        // 设置ID用于锚点链接
        heading.id = id;
        
        // 创建锚点链接
        const anchorLink = document.createElement('a');
        anchorLink.href = `#${id}`;
        anchorLink.className = 'anchor-link';
        anchorLink.innerHTML = '<i class="fas fa-link"></i>';
        anchorLink.style.cssText = `
            margin-left: 10px;
            opacity: 0;
            transition: opacity 0.3s;
            text-decoration: none;
            color: #667eea;
            font-size: 0.8em;
        `;
        
        heading.appendChild(anchorLink);
        
        heading.addEventListener('mouseenter', () => {
            anchorLink.style.opacity = '1';
        });
        
        heading.addEventListener('mouseleave', () => {
            anchorLink.style.opacity = '0';
        });
        
        // 将标题添加到目录列表
        if (tocList) {
            const tocItem = document.createElement('li');
            tocItem.className = 'toc-item';
            
            const tocLink = document.createElement('a');
            tocLink.href = `#${id}`;
            tocLink.className = 'toc-link';
            tocLink.setAttribute('data-level', level);
            tocLink.textContent = text;
            
            tocItem.appendChild(tocLink);
            tocList.appendChild(tocItem);
            tocItems.push({ element: tocLink, id });
        }
    });
    
    // 添加滚动监听以高亮当前目录项
    if (tocItems.length > 0) {
        window.addEventListener('scroll', () => {
            const scrollPosition = window.scrollY;
            
            // 找出当前可见的标题
            const visibleHeadings = Array.from(headings).filter(heading => {
                const rect = heading.getBoundingClientRect();
                return rect.top <= 150 && rect.bottom >= 0;
            });
            
            // 高亮当前目录项
            if (visibleHeadings.length > 0) {
                const currentHeading = visibleHeadings[0];
                tocItems.forEach(item => {
                    if (item.id === currentHeading.id) {
                        item.element.classList.add('active');
                    } else {
                        item.element.classList.remove('active');
                    }
                });
            }
        });
    }
}

/**
 * 平滑滚动到锚点
 */
function handleAnchorLinks() {
    document.addEventListener('click', function(e) {
        if (e.target.closest('a[href^="#"]')) {
            e.preventDefault();
            const target = document.querySelector(e.target.closest('a').getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // 更新URL
                history.pushState(null, null, e.target.closest('a').getAttribute('href'));
            }
        }
    });
}

/**
 * 渲染侧边栏分类列表
 */
function renderSidebarCategories() {
    const sidebarContainer = document.getElementById('sidebarCategories');
    if (!sidebarContainer) return;
    
    const categories = window.SITE_DATA?.categories || SITE_CONFIG.categories;
    const currentParams = getURLParams();
    
    sidebarContainer.innerHTML = Object.entries(categories).map(([key, category]) => `
        <li class="sidebar-category">
            <a href="category.html?category=${key}" ${key === currentParams.category ? 'style="color: #ccc;"' : ''}>
                ${category.name}
                <span class="sidebar-category-count">${window.SITE_DATA?.articleLists?.[key]?.length || 0}</span>
            </a>
        </li>
    `).join('');
}

/**
 * 页面加载完成后初始化
 */
document.addEventListener('DOMContentLoaded', function() {
    // 配置marked
    configureMarked();
    
    // 初始化highlight.js
    if (typeof hljs !== 'undefined') {
        hljs.configure({
            languages: ['java', 'javascript', 'python', 'cpp', 'sql', 'html', 'css']
        });
    }
    
    // 确保页面从顶部开始显示
    window.scrollTo(0, 0);
    
    loadAndRenderArticle();
    handleAnchorLinks();
    renderSidebarCategories();
    
    // 处理页面刷新时的锚点定位
    if (window.location.hash) {
        setTimeout(() => {
            const target = document.querySelector(window.location.hash);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }, 500);
    }
});
