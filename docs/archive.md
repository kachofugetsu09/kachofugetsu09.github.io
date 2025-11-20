# 归档

<script setup>
import { data } from './archive.data.mts'
</script>

<div class="timeline-container">
  <div class="timeline">
    <div v-for="(post, index) in data" :key="post.url" class="timeline-item">
      <div class="timeline-dot"></div>
      <div class="timeline-date">{{ post.date.string }}</div>
      <div class="timeline-content">
        <a :href="post.url">{{ post.title }}</a>
      </div>
    </div>
  </div>
</div>

<style>
.timeline-container {
  margin-top: 2rem;
}

.timeline {
  position: relative;
  padding-left: 1.5rem;
  border-left: 1px solid var(--vp-c-divider);
}

.timeline-item {
  position: relative;
  margin-bottom: 2rem;
}

.timeline-dot {
  position: absolute;
  left: -1.9rem;
  top: 0.3rem;
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background-color: var(--vp-c-brand);
  border: 2px solid var(--vp-c-bg);
}

.timeline-date {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  margin-bottom: 0.5rem;
  font-family: var(--vp-font-family-mono);
}

.timeline-content {
  font-size: 1.1rem;
  font-weight: 500;
}

.timeline-content a {
  text-decoration: none;
  color: var(--vp-c-text-1);
  transition: color 0.25s;
}

.timeline-content a:hover {
  color: var(--vp-c-brand);
}
</style>
