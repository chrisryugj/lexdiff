#!/usr/bin/env node

/**
 * Download 30 Laws (FINAL - Uses correct eflaw endpoint)
 */

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') })

const API_KEY = process.env.LAW_OC
const OUTPUT_DIR = path.join(__dirname, 'downloaded-laws-final')

if (!API_KEY) {
  console.error('❌ LAW_OC API 키가 설정되지 않았습니다')
  process.exit(1)
}

/**
 * Extract content from 항 array (CORRECT parsing logic from Admin Dashboard)
 */
function extractContentFromHangArray(hangArray: any[]): string {
  let content = ""
  if (!Array.isArray(hangArray)) return content
  
  for (const hang of hangArray) {
    if (hang.항내용) {
      let hangContent = hang.항내용
      if (Array.isArray(hangContent)) {
        hangContent = hangContent.join("\n")
      }
      content += "\n" + hangContent
    }
    
    if (hang.호 && Array.isArray(hang.호)) {
      for (const ho of hang.호) {
        if (ho.호내용) {
          let hoContent = ho.호내용
          if (Array.isArray(hoContent)) {
            hoContent = hoContent.join("\n")
          }
          content += "\n" + hoContent
        }
        
        if (ho.목 && Array.isArray(ho.목)) {
          for (const mok of ho.목) {
            if (mok.목내용) {
              let mokContent = mok.목내용
              if (Array.isArray(mokContent)) {
                mokContent = mokContent.join("\n")
              }
              content += "\n  " + mokContent
            }
          }
        }
      }
    }
  }
  
  return content.trim()
}

function formatDate(dateStr: string): string {
  if (!dateStr || dateStr.length !== 8) return dateStr
  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)
  return `${year}년 ${month}월 ${day}일`
}

function parseLaw(jsonData: any): any {
  const lawData = jsonData.법령
  if (!lawData) throw new Error("법령 데이터가 없습니다")
  
  const basicInfo = lawData.기본정보 || lawData
  const metadata = {
    lawId: basicInfo.법령ID || basicInfo.법령키 || "unknown",
    lawName: basicInfo.법령명_한글 || basicInfo.법령명한글 || "제목 없음",
    effectiveDate: basicInfo.최종시행일자 || basicInfo.시행일자 || "",
    promulgationDate: basicInfo.공포일자 || "",
    promulgationNumber: basicInfo.공포번호 || "",
    revisionType: basicInfo.제개정구분명 || basicInfo.제개정구분 || "",
    articleCount: 0,
    totalCharacters: 0
  }
  
  const articles: any[] = []
  const articleUnits = lawData.조문?.조문단위 || []
  
  for (const unit of articleUnits) {
    if (unit.조문여부 !== "조문") continue
    
    const articleNum = unit.조문번호
    const branchNum = unit.조문가지번호
    const title = unit.조문제목 || ""
    
    let displayNumber = `제${articleNum}조`
    if (branchNum && Number.parseInt(branchNum) > 0) {
      displayNumber = `제${articleNum}조의${branchNum}`
    }
    
    let content = ""
    if (unit.항 && Array.isArray(unit.항)) {
      content = extractContentFromHangArray(unit.항)
    } else if (unit.조문내용 && typeof unit.조문내용 === "string") {
      let rawContent = unit.조문내용.trim()
      const headerPattern = /^제\d+조(?:의\d+)?\([^)]+\)\s*/
      rawContent = rawContent.replace(headerPattern, "")
      content = rawContent
    }
    
    articles.push({
      displayNumber,
      title,
      content: content.trim()
    })
    
    metadata.totalCharacters += content.length
  }
  
  metadata.articleCount = articles.length
  
  // Generate markdown
  let md = `# ${metadata.lawName}\n\n`
  md += `**법령 ID**: ${metadata.lawId}\n`
  if (metadata.effectiveDate) {
    md += `**시행일**: ${formatDate(metadata.effectiveDate)}\n`
  }
  if (metadata.promulgationDate) {
    md += `**공포일**: ${formatDate(metadata.promulgationDate)}`
    if (metadata.promulgationNumber) {
      md += ` (${metadata.promulgationNumber})`
    }
    md += `\n`
  }
  if (metadata.revisionType) {
    md += `**제개정구분**: ${metadata.revisionType}\n`
  }
  md += `**조문 수**: ${metadata.articleCount}개\n`
  md += `\n---\n\n`
  
  for (const article of articles) {
    md += `## ${article.displayNumber}`
    if (article.title) {
      md += ` ${article.title}`
    }
    md += `\n\n`
    if (article.content) {
      md += `${article.content}\n\n`
    }
  }
  
  return { metadata, markdown: md }
}

async function downloadLaw(lawName: string, lawId: string): Promise<any> {
  const url = `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${API_KEY}&type=JSON&ID=${lawId}`
  const res = await fetch(url)
  const data = await res.json()
  return parseLaw(data)
}

async function main() {
  console.log('📚 30개 우선 법령 다운로드 (EFLAW 사용)\n')
  
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }
  
  const lawIdsPath = path.join(__dirname, 'law-ids-mapping.json')
  const lawIdsObject = JSON.parse(fs.readFileSync(lawIdsPath, 'utf-8'))
  
  const results: any[] = []
  
  for (const [lawName, lawId] of Object.entries(lawIdsObject)) {
    const index = Object.keys(lawIdsObject).indexOf(lawName) + 1
    const total = Object.keys(lawIdsObject).length
    
    console.log(`\n[${index}/${total}] ${lawName}`)
    
    try {
      const parsed = await downloadLaw(lawName, lawId as string)
      
      const safeFileName = lawName.replace(/[/\?%*:|"<>]/g, '-')
      const filePath = path.join(OUTPUT_DIR, `${safeFileName}.md`)
      fs.writeFileSync(filePath, parsed.markdown, 'utf-8')
      
      const fileSize = fs.statSync(filePath).size
      const fileSizeKB = (fileSize / 1024).toFixed(1)
      
      console.log(`   ✅ ${fileSizeKB} KB (${parsed.metadata.articleCount}개 조문)`)
      console.log(`   📄 ${parsed.metadata.lawName}`)
      
      results.push({
        lawName,
        success: true,
        fileSize,
        articleCount: parsed.metadata.articleCount
      })
      
      await new Promise((resolve) => setTimeout(resolve, 300))
    } catch (error: any) {
      console.log(`   ❌ 오류: ${error.message}`)
      results.push({ lawName, success: false, error: error.message })
    }
  }
  
  // Summary
  console.log('\n' + '='.repeat(70))
  console.log('📊 다운로드 완료 요약')
  console.log('='.repeat(70))
  
  const successResults = results.filter((r) => r.success)
  const failResults = results.filter((r) => !r.success)
  
  console.log(`\n✅ 성공: ${successResults.length}개`)
  console.log(`❌ 실패: ${failResults.length}개`)
  
  if (successResults.length > 0) {
    console.log(`\n📂 저장 위치: ${OUTPUT_DIR}\n`)
    console.log('파일 정보:')
    console.log('-'.repeat(70))
    
    for (const result of successResults) {
      const sizeKB = ((result.fileSize || 0) / 1024).toFixed(1)
      console.log(
        `${sizeKB.padStart(8)} KB | ${String(result.articleCount || 0).padStart(3)} 조문 | ${result.lawName}`
      )
    }
  }
  
  if (failResults.length > 0) {
    console.log('\n❌ 실패한 법령:')
    for (const result of failResults) {
      console.log(`   - ${result.lawName}: ${result.error}`)
    }
  }
  
  console.log('\n✅ 완료!')
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error)
  process.exit(1)
})
