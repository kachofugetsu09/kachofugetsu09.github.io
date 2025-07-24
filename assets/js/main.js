// 延迟加载配置
window.lazyLoadConfig = window.lazyLoadConfig || {
  marked: false,
  highlight: false,
  mermaid: false,
  mathjax: false,
};

// 异步加载函数
function loadScript(src, callback) {
  const script = document.createElement("script");
  script.src = src;
  script.onload = callback;
  script.onerror = () => console.warn("Failed to load:", src);
  document.head.appendChild(script);
}

// 按需加载Markdown解析器
function loadMarkdownParser() {
  if (window.lazyLoadConfig.marked) return Promise.resolve();

  return new Promise((resolve) => {
    loadScript(
      "https://cdn.jsdelivr.net/npm/marked@12.0.0/lib/marked.umd.min.js",
      () => {
        window.lazyLoadConfig.marked = true;
        resolve();
      }
    );
  });
}

// 按需加载语法高亮
function loadHighlighter() {
  if (window.lazyLoadConfig.highlight) return Promise.resolve();

  return new Promise((resolve) => {
    loadScript(
      "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js",
      () => {
        window.lazyLoadConfig.highlight = true;
        resolve();
      }
    );
  });
}

// 按需加载Mermaid
function loadMermaid() {
  if (window.lazyLoadConfig.mermaid) return Promise.resolve();

  return new Promise((resolve) => {
    loadScript(
      "https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js",
      () => {
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          flowchart: {
            useMaxWidth: true,
            htmlLabels: true,
          },
        });
        window.lazyLoadConfig.mermaid = true;
        resolve();
      }
    );
  });
}

// 按需加载MathJax
function loadMathJax() {
  if (window.lazyLoadConfig.mathjax) return Promise.resolve();

  return new Promise((resolve) => {
    window.MathJax = {
      tex: {
        inlineMath: [
          ["$", "$"],
          ["\\(", "\\)"],
        ],
        displayMath: [
          ["$$", "$$"],
          ["\\[", "\\]"],
        ],
        processEscapes: true,
      },
      svg: {
        fontCache: "global",
      },
      startup: {
        typeset: false,
      },
    };

    loadScript(
      "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js",
      () => {
        window.lazyLoadConfig.mathjax = true;
        resolve();
      }
    );
  });
}

/**
 * 获取所有文章的元数据
 */
async function getAllArticles() {
  if (SITE_CONFIG.articlesCache) {
    return SITE_CONFIG.articlesCache;
  }

  const articles = {};

  // 遍历每个分类
  for (const [categoryKey, categoryInfo] of Object.entries(
    SITE_CONFIG.categories
  )) {
    articles[categoryKey] = [];

    // 获取文章列表
    const articleList = await getArticleListForCategory(categoryKey);

    for (const filename of articleList) {
      if (filename.endsWith(".md")) {
        const articleInfo = {
          filename: filename,
          title: filename.replace(".md", ""),
          category: categoryKey,
          categoryName: categoryInfo.name,
          url: `article.html?category=${categoryKey}&file=${encodeURIComponent(
            filename
          )}`,
          updateTime: "2025-06-06",
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
    tech: ["计算机网络.md"],
    interview: ["redis 2025.5.29.md", "牛客 2025.6.2.md", "牛客2025.5.30.md"],
  };

  return fallbackLists[category] || [];
}

/**
 * 渲染分类卡片
 */
async function renderCategories() {
  const categoriesGrid = document.getElementById("categoriesGrid");
  if (!categoriesGrid) return; // 如果元素不存在，直接返回

  const categories =
    (window.SITE_DATA && window.SITE_DATA.categories) || SITE_CONFIG.categories;
  const articles = await getAllArticles();

  categoriesGrid.innerHTML = '<div class="loading">加载分类中...</div>';

  try {
    let categoriesHTML = "";

    for (const [categoryKey, categoryInfo] of Object.entries(categories)) {
      const articleCount = articles[categoryKey]
        ? articles[categoryKey].length
        : 0;

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
    console.error("渲染分类失败:", error);
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
 * 构建层级文件结构
 */
function buildHierarchicalStructure(articles) {
  const structure = {};

  articles.forEach((article) => {
    const parts = article.split("/");

    if (parts.length === 1) {
      // 根级文件，不处理
      return;
    }

    let current = structure;

    // 构建文件夹层级
    for (let i = 0; i < parts.length - 1; i++) {
      const folder = parts[i];
      if (!current[folder]) {
        current[folder] = { type: "folder", children: {}, files: [] };
      }
      current = current[folder];
      if (!current.children) current.children = {};
      if (!current.files) current.files = [];
    }

    // 添加文件到最后一级文件夹
    const filename = parts[parts.length - 1];
    current.files.push(filename);
  });

  return structure;
}

/**
 * 渲染层级文件结构
 */
function renderHierarchicalArticles(structure, categoryKey, level = 0) {
  let html = "";

  // 渲染文件夹
  Object.entries(structure).forEach(([name, item]) => {
    if (item.type === "folder") {
      const folderId = `folder-${categoryKey}-${name}-${level}`;
      const indent = "  ".repeat(level);

      html += `
                <li class="sidebar-folder" style="margin-left: ${
                  level * 15
                }px;">
                    <div class="sidebar-folder-header" onclick="toggleFolder('${folderId}')" id="header-${folderId}">
                        <i class="fas fa-folder sidebar-folder-icon"></i>
                        <span class="sidebar-folder-name">${name}</span>
                        <i class="fas fa-chevron-right sidebar-folder-arrow" id="arrow-${folderId}"></i>
                    </div>
                    <ul class="sidebar-folder-contents" id="contents-${folderId}">
                        ${renderHierarchicalArticles(
                          item.children,
                          categoryKey,
                          level + 1
                        )}
                        ${
                          item.files
                            ? item.files
                                .map((file) => {
                                  const title = file.replace(".md", "");
                                  const fullPath = getFullPath(
                                    structure,
                                    name,
                                    file
                                  );
                                  return `
                                <li class="sidebar-article" style="margin-left: ${
                                  (level + 1) * 15
                                }px;">
                                    <a href="#" onclick="loadArticle('${categoryKey}', '${fullPath}'); return false;">
                                        <i class="fas fa-file-alt sidebar-file-icon"></i>
                                        ${title}
                                    </a>
                                </li>
                            `;
                                })
                                .join("")
                            : ""
                        }
                    </ul>
                </li>
            `;
    }
  });

  return html;
}

/**
 * 获取文件的完整路径
 */
function getFullPath(structure, folderName, filename) {
  // 这里需要重新构建完整路径
  // 简化处理：直接从原始数据中查找
  const articles = window.SITE_DATA?.articleLists || {};
  for (const [categoryKey, articleList] of Object.entries(articles)) {
    for (const article of articleList) {
      if (article.endsWith(filename) && article.includes(folderName)) {
        return article;
      }
    }
  }
  return filename;
}

/**
 * 渲染侧边栏分类（支持层级结构）
 */
function renderSidebarCategories() {
  const sidebarContainer = document.getElementById("sidebarCategories");
  if (!sidebarContainer) return;

  const categories = window.SITE_DATA?.categories || {};
  const articleLists = window.SITE_DATA?.articleLists || {};

  // 首页导航项
  const homeNavHTML = `
        <li class="sidebar-home">
            <div class="sidebar-home-link" onclick="goToHome()">
                <i class="fas fa-home sidebar-home-icon"></i>
                <span class="sidebar-home-name">首页</span>
            </div>
        </li>
        <li class="sidebar-home">
            <div class="sidebar-home-link" onclick="showArchivePage()">
                <i class="fas fa-archive sidebar-home-icon"></i>
                <span class="sidebar-home-name">文章归档</span>
            </div>
        </li>
    `;

  const categoriesHTML = Object.entries(categories)
    .map(([key, category]) => {
      const articles = articleLists[key] || [];

      // 分离根级文件和文件夹中的文件
      const rootFiles = articles.filter((article) => !article.includes("/"));
      const folderFiles = articles.filter((article) => article.includes("/"));

      // 构建层级结构
      const hierarchicalStructure = buildHierarchicalStructure(folderFiles);

      // 渲染根级文件
      const rootFilesHTML = rootFiles
        .map((article) => {
          const title = article.replace(".md", "");
          return `
                <li class="sidebar-article">
                    <a href="#" onclick="loadArticle('${key}', '${article}'); return false;">
                        <i class="fas fa-file-alt sidebar-file-icon"></i>
                        ${title}
                    </a>
                </li>
            `;
        })
        .join("");

      // 渲染文件夹结构
      const foldersHTML = Object.entries(hierarchicalStructure)
        .map(([folderName, folderData]) => {
          const folderId = `folder-${key}-${folderName}`;
          const folderFilesHTML = folderData.files
            .map((file) => {
              const title = file.replace(".md", "");
              const fullPath = `${folderName}/${file}`;
              return `
                    <li class="sidebar-article">
                        <a href="#" onclick="loadArticle('${key}', '${fullPath}'); return false;">
                            <i class="fas fa-file-alt sidebar-file-icon"></i>
                            ${title}
                        </a>
                    </li>
                `;
            })
            .join("");

          return `
                <li class="sidebar-folder">
                    <div class="sidebar-folder-header" onclick="toggleFolder('${folderId}')" id="header-${folderId}">
                        <i class="fas fa-folder sidebar-folder-icon"></i>
                        <span class="sidebar-folder-name">${folderName}</span>
                        <i class="fas fa-chevron-right sidebar-folder-arrow" id="arrow-${folderId}"></i>
                    </div>
                    <ul class="sidebar-folder-contents" id="contents-${folderId}">
                        ${folderFilesHTML}
                    </ul>
                </li>
            `;
        })
        .join("");

      return `
            <li class="sidebar-category">
                <div class="sidebar-category-header" onclick="handleCategoryClick('${key}')" id="header-${key}">
                    <i class="${
                      category.icon || "fas fa-folder"
                    } sidebar-category-icon"></i>
                    <span class="sidebar-category-name">${category.name}</span>
                    <i class="fas fa-chevron-right sidebar-category-arrow" id="arrow-${key}"></i>
                </div>
                <ul class="sidebar-articles" id="articles-${key}">
                    ${rootFilesHTML}
                    ${foldersHTML}
                </ul>
            </li>
        `;
    })
    .join("");

  sidebarContainer.innerHTML = homeNavHTML + categoriesHTML;
}

/**
 * 处理分类点击 - 统一的交互逻辑
 * 展开侧边栏并在右侧显示分类页面内容
 */
function handleCategoryClick(categoryKey) {
  // 1. 展开侧边栏
  toggleCategory(categoryKey);

  // 2. 在右侧显示分类页面内容
  showCategoryPage(categoryKey);
}

/**
 * 在右侧显示分类页面内容
 */
function showCategoryPage(categoryKey) {
  const welcomeSection = document.getElementById("welcomeSection");
  const dynamicContent = document.getElementById("dynamicContent");

  if (!dynamicContent) return;

  // 隐藏欢迎区域，显示动态内容
  if (welcomeSection) {
    welcomeSection.style.display = "none";
  }
  dynamicContent.style.display = "block";

  // 隐藏TOC
  hideTOC();

  try {
    const categories = window.SITE_DATA?.categories || {};
    const articleLists = window.SITE_DATA?.articleLists || {};
    const articleDetails = window.SITE_DATA?.articleDetails || {};

    const categoryInfo = categories[categoryKey];
    const articles = articleLists[categoryKey] || [];

    if (!categoryInfo) {
      dynamicContent.innerHTML = `
        <div class="error-message">
          <h3>分类不存在</h3>
          <p>未找到分类"${categoryKey}"</p>
          <button onclick="showHomePage()" class="btn btn-primary">返回首页</button>
        </div>
      `;
      return;
    }

    // 更新页面标题
    document.title = `${categoryInfo.name} - 花月的技术博客`;

    // 生成分类页面HTML
    let categoryHTML = `
      <section class="category-section">
        <header class="category-header">
          <div class="category-title-wrapper">
            <h1 class="category-title">
              <i class="${categoryInfo.icon || "fas fa-folder"}"></i>
              ${categoryInfo.name}
            </h1>
            <div class="category-stats">
              <span class="stat-badge">
                <i class="fas fa-file-alt"></i>
                ${articles.length} 篇文章
              </span>
            </div>
          </div>
          <p class="category-description">探索${
            categoryInfo.name
          }相关的技术文章和学习笔记</p>
        </header>

        <div class="category-articles">
    `;

    if (articles.length === 0) {
      categoryHTML += `
        <div class="category-empty">
          <i class="fas fa-inbox"></i>
          <h3>暂无文章</h3>
          <p>这个分类下还没有文章</p>
        </div>
      `;
    } else {
      articles.forEach((filename) => {
        const articleKey = `${categoryKey}/${filename}`;
        const detail = articleDetails[articleKey];

        // 安全处理文本，避免特殊字符导致的问题
        const title = (detail?.title || filename.replace(".md", ""))
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        const preview = (detail?.preview || "")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

        const updateTime = detail?.updateTime || "未知时间";
        const wordCount = detail?.wordCount || 0;
        const readingTime = detail?.readingTime || 1;

        categoryHTML += `
          <article class="category-article-card" onclick="loadArticle('${categoryKey}', '${filename}')">
            <div class="article-card-content">
              <div class="article-header">
                <h3 class="article-title">
                  ${title}
                </h3>
                <div class="article-arrow">
                  <i class="fas fa-chevron-right"></i>
                </div>
              </div>
              
              ${
                preview
                  ? `
                <p class="article-preview">
                  ${preview.substring(0, 150)}${
                      preview.length > 150 ? "..." : ""
                    }
                </p>
              `
                  : ""
              }
              
              <div class="article-meta">
                <span class="article-date">
                  <i class="fas fa-calendar"></i>
                  ${updateTime}
                </span>
                <span class="article-stats">
                  <i class="fas fa-book-reader"></i>
                  ${wordCount}字
                  <i class="fas fa-clock"></i>
                  ${readingTime}分钟
                </span>
              </div>
            </div>
          </article>
        `;
      });
    }

    categoryHTML += `
        </div>
      </section>
    `;

    dynamicContent.innerHTML = categoryHTML;

    // 更新浏览器历史
    const url = new URL(window.location);
    url.searchParams.set("category", categoryKey);
    url.searchParams.delete("file");
    history.pushState({ category: categoryKey }, categoryInfo.name, url);
  } catch (error) {
    console.error("渲染分类页面失败:", error);
    dynamicContent.innerHTML = `
      <div class="error-message">
        <h3>加载失败</h3>
        <p>无法加载分类信息，请稍后重试。</p>
        <button onclick="showHomePage()" class="btn btn-primary">返回首页</button>
      </div>
    `;
  }
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
  const isExpanded = articlesContainer.classList.contains("expanded");

  if (isExpanded) {
    // 折叠 - 先移除expanded类，让CSS动画处理
    articlesContainer.classList.remove("expanded");
    header.classList.remove("expanded");
    arrow.classList.remove("fa-chevron-down");
    arrow.classList.add("fa-chevron-right");

    // 延迟隐藏，等待动画完成
    setTimeout(() => {
      if (!articlesContainer.classList.contains("expanded")) {
        articlesContainer.style.display = "none";
      }
    }, 200);
  } else {
    // 展开 - 先显示，然后添加expanded类
    articlesContainer.style.display = "block";
    // 强制重绘，确保display:block生效
    articlesContainer.offsetHeight;

    articlesContainer.classList.add("expanded");
    header.classList.add("expanded");
    arrow.classList.remove("fa-chevron-right");
    arrow.classList.add("fa-chevron-down");
  }
}

/**
 * 切换文件夹展开/折叠状态
 */
function toggleFolder(folderId) {
  const folderContents = document.getElementById(`contents-${folderId}`);
  const arrow = document.getElementById(`arrow-${folderId}`);
  const header = document.getElementById(`header-${folderId}`);

  if (!folderContents || !arrow || !header) return;

  // 切换展开状态
  const isExpanded = folderContents.classList.contains("expanded");

  if (isExpanded) {
    // 折叠 - 先移除expanded类，让CSS动画处理
    folderContents.classList.remove("expanded");
    header.classList.remove("expanded");
    arrow.classList.remove("fa-chevron-down");
    arrow.classList.add("fa-chevron-right");

    // 延迟隐藏，等待动画完成
    setTimeout(() => {
      if (!folderContents.classList.contains("expanded")) {
        folderContents.style.display = "none";
      }
    }, 200);
  } else {
    // 展开 - 先显示，然后添加expanded类
    folderContents.style.display = "block";
    // 强制重绘，确保display:block生效
    folderContents.offsetHeight;

    folderContents.classList.add("expanded");
    header.classList.add("expanded");
    arrow.classList.remove("fa-chevron-right");
    arrow.classList.add("fa-chevron-down");
  }
}

/**
 * 加载并显示文章内容
 */
async function loadArticle(category, filename) {
  const welcomeSection = document.getElementById("welcomeSection");
  const dynamicContent = document.getElementById("dynamicContent");

  // 如果当前已有内容，先添加淡出效果
  if (dynamicContent && dynamicContent.querySelector(".article-content")) {
    const currentContent = dynamicContent.querySelector(".article-content");
    currentContent.classList.add("fade-out");

    // 等待淡出动画完成
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // 显示加载状态，并添加淡入效果
  if (dynamicContent) {
    dynamicContent.innerHTML =
      '<div class="loading animate-fade-in">正在加载文章...</div>';
    dynamicContent.style.display = "block";
  }

  // 只有在首页才隐藏welcomeSection
  if (welcomeSection) {
    welcomeSection.style.display = "none";
  }

  // 重置动态内容容器的滚动位置
  if (dynamicContent) {
    dynamicContent.scrollTop = 0;
  }

  try {
    console.log("开始加载文章:", category, filename);
    console.log("请求URL:", `${category}/${filename}`);

    // 并行加载文章内容和必要的库
    const [response] = await Promise.all([
      fetch(`${category}/${filename}`),
      loadMarkdownParser(),
      loadHighlighter(),
    ]);

    console.log("响应状态:", response.status, response.ok);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    let markdownContent = await response.text();

    // 确保markdownContent是字符串
    if (typeof markdownContent !== "string") {
      console.warn("markdownContent is not a string:", markdownContent);
      markdownContent = String(markdownContent || "");
    }

    // 检查是否需要加载额外的库
    const needsMermaid = markdownContent.includes("```mermaid");
    const needsMathJax = /\$\$[\s\S]*?\$\$|\$[^$\n]*\$/.test(markdownContent);

    // 按需加载额外库
    const additionalLoads = [];
    if (needsMermaid) additionalLoads.push(loadMermaid());
    if (needsMathJax) additionalLoads.push(loadMathJax());

    if (additionalLoads.length > 0) {
      await Promise.all(additionalLoads);
    }

    // 初始化marked
    marked.use({
      mangle: false,
      headerIds: true,
      gfm: true,
      breaks: true,
    });

    // 配置marked
    const renderer = {
      paragraph(text) {
        if (typeof text !== "string") {
          console.warn("Received non-string text:", text);
          text = String(text || "");
        }
        // 保护数学公式
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, function (match) {
          return match.replace(/\n/g, " ");
        });
        return `<p>${text}</p>`;
      },
      code(code, language) {
        if (language === "mermaid") {
          return `<div class="mermaid">${code}</div>`;
        }
        if (typeof hljs !== "undefined") {
          const validLanguage =
            language && hljs.getLanguage(language) ? language : "";
          try {
            if (validLanguage) {
              const highlighted = hljs.highlight(code, {
                language: validLanguage,
              }).value;
              return `<pre><code class="hljs language-${validLanguage}">${highlighted}</code></pre>`;
            }
            return `<pre><code class="hljs">${
              hljs.highlightAuto(code).value
            }</code></pre>`;
          } catch (err) {
            console.warn("代码高亮失败:", err);
            return `<pre><code class="hljs">${code}</code></pre>`;
          }
        }
        return `<pre><code>${code}</code></pre>`;
      },
    };

    marked.use({ renderer });

    // 解析Markdown
    console.log("开始解析Markdown");
    const htmlContent = marked.parse(markdownContent);
    console.log("Markdown解析完成");

    // 为HTML内容中的标题添加ID
    const processedHTML = addHeadingIds(htmlContent);

    // 获取文章标题
    const title = filename.replace(".md", "");
    const categoryInfo =
      window.SITE_DATA?.categories[category] ||
      SITE_CONFIG.categories[category];

    // 尝试从SITE_DATA中获取文章的详细信息
    let updateTime = "未知时间";
    let wordCount = 0;
    let readingTime = 1;
    let articleDetail = null;

    if (window.SITE_DATA?.articleDetails) {
      const key = `${category}/${filename}`;
      articleDetail = window.SITE_DATA.articleDetails[key];
      if (articleDetail) {
        updateTime = articleDetail.updateTime || "未知时间";
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
                            <i class="${
                              categoryInfo?.icon || "fas fa-folder"
                            }"></i>
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
    if (typeof hljs !== "undefined") {
      dynamicContent.querySelectorAll("pre code").forEach((block) => {
        hljs.highlightElement(block);
      });
    }

    // 重新渲染数学公式
    if (typeof MathJax !== "undefined" && MathJax.typesetPromise) {
      await MathJax.typesetPromise();
    }

    // 重新渲染Mermaid图表
    if (typeof mermaid !== "undefined") {
      mermaid.init(undefined, document.querySelectorAll(".mermaid"));
    }

    // 生成并显示TOC
    generateTOCFromDOM();
    showTOC();

    // 更新sidebar中的当前文章状态
    updateSidebarActiveState(category, filename);

    // 移动端自动收起sidebar
    if (window.innerWidth <= 768) {
      const sidebar = document.querySelector(".sidebar");
      const overlay = document.querySelector(".sidebar-overlay");
      const menuToggle = document.querySelector(".menu-toggle");

      if (sidebar) {
        sidebar.classList.remove("active");
      }
      if (overlay) {
        overlay.classList.remove("active");
      }
      if (menuToggle) {
        menuToggle.classList.remove("active");
      }
    }

    // 更新浏览器历史
    const url = new URL(window.location);
    url.searchParams.set("category", category);
    url.searchParams.set("file", filename);
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
      const articleContent = dynamicContent.querySelector(".article-content");
      if (articleContent) {
        articleContent.classList.add("visible");
      }
    }, 100);
  } catch (error) {
    console.error("加载文章失败:", error);
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
 * 跳转到首页 - 统一的导航函数
 */
function goToHome() {
  showHomePage();
}

/**
 * 显示首页
 */
function showHomePage() {
  const welcomeSection = document.getElementById("welcomeSection");
  const dynamicContent = document.getElementById("dynamicContent");

  // 检查当前是否在index.html页面
  if (welcomeSection && dynamicContent) {
    // 在index.html页面，显示欢迎区域
    welcomeSection.style.display = "block";
    dynamicContent.style.display = "none";

    // 隐藏TOC并清理事件监听器
    hideTOC();
    cleanupTOC();

    // 收起所有展开的侧边栏分类
    collapseAllCategories();

    // 更新浏览器历史
    const url = new URL(window.location);
    url.search = "";
    history.pushState({}, "花月的技术博客", url);

    // 重置页面标题
    document.title = "花月的技术博客";
  } else {
    // 在其他页面（如article.html），直接跳转到首页
    try {
      // 获取当前页面的基础URL
      const baseUrl =
        window.location.origin +
        window.location.pathname.replace(/[^/]*\.html$/, "");
      const homeUrl = baseUrl + "index.html";

      // 跳转到首页
      window.location.assign(homeUrl);
    } catch (error) {
      console.warn("跳转首页失败，使用备用方法:", error);
      // 备用跳转方法
      window.location.href = "index.html";
    }
  }
}

/**
 * 收起所有展开的侧边栏分类
 */
function collapseAllCategories() {
  const categories = window.SITE_DATA?.categories || {};

  Object.keys(categories).forEach((categoryKey) => {
    const articlesContainer = document.getElementById(
      `articles-${categoryKey}`
    );
    const arrow = document.getElementById(`arrow-${categoryKey}`);
    const header = document.getElementById(`header-${categoryKey}`);

    if (articlesContainer && arrow && header) {
      // 如果当前是展开状态，则折叠
      if (articlesContainer.classList.contains("expanded")) {
        articlesContainer.classList.remove("expanded");
        header.classList.remove("expanded");
        arrow.classList.remove("fa-chevron-down");
        arrow.classList.add("fa-chevron-right");

        // 延迟隐藏，等待动画完成
        setTimeout(() => {
          if (!articlesContainer.classList.contains("expanded")) {
            articlesContainer.style.display = "none";
          }
        }, 200);
      }
    }
  });

  // 同时收起所有文件夹
  document
    .querySelectorAll('[id^="contents-folder-"]')
    .forEach((folderContents) => {
      const folderId = folderContents.id.replace("contents-", "");
      const arrow = document.getElementById(`arrow-${folderId}`);
      const header = document.getElementById(`header-${folderId}`);

      if (folderContents.classList.contains("expanded")) {
        folderContents.classList.remove("expanded");
        if (header) header.classList.remove("expanded");
        if (arrow) {
          arrow.classList.remove("fa-chevron-down");
          arrow.classList.add("fa-chevron-right");
        }

        setTimeout(() => {
          if (!folderContents.classList.contains("expanded")) {
            folderContents.style.display = "none";
          }
        }, 200);
      }
    });
}

/**
 * 处理浏览器前进/后退
 */
window.addEventListener("popstate", function (event) {
  if (event.state && event.state.category && event.state.filename) {
    loadArticle(event.state.category, event.state.filename);
  } else {
    showHomePage();
  }
});

/**
 * 页面加载完成后初始化
 */
document.addEventListener("DOMContentLoaded", function () {
  // 初始化Marked配置
  if (typeof marked !== "undefined") {
    const renderer = new marked.Renderer();
    const originalParagraph = renderer.paragraph.bind(renderer);

    renderer.paragraph = function (text) {
      // 保护数学公式
      text = text.replace(/\$\$([\s\S]*?)\$\$/g, function (match) {
        return match.replace(/\n/g, " ");
      });
      return originalParagraph(text);
    };

    marked.setOptions({
      renderer: renderer,
      highlight: function (code, lang) {
        if (typeof hljs !== "undefined" && lang) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (err) {
            console.warn("代码高亮失败:", err);
            return hljs.highlightAuto(code).value;
          }
        }
        return hljs.highlightAuto(code).value;
      },
      breaks: true,
      gfm: true,
      pedantic: false,
      mangle: false,
      headerIds: true,
    });
  }

  renderCategories();
  renderSidebarCategories();

  // 检查URL参数，根据参数显示对应内容
  const urlParams = new URLSearchParams(window.location.search);
  const page = urlParams.get("page");
  const category = urlParams.get("category");
  const filename = urlParams.get("file");

  if (category && filename) {
    // 加载文章
    loadArticle(category, filename);
  } else if (page === "archive") {
    // 显示归档页面
    showArchivePage();
  } else if (category) {
    // 显示分类页面
    showCategoryPage(category);
  } else {
    // 显示首页，确保TOC隐藏
    hideTOC();
  }

  // 添加代码行包装
  wrapCodeLines();

  // 初始化移动端交互
  initMobileInteractions();

  // 初始化首页导航
  initHomeNavigation();
});

/**
 * 更新sidebar中的当前文章状态
 * @param {string} category - 分类名称
 * @param {string} filename - 文件名
 */
function updateSidebarActiveState(category, filename) {
  // 移除所有文章的活跃状态
  document.querySelectorAll(".sidebar-article a").forEach((link) => {
    link.classList.remove("active");
  });

  // 确保对应分类展开
  const categoryKey = category;
  const articlesContainer = document.getElementById(`articles-${categoryKey}`);
  const categoryHeader = document.getElementById(`header-${categoryKey}`);
  const arrow = document.getElementById(`arrow-${categoryKey}`);

  if (articlesContainer && categoryHeader) {
    // 展开分类
    articlesContainer.style.display = "block";
    articlesContainer.classList.add("expanded");
    categoryHeader.classList.add("expanded");
    if (arrow) {
      arrow.classList.remove("fa-chevron-right");
      arrow.classList.add("fa-chevron-down");
    }

    // 如果文件在子文件夹中，需要展开所有父级文件夹
    if (filename.includes("/")) {
      const pathParts = filename.split("/");
      
      // 逐级展开文件夹 - 只处理第一级文件夹（当前实现只支持一级子文件夹）
      if (pathParts.length >= 2) {
        const folderName = pathParts[0];
        const folderId = `folder-${categoryKey}-${folderName}`;
        const folderContents = document.getElementById(`contents-${folderId}`);
        const folderArrow = document.getElementById(`arrow-${folderId}`);
        const folderHeader = document.getElementById(`header-${folderId}`);

        if (folderContents && folderArrow && folderHeader) {
          // 展开文件夹
          folderContents.style.display = "block";
          folderContents.classList.add("expanded");
          folderHeader.classList.add("expanded");
          folderArrow.classList.remove("fa-chevron-right");
          folderArrow.classList.add("fa-chevron-down");
        }
      }
    }

    // 高亮当前文章
    const currentArticleLink = document.querySelector(
      `a[onclick*="${category}"][onclick*="${filename}"]`
    );
    if (currentArticleLink) {
      currentArticleLink.classList.add("active");

      // 滚动sidebar到当前文章位置
      setTimeout(() => {
        currentArticleLink.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 300);
    }
  }
}

/**
 * 初始化首页导航
 */
function initHomeNavigation() {
  // 为logo和标题添加点击事件，返回首页
  const logo = document.querySelector(".site-logo");
  const title = document.querySelector(".site-title");

  if (logo) {
    logo.style.cursor = "pointer";
    logo.addEventListener("click", function () {
      goToHome();
    });
  }

  if (title) {
    title.style.cursor = "pointer";
    title.addEventListener("click", function () {
      goToHome();
    });
  }
}

/**
 * 获取文章预览内容（从Markdown文件的前几行提取）
 */
function getArticlePreview(content, maxLength = 150) {
  // 移除Markdown标记
  const plainText = content
    .replace(/^#+ /gm, "") // 移除标题标记
    .replace(/\*\*(.*?)\*\*/g, "$1") // 移除粗体标记
    .replace(/\*(.*?)\*/g, "$1") // 移除斜体标记
    .replace(/`(.*?)`/g, "$1") // 移除代码标记
    .replace(/^\s*[-*+]\s+/gm, "") // 移除列表标记
    .replace(/^\s*\d+\.\s+/gm, "") // 秼除有序列表标记
    .replace(/\n+/g, " ") // 将换行符替换为空格
    .trim();

  return plainText.length > maxLength
    ? plainText.substring(0, maxLength) + "..."
    : plainText;
}

// ====== TOC (Table of Contents) 功能 ======

/**
 * 为HTML内容中的标题添加ID
 * @param {string} htmlContent - 已解析的HTML内容
 * @returns {string} - 处理后的HTML内容
 */
function addHeadingIds(htmlContent) {
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = htmlContent;

  const headings = tempDiv.querySelectorAll("h1, h2, h3, h4, h5, h6");
  const headingIds = new Set();

  headings.forEach((heading, index) => {
    const text = heading.textContent.trim();

    // 生成唯一的ID
    let id = text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s-]/g, "") // 保留中文、英文、数字、空格和连字符
      .replace(/\s+/g, "-") // 空格替换为连字符
      .replace(/-+/g, "-") // 多个连字符合并为一个
      .replace(/^-|-$/g, ""); // 移除首尾连字符

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
  const tocList = document.getElementById("tocList");
  const headings = document.querySelectorAll(
    ".article-body h1[id], .article-body h2[id], .article-body h3[id], .article-body h4[id], .article-body h5[id], .article-body h6[id]"
  );

  if (headings.length === 0) {
    tocList.innerHTML = '<li class="toc-empty">此文章暂无目录</li>';
    return;
  }

  let tocHTML = "";

  headings.forEach((heading) => {
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
  const tocSidebar = document.querySelector(".toc-container");
  if (tocSidebar) {
    tocSidebar.classList.add("show");
  }
}

/**
 * 隐藏TOC侧边栏
 */
function hideTOC() {
  const tocSidebar = document.querySelector(".toc-container");
  if (tocSidebar) {
    tocSidebar.style.display = "none";
    // 清空TOC内容
    const tocList = document.getElementById("tocList");
    if (tocList) {
      tocList.innerHTML = "";
    }
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
    const targetPosition =
      absoluteElementTop - window.innerHeight * 0.3 + elementRect.height / 2;

    // 平滑滚动到目标位置
    window.scrollTo({
      top: targetPosition,
      behavior: "smooth",
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
  document.querySelectorAll(".toc-link").forEach((link) => {
    link.classList.remove("active");
  });

  // 添加当前活跃状态
  const activeLink = document.querySelector(`a[href="#${activeId}"]`);
  if (activeLink) {
    activeLink.classList.add("active");

    // 自动滚动TOC到当前激活的项目
    scrollTOCToActiveItem(activeLink);
  }
}

/**
 * 滚动TOC到当前激活的项目
 * @param {Element} activeLink - 当前激活的TOC链接元素
 */
function scrollTOCToActiveItem(activeLink) {
  const tocContainer = document.querySelector(".toc-container");
  const tocNav = document.querySelector(".toc-nav");

  if (!tocContainer || !tocNav || !activeLink) {
    return;
  }

  // 获取TOC容器和激活项目的位置信息
  const containerRect = tocNav.getBoundingClientRect();
  const activeRect = activeLink.getBoundingClientRect();

  // 计算激活项目相对于TOC容器的位置
  const relativeTop = activeRect.top - containerRect.top + tocNav.scrollTop;
  const containerHeight = tocNav.clientHeight;
  const itemHeight = activeRect.height;

  // 计算目标滚动位置（让激活项目显示在TOC容器的中间）
  const targetScrollTop = relativeTop - containerHeight / 2 + itemHeight / 2;

  // 平滑滚动到目标位置
  tocNav.scrollTo({
    top: Math.max(0, targetScrollTop),
    behavior: "smooth",
  });
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
  } // 滚动处理函数
  const handleScroll = debounce(() => {
    const headings = document.querySelectorAll(
      ".article-body h1[id], .article-body h2[id], .article-body h3[id], .article-body h4[id], .article-body h5[id], .article-body h6[id]"
    );

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
    headings.forEach((heading) => {
      const rect = heading.getBoundingClientRect();

      // 如果标题完全不在视口内，跳过
      if (rect.bottom < 0 || rect.top > viewportHeight) {
        return;
      }

      // 计算标题在视口中的位置分数
      let score = 0;

      // 如果标题在视口中央区域内，给予高分
      if (
        rect.top <= viewportCenter + centerThreshold &&
        rect.bottom >= viewportCenter - centerThreshold
      ) {
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
  window.removeEventListener("scroll", window.tocScrollHandler);

  // 添加新的监听器
  window.tocScrollHandler = handleScroll;
  window.addEventListener("scroll", handleScroll);

  // 初始化时执行一次
  handleScroll();
}

/**
 * 清理TOC相关的事件监听器
 */
function cleanupTOC() {
  if (window.tocScrollHandler) {
    window.removeEventListener("scroll", window.tocScrollHandler);
    window.tocScrollHandler = null;
  }
}

// 处理代码块的行号显示
function wrapCodeLines() {
  document.querySelectorAll("pre code").forEach((block) => {
    const code = block.innerHTML;
    const lines = code.split("\n");
    const wrappedLines = lines.map((line) => `<span>${line}</span>`).join("\n");
    block.innerHTML = wrappedLines;
  });
}

/**
 * 移动端交互处理
 */
function initMobileInteractions() {
  // 创建菜单按钮
  const menuButton = document.createElement("button");
  menuButton.className = "menu-toggle";
  menuButton.innerHTML = '<i class="fas fa-bars"></i>';
  document.body.appendChild(menuButton);

  // 创建遮罩层
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  document.body.appendChild(overlay);

  // 获取侧边栏
  const sidebar = document.querySelector(".sidebar");

  // 切换侧边栏显示/隐藏
  function toggleSidebar() {
    sidebar.classList.toggle("active");
    menuButton.classList.toggle("active");
    overlay.classList.toggle("active");

    if (sidebar.classList.contains("active")) {
      document.body.style.overflow = "hidden";
      menuButton.innerHTML = '<i class="fas fa-times"></i>';
    } else {
      document.body.style.overflow = "";
      menuButton.innerHTML = '<i class="fas fa-bars"></i>';
    }
  }

  // 绑定事件
  menuButton.addEventListener("click", toggleSidebar);
  overlay.addEventListener("click", toggleSidebar);

  // 处理图片点击放大
  const articleImages = document.querySelectorAll(".article-body img");
  articleImages.forEach((img) => {
    if (!img.closest("a")) {
      // 如果图片不在链接内
      img.classList.add("zoomable");
      img.addEventListener("click", function () {
        if (window.innerWidth <= 768) {
          this.classList.toggle("zoomed");
          if (this.classList.contains("zoomed")) {
            document.body.style.overflow = "hidden";
          } else {
            document.body.style.overflow = "";
          }
        }
      });
    }
  });

  // 处理移动端滑动手势
  let touchStartX = 0;
  let touchEndX = 0;

  document.addEventListener(
    "touchstart",
    (e) => {
      touchStartX = e.touches[0].clientX;
    },
    false
  );

  document.addEventListener(
    "touchend",
    (e) => {
      touchEndX = e.changedTouches[0].clientX;
      handleSwipe();
    },
    false
  );

  function handleSwipe() {
    const swipeDistance = touchEndX - touchStartX;
    const threshold = 100; // 最小滑动距离

    if (Math.abs(swipeDistance) > threshold) {
      if (swipeDistance > 0 && touchStartX < 50) {
        // 从左向右滑动，显示侧边栏
        if (!sidebar.classList.contains("active")) {
          toggleSidebar();
        }
      } else if (swipeDistance < 0 && sidebar.classList.contains("active")) {
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
  console.log("开始初始化 Giscus 评论系统...", { category, filename });

  // 1. 检查评论容器是否存在
  const container = document.getElementById("giscus-container");
  if (!container) {
    console.log("Giscus 容器不存在，跳过初始化");
    return;
  }

  // 2. 清空容器内容
  container.innerHTML = "";

  // 3. 生成文章唯一标识符
  const articleId = `${category}/${filename}`;
  const articleTitle = `${filename.replace(".md", "")} - ${category}`;

  console.log("文章唯一标识:", articleId);
  console.log("文章标题:", articleTitle);

  // 4. 创建 Giscus 脚本元素
  const script = document.createElement("script");
  script.src = "https://giscus.app/client.js";
  script.setAttribute("data-repo", "kachofugetsu09/kachofugetsu09.github.io");
  script.setAttribute("data-repo-id", "R_kgDOO3Q_2g");
  script.setAttribute("data-category", "General");
  script.setAttribute("data-category-id", "DIC_kwDOO3Q_2s4CrqTm");
  script.setAttribute("data-mapping", "specific"); // 使用 specific 映射
  script.setAttribute("data-term", articleId); // 使用文章唯一标识作为 term
  script.setAttribute("data-strict", "0");
  script.setAttribute("data-reactions-enabled", "1");
  script.setAttribute("data-emit-metadata", "0");
  script.setAttribute("data-input-position", "bottom");
  script.setAttribute("data-theme", "light"); // 使用 light 主题匹配黑白简约风格
  script.setAttribute("data-lang", "zh-CN");
  script.setAttribute("crossorigin", "anonymous");
  script.async = true;

  // 5. 添加加载事件监听器
  script.onload = function () {
    console.log("Giscus 评论系统加载成功");
  };

  script.onerror = function () {
    console.error("Giscus 评论系统加载失败");
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

  console.log("Giscus 脚本已添加到页面，文章ID:", articleId);
}

/**
 * 显示归档页面内容
 */
function showArchivePage() {
  const welcomeSection = document.getElementById("welcomeSection");
  const dynamicContent = document.getElementById("dynamicContent");

  if (!dynamicContent) return;

  // 隐藏欢迎区域，显示动态内容
  if (welcomeSection) {
    welcomeSection.style.display = "none";
  }
  dynamicContent.style.display = "block";

  // 隐藏TOC
  hideTOC();

  // 收起所有展开的侧边栏分类
  collapseAllCategories();

  try {
    const categories = window.SITE_DATA?.categories || {};
    const articleLists = window.SITE_DATA?.articleLists || {};
    const articleDetails = window.SITE_DATA?.articleDetails || {};

    // 收集所有文章
    const allArticles = [];
    let totalArticleCount = 0;

    Object.entries(articleLists).forEach(([categoryKey, articles]) => {
      const categoryInfo = categories[categoryKey];

      articles.forEach((filename) => {
        const articleKey = `${categoryKey}/${filename}`;
        const detail = articleDetails[articleKey];

        allArticles.push({
          filename,
          title: detail?.title || filename.replace(".md", ""),
          category: categoryKey,
          categoryName: categoryInfo?.name || categoryKey,
          categoryIcon: categoryInfo?.icon || "fas fa-folder",
          updateTime: detail?.updateTime || "2025-07-18",
          wordCount: detail?.wordCount || 0,
          readingTime: detail?.readingTime || 1,
          preview: detail?.preview || "",
          url: `article.html?category=${categoryKey}&file=${encodeURIComponent(
            filename
          )}`,
        });
        totalArticleCount++;
      });
    });

    // 按更新时间排序（最新的在前）- 使用精确时间确保同一天的文章顺序稳定
    allArticles.sort((a, b) => {
      const articleKeyA = `${a.category}/${a.filename}`;
      const articleKeyB = `${b.category}/${b.filename}`;
      const detailA = articleDetails[articleKeyA];
      const detailB = articleDetails[articleKeyB];

      // 使用精确时间进行排序，如果没有精确时间则回退到显示时间
      const timeA = detailA?._sortTime || a.updateTime;
      const timeB = detailB?._sortTime || b.updateTime;

      return new Date(timeB) - new Date(timeA);
    });

    // 按年份分组
    const articlesByYear = {};
    allArticles.forEach((article) => {
      const year = article.updateTime.split("-")[0];
      if (!articlesByYear[year]) {
        articlesByYear[year] = [];
      }
      articlesByYear[year].push(article);
    });

    // 生成归档HTML
    let archiveHTML = `
      <section class="archive-section">
        <article class="article-content">
          <header class="archive-header">
            <h1 class="archive-title">
              <i class="fas fa-archive"></i>
              文章归档
            </h1>
            <p class="archive-description">按时间顺序浏览所有文章</p>
            <div class="archive-stats">
              <span class="stat-item">
                <i class="fas fa-file-alt"></i>
                共 ${totalArticleCount} 篇文章
              </span>
              <span class="stat-item">
                <i class="fas fa-calendar"></i>
                ${
                  allArticles.length > 0
                    ? `${allArticles[allArticles.length - 1].updateTime} ~ ${
                        allArticles[0].updateTime
                      }`
                    : "-"
                }
              </span>
            </div>
          </header>

          <div class="archive-content">
            <div class="archive-timeline">
    `;

    Object.keys(articlesByYear)
      .sort((a, b) => b - a) // 年份倒序
      .forEach((year) => {
        const yearArticles = articlesByYear[year];

        archiveHTML += `
          <div class="archive-year-section">
            <div class="archive-year-header">
              <h2 class="archive-year-title">
                <i class="fas fa-calendar-alt"></i>
                ${year} 年
                <span class="year-count">${yearArticles.length} 篇</span>
              </h2>
            </div>
            <div class="archive-articles">
        `;

        yearArticles.forEach((article) => {
          const date = new Date(article.updateTime);
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");

          archiveHTML += `
            <article class="archive-article-item">
              <div class="archive-article-date">
                <span class="date-month">${month}</span>
                <span class="date-day">${day}</span>
              </div>
              <div class="archive-article-content">
                <div class="archive-article-meta">
                  <span class="archive-category">
                    <i class="${article.categoryIcon}"></i>
                    ${article.categoryName}
                  </span>
                  <span class="archive-stats">
                    <i class="fas fa-book-reader"></i>
                    ${article.wordCount}字
                    <i class="fas fa-clock"></i>
                    ${article.readingTime}分钟
                  </span>
                </div>
                <h3 class="archive-article-title">
                  <a href="#" onclick="loadArticle('${article.category}', '${
            article.filename
          }'); return false;" class="archive-article-link">
                    ${article.title}
                  </a>
                </h3>
                ${
                  article.preview
                    ? `
                  <p class="archive-article-preview">
                    ${article.preview.substring(0, 120)}${
                        article.preview.length > 120 ? "..." : ""
                      }
                  </p>
                `
                    : ""
                }
              </div>
            </article>
          `;
        });

        archiveHTML += `
            </div>
          </div>
        `;
      });

    if (Object.keys(articlesByYear).length === 0) {
      archiveHTML += `
        <div class="archive-empty">
          <i class="fas fa-inbox"></i>
          <h3>暂无文章</h3>
          <p>还没有发布任何文章</p>
        </div>
      `;
    }

    archiveHTML += `
            </div>
          </div>
        </article>
      </section>
    `;

    dynamicContent.innerHTML = archiveHTML;

    // 更新页面标题
    document.title = "文章归档 - 花月的技术博客";

    // 更新浏览器历史
    const url = new URL(window.location);
    url.searchParams.set("page", "archive");
    url.searchParams.delete("category");
    url.searchParams.delete("file");
    history.pushState({ page: "archive" }, "文章归档", url);
  } catch (error) {
    console.error("渲染归档页面失败:", error);
    dynamicContent.innerHTML = `
      <div class="error-message">
        <h3>加载失败</h3>
        <p>无法加载归档信息，请稍后重试。</p>
        <button onclick="showHomePage()" class="btn btn-primary">返回首页</button>
      </div>
    `;
  }
}
