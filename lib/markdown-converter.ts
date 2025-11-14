/**
 * Markdown Converter Utility
 * Converts basic markdown to structured markdown for File Search
 */

/**
 * Convert basic markdown to structured markdown
 *
 * Adds metadata block before each article for reliable law name extraction
 * even when chunking splits the document in the middle
 */
export function convertToStructuredMarkdown(markdown: string): string {
  const lines = markdown.split('\n')

  // Extract law metadata from header
  const lawNameMatch = markdown.match(/^# (.+)$/m)
  const lawIdMatch = markdown.match(/\*\*법령 ID\*\*:\s*(.+?)$/m)
  const effectiveDateMatch = markdown.match(/\*\*시행일\*\*:\s*(.+?)$/m)

  if (!lawNameMatch) {
    throw new Error('법령명(# ...)을 찾을 수 없습니다')
  }

  const lawName = lawNameMatch[1].trim()
  const lawId = lawIdMatch ? lawIdMatch[1].trim() : 'unknown'
  const effectiveDate = effectiveDateMatch ? effectiveDateMatch[1].trim() : 'unknown'

  // Split into articles
  const articleBlocks: string[] = []
  let currentBlock: string[] = []
  let isHeader = true
  let articleCount = 0

  for (const line of lines) {
    // Match article title: ## 제N조 or ## 제N조의M
    const articleMatch = line.match(/^## (제\d+(?:의\d+)?조)\s*(.*)$/)

    if (articleMatch) {
      // Save previous article
      if (currentBlock.length > 0 && !isHeader) {
        articleBlocks.push(currentBlock.join('\n'))
      }

      // Start new article with metadata block
      const articleNum = articleMatch[1]
      const articleTitle = articleMatch[2].trim()

      currentBlock = [
        '---',
        '',
        `**법령명**: ${lawName}`,
        `**법령ID**: ${lawId}`,
        `**조문**: ${articleNum}`,
        articleTitle ? `**제목**: ${articleTitle}` : '',
        `**시행일**: ${effectiveDate}`,
        '',
        line // ## 제N조 ...
      ].filter(Boolean)

      isHeader = false
      articleCount++
    } else {
      currentBlock.push(line)
    }
  }

  // Add last article
  if (currentBlock.length > 0 && !isHeader) {
    articleBlocks.push(currentBlock.join('\n'))
  }

  // Combine: header + structured articles
  const headerEndIndex = lines.findIndex((line) => line.match(/^## 제\d+/))
  const header = headerEndIndex > 0 ? lines.slice(0, headerEndIndex).join('\n') : lines.slice(0, 10).join('\n')

  const output = [header, '', ...articleBlocks, '\n---\n'].join('\n')

  console.log(`[Markdown Converter] ✅ Converted ${articleCount} articles to structured format`)

  return output
}

/**
 * Check if markdown is already structured
 */
export function isStructuredMarkdown(markdown: string): boolean {
  // Check for metadata block pattern
  return /\*\*법령명\*\*:\s*.+/.test(markdown) && /\*\*조문\*\*:\s*.+/.test(markdown)
}
