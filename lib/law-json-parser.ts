import type { LawArticle, LawData } from "./law-types"

/**
 * Helper: Convert article number + branch number to JO code
 * 예: (2, 0) → { code: "000200", display: "제2조" }
 * 예: (38, 2) → { code: "003802", display: "제38조의2" }
 */
function convertArticleNumberToCode(
  articleNum: string | number,
  branchNum?: string | number,
): { code: string; display: string } {
  const mainNum = typeof articleNum === "string" ? Number.parseInt(articleNum) : articleNum
  const branch = branchNum ? (typeof branchNum === "string" ? Number.parseInt(branchNum) : branchNum) : 0

  if (isNaN(mainNum)) {
    return { code: "000000", display: "제0조" }
  }

  const code = mainNum.toString().padStart(4, "0") + branch.toString().padStart(2, "0")
  const display = branch > 0 ? "제" + mainNum + "조의" + branch : "제" + mainNum + "조"

  return { code, display }
}

/**
 * Helper: Extract content from 항 array (recursive for 호/목)
 */
function extractContentFromHangArray(hangArray: any[]): string {
  let content = ""

  if (!Array.isArray(hangArray)) {
    return content
  }

  for (const hang of hangArray) {
    // Extract 항내용 (paragraph content)
    if (hang.항내용) {
      let hangContent = hang.항내용

      // Handle array format (some 항내용 are arrays of strings)
      if (Array.isArray(hangContent)) {
        hangContent = hangContent.join("\n")
      }

      content += (content ? "\n" : "") + hangContent
    }

    // Extract 호 (items) within 항
    if (hang.호 && Array.isArray(hang.호)) {
      for (const ho of hang.호) {
        if (ho.호내용) {
          let hoContent = ho.호내용

          if (Array.isArray(hoContent)) {
            hoContent = hoContent.join("\n")
          }

          content += "\n" + hoContent
        }

        // Extract 목 (sub-items) within 호
        if (ho.목 && Array.isArray(ho.목)) {
          for (const mok of ho.목) {
            if (mok.목내용) {
              let mokContent = mok.목내용

              if (Array.isArray(mokContent)) {
                mokContent = mokContent.join("\n")
              }

              content += "\n" + mokContent
            }
          }
        }
      }
    }
  }

  return content
}

/**
 * Main parser: JSON 법령 데이터 → LawData
 */
export function parseLawJSON(jsonData: any): LawData {
  try {
    const lawData = jsonData.법령

    if (!lawData) {
      throw new Error("법령 데이터가 없습니다")
    }

    const basicInfo = lawData.기본정보 || lawData
    const meta = {
      lawId: basicInfo.법령ID || basicInfo.법령키 || "unknown",
      lawTitle: basicInfo.법령명_한글 || basicInfo.법령명한글 || basicInfo.법령명 || "제목 없음",
      latestEffectiveDate: basicInfo.최종시행일자 || basicInfo.시행일자 || "",
      promulgation: {
        date: basicInfo.공포일자 || "",
        number: basicInfo.공포번호 || "",
      },
      revisionType: basicInfo.제개정구분명 || basicInfo.제개정구분 || "",
      fetchedAt: new Date().toISOString(),
    }

    const articles: LawArticle[] = []
    const articleUnits = lawData.조문?.조문단위 || []

    for (const unit of articleUnits) {
      if (unit.조문여부 !== "조문") continue

      const articleNum = unit.조문번호
      const branchNum = unit.조문가지번호
      const title = unit.조문제목 || ""

      const result = convertArticleNumberToCode(articleNum, branchNum)
      const code = result.code
      const display = result.display

      // CRITICAL: 본문 (조문내용) + 항/호 결합 로직
      let mainContent = ""  // 조문내용에서 추출
      let paraContent = ""  // 항/호에서 추출

      // STEP 1: 본문 추출 (조문내용에서)
      if (unit.조문내용 && typeof unit.조문내용 === "string") {
        let rawContent = unit.조문내용.trim()

        // 제목 패턴 매칭: 제X조(제목) 형식
        const headerMatch = rawContent.match(/^(제\d+조(?:의\d+)?\s*(?:\([^)]+\))?)[\s\S]*/)

        if (headerMatch) {
          const headerPart = headerMatch[1]  // 제X조(제목)
          const bodyPart = rawContent.substring(headerPart.length).trim()  // 나머지 본문

          if (bodyPart) {
            // 본문이 있으면 본문만 저장
            mainContent = bodyPart
          } else {
            // 본문 없이 제목만 있는 경우 (도로법 시행령 55조)
            // 제목 제거하지 않고 유지 (호가 있을 수 있음)
            mainContent = headerPart
          }
        } else {
          // 제목 형식이 아니면 전체를 본문으로
          mainContent = rawContent
        }
      }

      // STEP 2: 항/호 내용 추출
      if (unit.항 && Array.isArray(unit.항)) {
        paraContent = extractContentFromHangArray(unit.항)
      }
      // Fallback: if 항 is an object with 호 array (old structure)
      else if (unit.항 && typeof unit.항 === "object" && unit.항.호) {
        if (Array.isArray(unit.항.호)) {
          for (const ho of unit.항.호) {
            if (ho.호내용) {
              let hoContent = ho.호내용
              if (Array.isArray(hoContent)) {
                hoContent = hoContent.join("\n")
              }
              paraContent += "\n" + hoContent
            }
          }
        }
      }

      // STEP 3: 본문 + 항/호 결합
      let content = ""
      if (mainContent) {
        content = mainContent
        if (paraContent) {
          content += "\n" + paraContent
        }
      } else {
        content = paraContent
      }

      articles.push({
        jo: code,
        joNum: display,
        title: title,
        content: content.trim(),
        isPreamble: false,
      })
    }

    return {
      meta,
      articles,
      articleCount: articles.length,
    }
  } catch (error) {
    console.error("JSON 파싱 오류", error)
    throw error
  }
}
