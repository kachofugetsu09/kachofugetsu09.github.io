/**
 * 性能优化工具集
 */

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
}

// 节流函数
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// 虚拟滚动优化
class VirtualScroll {
    constructor(container, itemHeight = 50) {
        this.container = container;
        this.itemHeight = itemHeight;
        this.visibleItems = Math.ceil(container.clientHeight / itemHeight) + 2;
        this.scrollTop = 0;
        this.items = [];
        
        this.container.addEventListener('scroll', throttle(() => {
            this.scrollTop = this.container.scrollTop;
            this.render();
        }, 16)); // 60fps
    }
    
    setItems(items) {
        this.items = items;
        this.render();
    }
    
    render() {
        const startIndex = Math.floor(this.scrollTop / this.itemHeight);
        const endIndex = Math.min(startIndex + this.visibleItems, this.items.length);
        
        // 只渲染可见区域的项目
        const visibleItems = this.items.slice(startIndex, endIndex);
        
        // 更新DOM
        this.container.innerHTML = visibleItems.map((item, index) => 
            this.renderItem(item, startIndex + index)
        ).join('');
        
        // 设置容器高度以保持滚动条正确
        this.container.style.height = `${this.items.length * this.itemHeight}px`;
    }
    
    renderItem(item, index) {
        return `<div class="virtual-item" style="height: ${this.itemHeight}px;">${item}</div>`;
    }
}

// 图片懒加载
class LazyImageLoader {
    constructor() {
        this.observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    this.observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px'
        });
    }
    
    observe(img) {
        this.observer.observe(img);
    }
}

// 内容缓存管理
class ContentCache {
    constructor(maxSize = 50) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }
    
    get(key) {
        if (this.cache.has(key)) {
            // 移到最前面（LRU）
            const value = this.cache.get(key);
            this.cache.delete(key);
            this.cache.set(key, value);
            return value;
        }
        return null;
    }
    
    set(key, value) {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // 删除最旧的项目
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    
    clear() {
        this.cache.clear();
    }
}

// 预加载管理器
class PreloadManager {
    constructor() {
        this.preloadQueue = [];
        this.isPreloading = false;
    }
    
    addToQueue(url, priority = 'low') {
        this.preloadQueue.push({ url, priority });
        this.processQueue();
    }
    
    async processQueue() {
        if (this.isPreloading) return;
        
        this.isPreloading = true;
        
        // 按优先级排序
        this.preloadQueue.sort((a, b) => {
            const priorities = { high: 3, medium: 2, low: 1 };
            return priorities[b.priority] - priorities[a.priority];
        });
        
        while (this.preloadQueue.length > 0) {
            const { url } = this.preloadQueue.shift();
            
            try {
                // 在空闲时间预加载
                await this.requestIdleCallback(() => {
                    return fetch(url, { 
                        method: 'GET',
                        cache: 'force-cache'
                    });
                });
            } catch (error) {
                console.warn('预加载失败:', url, error);
            }
        }
        
        this.isPreloading = false;
    }
    
    requestIdleCallback(callback) {
        if (window.requestIdleCallback) {
            return new Promise(resolve => {
                window.requestIdleCallback(() => {
                    resolve(callback());
                });
            });
        } else {
            // 降级处理
            return new Promise(resolve => {
                setTimeout(() => {
                    resolve(callback());
                }, 0);
            });
        }
    }
}

// 性能监控工具
class PerformanceMonitor {
    constructor() {
        this.metrics = {};
        this.observers = [];
        this.init();
    }
    
    init() {
        // 监控页面加载性能
        this.observePageLoad();
        
        // 监控资源加载
        this.observeResourceLoad();
        
        // 监控用户交互
        this.observeUserInteraction();
    }
    
    observePageLoad() {
        window.addEventListener('load', () => {
            const navigation = performance.getEntriesByType('navigation')[0];
            if (navigation) {
                this.metrics.pageLoad = {
                    domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                    loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                    totalTime: navigation.loadEventEnd - navigation.fetchStart
                };
            }
        });
    }
    
    observeResourceLoad() {
        const observer = new PerformanceObserver((list) => {
            list.getEntries().forEach(entry => {
                if (entry.entryType === 'resource') {
                    this.trackResourceLoad(entry);
                }
            });
        });
        
        observer.observe({ entryTypes: ['resource'] });
        this.observers.push(observer);
    }
    
    observeUserInteraction() {
        ['click', 'scroll', 'keydown'].forEach(eventType => {
            document.addEventListener(eventType, this.trackInteraction.bind(this), { passive: true });
        });
    }
    
    trackResourceLoad(entry) {
        const resourceType = this.getResourceType(entry.name);
        if (!this.metrics.resources) {
            this.metrics.resources = {};
        }
        
        if (!this.metrics.resources[resourceType]) {
            this.metrics.resources[resourceType] = [];
        }
        
        this.metrics.resources[resourceType].push({
            name: entry.name,
            duration: entry.duration,
            size: entry.transferSize || 0
        });
    }
    
    trackInteraction(event) {
        const now = performance.now();
        if (!this.metrics.interactions) {
            this.metrics.interactions = [];
        }
        
        this.metrics.interactions.push({
            type: event.type,
            timestamp: now,
            target: event.target.tagName
        });
    }
    
    getResourceType(url) {
        if (url.includes('.css')) return 'css';
        if (url.includes('.js')) return 'js';
        if (url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) return 'image';
        if (url.includes('.woff') || url.includes('.ttf')) return 'font';
        return 'other';
    }
    
    getMetrics() {
        return this.metrics;
    }
    
    logMetrics() {
        console.group('Performance Metrics');
        console.table(this.metrics.pageLoad);
        if (this.metrics.resources) {
            Object.entries(this.metrics.resources).forEach(([type, resources]) => {
                console.group(`${type.toUpperCase()} Resources`);
                console.table(resources);
                console.groupEnd();
            });
        }
        console.groupEnd();
    }
    
    cleanup() {
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];
    }
}

// 导出工具函数和类
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        debounce,
        throttle,
        VirtualScroll,
        LazyImageLoader,
        ContentCache,
        PreloadManager,
        PerformanceMonitor
    };
} else {
    // 浏览器环境下挂载到全局对象
    window.PerformanceUtils = {
        debounce,
        throttle,
        VirtualScroll,
        LazyImageLoader,
        ContentCache,
        PreloadManager,
        PerformanceMonitor
    };
}