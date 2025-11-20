# 归档

<script setup>
import { data } from './archive.data.mts'
import { computed } from 'vue'

const groupedPosts = computed(() => {
  const groups = {}
  data.forEach(post => {
    const date = new Date(post.date.time)
    const year = date.getFullYear()
    if (!groups[year]) {
      groups[year] = []
    }
    groups[year].push(post)
  })
  return Object.keys(groups).sort((a, b) => b - a).map(year => ({
    year,
    posts: groups[year]
  }))
})

function formatDate(timestamp) {
  const date = new Date(timestamp)
  return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}
</script>

<div class="archive-container">
  <div v-for="group in groupedPosts" :key="group.year" class="archive-year-group">
    <h2 class="archive-year">{{ group.year }}</h2>
    <div class="archive-list">
      <div v-for="post in group.posts" :key="post.url" class="archive-item">
        <a :href="post.url" class="archive-link">
          <span class="archive-date">{{ formatDate(post.date.time) }}</span>
          <span class="archive-title">{{ post.title }}</span>
        </a>
      </div>
    </div>
  </div>
</div>

<style>
.archive-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem 0;
}

.archive-year-group {
  margin-bottom: 3rem;
}

.archive-year {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin-bottom: 1rem;
  border: none !important;
  padding-left: 12px;
}

.archive-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.archive-link {
  display: flex !important;
  align-items: center;
  padding: 10px 20px; /* 稍微紧凑一点 */
  border-radius: 8px; /* 稍微小一点的圆角，或者保持胶囊 */
  border-radius: 999px;
  text-decoration: none !important;
  color: var(--vp-c-text-1) !important;
  transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
  border: 1px solid transparent;
}

.archive-link:hover {
  background-color: rgba(59, 130, 246, 0.08); /* 使用品牌色背景淡化 */
  color: var(--vp-c-brand) !important;
}

.archive-date {
  font-family: var(--vp-font-family-mono);
  font-size: 0.95rem;
  color: var(--vp-c-brand); /* 使用品牌色高亮日期 */
  margin-right: 1.5rem;
  min-width: 3.8rem;
  font-weight: 600; /* 加粗日期 */
  opacity: 0.9;
}

.archive-title {
  font-size: 1.05rem;
  font-weight: 500;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 移除链接的小箭头 */
.archive-link::after {
  display: none !important;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .archive-link {
    padding: 12px 16px;
    flex-direction: column;
    align-items: flex-start;
    border-radius: 16px;
  }
  
  .archive-date {
    margin-bottom: 4px;
    font-size: 0.8rem;
  }
  
  .archive-title {
    white-space: normal;
  }
}
</style>
