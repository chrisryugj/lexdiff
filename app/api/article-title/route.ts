import { NextResponse } from "next/server"
import { buildJO } from "@/lib/law-parser"
import { debugLogger } from "@/lib/debug-logger"

function stripQuotes(name: string): string {
  return name.replace(/[「」『』]/g, "").trim()
}

function extractFirstArticleLabel(input: string): string | null {
  const match = input.match(/(제\d+조(?:의\d+)?)/)
  return match?.[1] || null
}

function extractLawsFromSearchXml(xml: string): Array<{ name: string; lawId?: string; mst?: string }> {
  const lawBlocks = xml.match(/<law\s[^>]*>[\s\S]*?<\/law>/g) || []
  const extractTag = (block: string, tag: string): string => {
    const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`)
    const m = block.match(re)
    return (m?.[1] || "").trim()
  }

  return lawBlocks.map((block) => ({
    name: extractTag(block, "법령명한글"),
    lawId: extractTag(block, "법령ID") || undefined,
    mst: extractTag(block, "법령일련번호") || undefined,
  }))
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const rawLawName = searchParams.get("lawName")
  const rawArticle = searchParams.get("article")

  if (!rawLawName || !rawArticle) {
    return NextResponse.json({ error: "lawName, article이 필요합니다" }, { status: 400 })
  }

  const lawName = stripQuotes(rawLawName)
  const articleLabel = rawArticle.trim()

  // NOTE: 자치법규(조례 등) 타이틀 조회는 XML 형태가 다양해 서버에서 안전하게 파싱하기가 까다로워
  // 우선 국가법령(eflaw)만 지원한다. (필요 시 ordin 전용 파서 추가)
  const isOrdinance =
    (/조례/.test(lawName) ||
      (/(특별시|광역시|[가-힣]+도|[가-힣]+(시|군|구))\s+[가-힣]/.test(lawName) && !/시행규칙|시행령/.test(lawName))) &&
    !/시행규칙|시행령/.test(lawName)

  if (isOrdinance) {
    return NextResponse.json({ title: null, unsupported: "ordinance" }, { status: 200 })
  }

  try {
    const searchQs = new URLSearchParams({ query: lawName })
    const searchRes = await fetch(`${origin}/api/law-search?${searchQs.toString()}`)
    if (!searchRes.ok) {
      debugLogger.warning("[article-title] law-search failed", { lawName, status: searchRes.status })
      return NextResponse.json({ title: null }, { status: 200 })
    }

    const searchXml = await searchRes.text()
    const laws = extractLawsFromSearchXml(searchXml)
    if (laws.length === 0) {
      return NextResponse.json({ title: null }, { status: 200 })
    }

    const normalized = lawName.replace(/\s+/g, "")
    const exactMatches = laws.filter((l) => l.name.replace(/\s+/g, "") === normalized)
    const selected =
      (exactMatches.length > 0
        ? exactMatches.reduce((shortest, current) => (current.name.length < shortest.name.length ? current : shortest))
        : laws[0]) || laws[0]

    if (!selected?.lawId && !selected?.mst) {
      return NextResponse.json({ title: null }, { status: 200 })
    }

    const articleOnly = extractFirstArticleLabel(articleLabel) || articleLabel
    let joCode = ""
    try {
      joCode = buildJO(articleOnly)
    } catch {
      joCode = ""
    }

    const eflawParams = new URLSearchParams()
    if (selected.lawId) eflawParams.append("lawId", selected.lawId)
    else if (selected.mst) eflawParams.append("mst", selected.mst)

    const eflawRes = await fetch(`${origin}/api/eflaw?${eflawParams.toString()}`)
    if (!eflawRes.ok) {
      debugLogger.warning("[article-title] eflaw failed", { lawName, status: eflawRes.status })
      return NextResponse.json({ title: null }, { status: 200 })
    }

    const eflawJson = await eflawRes.json()
    const lawData = eflawJson?.법령
    const rawUnits = lawData?.조문?.조문단위
    const articleUnits = Array.isArray(rawUnits) ? rawUnits : rawUnits ? [rawUnits] : []

    const targetUnit =
      articleUnits.find((unit: any) => {
        const isArticle = unit?.조문여부 === "조문"
        const hasKey = typeof unit?.조문키 === "string"
        const matches = joCode ? hasKey && unit.조문키.startsWith(joCode) : false
        return isArticle && hasKey && matches
      }) ||
      articleUnits.find((unit: any) => {
        const num = typeof unit?.조문번호 === "string" ? unit.조문번호.replace(/\D/g, "") : ""
        const targetNum = articleLabel.replace(/\D/g, "")
        return unit?.조문여부 === "조문" && num !== "" && targetNum !== "" && num === targetNum
      })

    const title = typeof targetUnit?.조문제목 === "string" ? targetUnit.조문제목.trim() : ""
    return NextResponse.json({ title: title || null }, { status: 200 })
  } catch (error) {
    debugLogger.error("[article-title] failed", error)
    return NextResponse.json({ title: null }, { status: 200 })
  }
}

