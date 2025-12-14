/**
 * search-result-view/utils.ts
 *
 * 검색 결과 화면 유틸리티 함수
 */

// ============================================================
// 법령 타입별 Badge 색상 클래스
// ============================================================

export function getLawTypeBadgeClass(lawType: string): string {
  const normalizedType = lawType.toLowerCase()

  if (normalizedType.includes('법률')) {
    return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
  } else if (normalizedType.includes('시행령')) {
    return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20'
  } else if (normalizedType.includes('시행규칙')) {
    return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20'
  } else if (normalizedType.includes('대통령령')) {
    return 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20'
  } else if (normalizedType.includes('총리령') || normalizedType.includes('부령')) {
    return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20'
  } else {
    return 'bg-secondary text-secondary-foreground'
  }
}

// ============================================================
// 조문 번호 변환
// ============================================================

export function convertArticleNumberToCode(
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

// ============================================================
// 항/호/목 내용 추출
// ============================================================

export function extractContentFromHangArray(hangArray: any[]): string {
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

      content += "\n" + hangContent
    }

    // Extract 호 (items) if present
    if (hang.호 && Array.isArray(hang.호)) {
      for (const ho of hang.호) {
        if (ho.호내용) {
          let hoContent = ho.호내용

          // Handle array format
          if (Array.isArray(hoContent)) {
            hoContent = hoContent.join("\n")
          }

          content += "\n" + hoContent
        }

        // Extract 목 (sub-items) if present
        if (ho.목 && Array.isArray(ho.목)) {
          for (const mok of ho.목) {
            if (mok.목내용) {
              let mokContent = mok.목내용

              // Handle array format
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

  return content
}

// ============================================================
// 검색어 키워드 판별
// ============================================================

export function hasLawKeyword(query: string): boolean {
  return /법|법률|시행령|시행규칙|규정/.test(query)
}

export function hasOrdinanceKeyword(query: string): boolean {
  return /조례|자치법규/.test(query) || (/규칙/.test(query) && !/시행규칙/.test(query))
}

export function isOrdinanceQuery(query: string): boolean {
  return hasOrdinanceKeyword(query) && !hasLawKeyword(query)
}

// ============================================================
// 검색 쿼리 정규화
// ============================================================

export function buildFullQuery(lawName: string, article?: string): string {
  return article ? `${lawName} ${article}` : lawName
}

// ============================================================
// AI 검색 실패 감지
// ============================================================

export function detectSearchFailed(content: string): boolean {
  return content.includes('File Search Store에서') &&
    content.includes('찾을 수 없습니다')
}
