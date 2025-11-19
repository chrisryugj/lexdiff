import { readFileSync, writeFileSync } from 'fs'

// Read LAW_OC from .env.local
const envContent = readFileSync('.env.local', 'utf-8')
const lawOC = envContent.match(/LAW_OC=(.+)/)?.[1]?.trim()

if (!lawOC) {
  console.error('LAW_OC not found in .env.local')
  process.exit(1)
}

// Fetch article 55 from 도로법 시행령
const url = `https://www.law.go.kr/DRF/lawService.do?target=law&MST=109379&type=XML&OC=${lawOC}`

fetch(url)
  .then(res => res.text())
  .then(xml => {
    // Save to file for inspection
    writeFileSync('test-article-55-response.xml', xml, 'utf-8')
    console.log('Saved XML to test-article-55-response.xml')
    console.log('XML length:', xml.length)

    // Check XML structure
    const has조문단위 = xml.includes('<조문단위>')
    console.log('Has 조문단위:', has조문단위)

    if (has조문단위) {
      // Try JSON API instead
      console.log('This is JSON API response, not XML')
      return
    }

    // List all article numbers
    const articleNums = xml.match(/<조문번호>(\d+)<\/조문번호>/g)
    console.log('Found articles:', articleNums?.slice(50, 60))

    // Find article 55 (non-greedy match for nested 조문 tags)
    const matches = xml.match(/<조문>[\s\S]*?<\/조문>/g)
    console.log('Total articles found:', matches?.length)

    const article55Match = matches?.find(m => m.includes('<조문번호>55<'))

    if (!article55Match) {
      console.error('Article 55 not found')
      return
    }

    console.log('=== Article 55 XML ===')
    console.log(article55Match)

    // Extract key fields
    const joNum = article55Match.match(/<조문번호>(.+?)<\/조문번호>/)?.[1]
    const joTitle = article55Match.match(/<조문제목>(.+?)<\/조문제목>/)?.[1]
    const joContent = article55Match.match(/<조문내용>([\s\S]*?)<\/조문내용>/)?.[1]

    console.log('\n=== Extracted Fields ===')
    console.log('조문번호:', joNum)
    console.log('조문제목:', joTitle)
    console.log('조문내용:', joContent)
    console.log('조문내용 length:', joContent?.length || 0)
  })
  .catch(err => {
    console.error('Error:', err.message)
  })
