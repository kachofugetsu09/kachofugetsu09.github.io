import { createContentLoader } from 'vitepress'
import { spawnSync } from 'child_process'
import * as path from 'path'

export default createContentLoader('**/*.md', {
  transform(rawData) {
    return rawData
      .filter((page) => {
        return page.url !== '/' && page.url !== '/index' && !page.url.endsWith('archive') && !page.url.includes('/public/')
      })
      .map((page) => {
        // page.url starts with /
        // Decode URL to handle non-ASCII filenames
        const decodedUrl = decodeURIComponent(page.url)
        const relativePath = decodedUrl.replace(/^\//, '').replace(/\.html$/, '') + '.md'
        const filePath = path.join('docs', relativePath)
        
        let timestamp = 0
        
        try {
            // git log --reverse --format=%at <file>
            // Get the earliest commit timestamp (creation time)
            const result = spawnSync('git', ['log', '--reverse', '--format=%at', filePath])
            if (result.status === 0) {
                const output = result.stdout.toString().trim()
                if (output) {
                    // The output may contain multiple timestamps separated by newlines
                    // We take the first one which corresponds to the earliest commit
                    const firstTimestamp = output.split('\n')[0]
                    timestamp = parseInt(firstTimestamp) * 1000
                }
            }
        } catch (e) {
            console.error(`Failed to get git log for ${filePath}`, e)
        }
        
        // Fallback to current time if no git log found (e.g. new file not committed)
        if (!timestamp) {
             timestamp = Date.now()
        }
        
        const date = new Date(timestamp)
        const dateString = date.toISOString().split('T')[0] // YYYY-MM-DD

        let title = page.frontmatter.title
        if (!title) {
            const parts = decodedUrl.split('/').filter(Boolean)
            if (parts.length > 0) {
                title = parts[parts.length - 1].replace(/\.html$/, '')
            } else {
                title = 'Untitled'
            }
        }

        return {
          title,
          url: page.url,
          date: {
            time: timestamp,
            string: dateString
          }
        }
      })
      .sort((a, b) => b.date.time - a.date.time)
  }
})
