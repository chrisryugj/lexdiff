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
    return await handleOrdinanceTitle(origin, lawName, articleLabel)
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

/** 조례 조문 제목 조회 */
async function handleOrdinanceTitle(origin: string, lawName: string, articleLabel: string) {
  try {
    // 1. 조례 검색 → ordinSeq 확보
    const searchRes = await fetch(`${origin}/api/ordin-search?query=${encodeURIComponent(lawName)}`)
    if (!searchRes.ok) return NextResponse.json({ title: null }, { status: 200 })

    const searchXml = await searchRes.text()

    // XML에서 자치법규일련번호 추출 (이름 매칭)
    const lawBlocks = searchXml.match(/<law\s[^>]*>[\s\S]*?<\/law>/g) || []
    let bestSeq: string | null = null
    const normalized = lawName.replace(/\s+/g, "")

    for (const block of lawBlocks) {
      const nameMatch = block.match(/<자치법규명>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/자치법규명>/)
      const seqMatch = block.match(/<자치법규일련번호>(\d+)<\/자치법규일련번호>/)
      if (nameMatch && seqMatch) {
        const blockName = nameMatch[1].trim().replace(/\s+/g, "")
        if (blockName === normalized) {
          bestSeq = seqMatch[1]
          break
        }
        if (!bestSeq) bestSeq = seqMatch[1] // 첫 번째 결과 폴백
      }
    }

    if (!bestSeq) return NextResponse.json({ title: null }, { status: 200 })

    // 2. 조례 본문 조회
    const ordinRes = await fetch(`${origin}/api/ordin?ordinSeq=${bestSeq}`)
    if (!ordinRes.ok) return NextResponse.json({ title: null }, { status: 200 })

    const ordinXml = await ordinRes.text()

    // 3. 조문 제목 파싱 - 제N조 매칭
    const targetNum = articleLabel.replace(/\D/g, "")
    if (!targetNum) return NextResponse.json({ title: null }, { status: 200 })

    // 조문단위/조문/조 블록에서 조문번호 일치하는 것 찾기
    // (법제처 XML은 태그명이 다양: 조문단위, 조문, 조 / 조문번호, 조번호 / 조문제목, 조제목, 제목)
    // ✅ 조문번호 태그 값이 "3" 또는 "제3조" 형태 모두 대응
    // NOTE: \b 사용 금지 - 한글은 JS regex에서 \W이므로 \b가 매칭 불가. (?=[\s>\/]) 사용
    const articleBlocks = ordinXml.match(/<(?:조문단위|조문|조)(?=[\s>\/])[\s\S]*?<\/(?:조문단위|조문|조)>/g) || []
    for (const block of articleBlocks) {
      const numMatch = block.match(/<(?:조문번호|조번호|조문호수)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:조문번호|조번호|조문호수)>/)
      const titleMatch = block.match(/<(?:조문제목|조제목|제목)>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:조문제목|조제목|제목)>/)
      if (numMatch && titleMatch) {
        // 조문번호 값에서 숫자만 추출하여 비교 (예: "제3조" → "3", "3" → "3")
        const blockNum = numMatch[1].trim().replace(/\D/g, "")
        if (blockNum === targetNum) {
          const title = titleMatch[1].trim().replace(/^\(|\)$/g, "")
          return NextResponse.json({ title: title || null }, { status: 200 })
        }
      }
    }

    // Fallback: XML 태그 파싱 실패 시, 원문에서 "제N조(제목)" 패턴 직접 추출
    const textPattern = new RegExp(`제${targetNum}조(?:의\\d+)?\\s*[\\(\\(]([^\\)\\)]+)[\\)\\)]`)
    const textMatch = ordinXml.match(textPattern)
    if (textMatch) {
      return NextResponse.json({ title: textMatch[1].trim() }, { status: 200 })
    }

    return NextResponse.json({ title: null }, { status: 200 })
  } catch (error) {
    debugLogger.error("[article-title] ordinance failed", error)
    return NextResponse.json({ title: null }, { status: 200 })
  }
}
