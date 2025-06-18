/**
 * Gitalk 配置文件
 * 用于管理博客讨论区的设置
 */

// Gitalk 配置
const GITALK_CONFIG = {
    // GitHub Application 配置
    clientID: 'Ov23lirBHS0XJdQDkktW',           // GitHub Application Client ID
    clientSecret: 'a8d5bf15427656f1d57feebe42ec4ddeb622b6aa',   // GitHub Application Client Secret
    repo: 'kachofugetsu09.github.io',           // 用于存储评论的仓库名
    owner: 'kachofugetsu09',                    // 仓库所有者的 GitHub 用户名
    admin: ['kachofugetsu09'],                  // 管理员用户名列表
    
    // Gitalk 行为配置
    id: location.pathname,                       // 页面唯一标识符（自动生成）
    title: document.title,                       // 问题标题（自动生成）
    body: location.href,                         // 问题描述（自动生成）
    language: 'zh-CN',                          // 界面语言
    labels: ['gitalk', 'comment'],              // GitHub issue 标签
    perPage: 10,                                // 每页评论数
    distractionFreeMode: false,                 // 是否启用无干扰模式
    pagerDirection: 'last',                     // 评论排序方向：'last' 或 'first'
    createIssueManually: false,                 // 是否手动创建 issue
    enableHotKey: true,                         // 是否启用快捷键 (cmd|ctrl + enter)
    
    // 代理配置（用于解决 CORS 问题）
    proxy: 'https://cors-anywhere.azm.workers.dev/https://github.com/login/oauth/access_token'
};

/**
 * 生成文章唯一ID
 * 基于分类和文件名生成，确保每篇文章都有唯一的讨论区
 */
function generateArticleId() {
    const urlParams = new URLSearchParams(window.location.search);
    const category = urlParams.get('category');
    const file = urlParams.get('file');
    
    if (category && file) {
        // 使用分类和文件名组合作为唯一ID，去掉.md后缀
        const id = `${category}-${file.replace('.md', '')}`;
        // 确保ID长度不超过50个字符（GitHub限制）
        return id.length > 50 ? id.substring(0, 50) : id;
    }
    
    // 回退到路径作为ID
    return location.pathname.replace(/[^\w\-]/g, '-').substring(0, 50);
}

/**
 * 生成文章标题
 * 基于页面标题或文章参数生成
 */
function generateArticleTitle() {
    const urlParams = new URLSearchParams(window.location.search);
    const file = urlParams.get('file');
    
    if (file) {
        // 使用文件名作为标题，去掉.md后缀
        return file.replace('.md', '') + ' - 花月的技术博客';
    }
    
    return document.title || '博客文章讨论';
}

/**
 * 初始化 Gitalk
 * 在文章加载完成后调用此函数
 */
function initGitalk() {
    console.log('initGitalk函数被调用');
    
    // 检查是否在文章页面
    const container = document.getElementById('gitalk-container');
    if (!container) {
        console.log('Gitalk 容器不存在，跳过初始化');
        return;
    }
    
    console.log('找到Gitalk容器，开始检查配置');
      // 检查必要的配置
    if (GITALK_CONFIG.clientID === 'YOUR_GITHUB_CLIENT_ID' || 
        GITALK_CONFIG.clientSecret === 'YOUR_GITHUB_CLIENT_SECRET') {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; background: #f8f9fa; border-radius: 8px;">
                <i class="fas fa-exclamation-triangle" style="font-size: 2rem; color: #ffa500; margin-bottom: 15px;"></i>
                <h4 style="margin-bottom: 10px;">讨论区配置待完成</h4>
                <p>请在 <code>assets/js/gitalk-config.js</code> 中配置您的 GitHub Application 信息以启用讨论功能。</p>
                <p style="margin-top: 10px; font-size: 0.9rem;">
                    配置教程：<a href="https://github.com/gitalk/gitalk#usage" target="_blank" style="color: #667eea;">查看 Gitalk 配置说明</a>
                </p>
            </div>
        `;
        return;
    }
    
    // 检查 Client Secret 是否有效（简单验证）
    if (GITALK_CONFIG.clientSecret.length < 30) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; background: #f8f9fa; border-radius: 8px;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: #dc3545; margin-bottom: 15px;"></i>
                <h4 style="margin-bottom: 10px;">Client Secret 配置错误</h4>
                <p>请检查您的 GitHub Application Client Secret 是否正确配置。</p>
                <p style="margin-top: 10px; font-size: 0.9rem;">
                    当前 Client Secret 长度: ${GITALK_CONFIG.clientSecret.length} 字符（应该大于30字符）
                </p>
                <div style="margin-top: 15px; padding: 10px; background: #fff; border-radius: 4px; font-family: monospace; font-size: 0.8rem;">
                    <strong>解决步骤：</strong><br>
                    1. 访问 <a href="https://github.com/settings/applications" target="_blank">GitHub OAuth Apps</a><br>
                    2. 点击您的应用<br>
                    3. 生成新的 Client Secret<br>
                    4. 更新 gitalk-config.js 文件
                </div>
            </div>
        `;
        return;
    }
    
    try {
        // 创建 Gitalk 实例
        const gitalk = new Gitalk({
            ...GITALK_CONFIG,
            id: generateArticleId(),
            title: generateArticleTitle(),
            body: `${location.href}\n\n欢迎在此讨论文章内容，分享您的想法和建议！`
        });
        
        // 渲染 Gitalk
        gitalk.render('gitalk-container');
        
        console.log('Gitalk 初始化成功');
        
    } catch (error) {
        console.error('Gitalk 初始化失败:', error);
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #666; background: #f8f9fa; border-radius: 8px;">
                <i class="fas fa-exclamation-circle" style="font-size: 2rem; color: #dc3545; margin-bottom: 15px;"></i>
                <h4 style="margin-bottom: 10px;">讨论区加载失败</h4>
                <p>Gitalk 初始化时出现错误，请稍后重试。</p>
                <p style="margin-top: 10px; font-size: 0.9rem; color: #999;">
                    错误信息: ${error.message}
                </p>
            </div>
        `;
    }
}

// 导出配置和函数供其他脚本使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        GITALK_CONFIG,
        generateArticleId,
        generateArticleTitle,
        initGitalk
    };
}
