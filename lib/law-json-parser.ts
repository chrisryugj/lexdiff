import type { LawArticle, LawData } from "./law-types"

export function parseLawJSON(jsonData: any): LawData {
  const lawData = jsonData.법령 || {}
  const basicInfo = lawData.기본정보 || {}

  const meta = {
    lawId: basicInfo.법령ID || "unknown",
    lawTitle: basicInfo.법령명한글 || "제목 없음",
    latestEffectiveDate: basicInfo.최종시행일자 || "",
    promulgation: {
      date: basicInfo.공포일자 || "",
      number: basicInfo.공포번호 || "",
    },
    revisionType: basicInfo.제개정구분명 || "",
    fetchedAt: new Date().toISOString(),
  }

  const articles: LawArticle[] = []
  const articleUnits = lawData.조문?.조문단위 || []

  for (const unit of articleUnits) {
    if (unit.조문여부 !== "조문") continue

    const articleNum = unit.조문번호 || "0"
    const mainNum = Number(articleNum)
    const code = mainNum.toString().padStart(6, "0")
    const display = "제" + mainNum + "조"

    articles.push({
      jo: code,
      joNum: display,
      title: unit.조문제목 || "",
      content: unit.조문내용 || "",
      isPreamble: false,
    })
  }

  return {
    meta,
    articles,
    articleCount: articles.length,
  }
}
