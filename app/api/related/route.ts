import { NextResponse } from "next/server"
import { debugLogger } from "@/lib/debug-logger"

const LAW_SEARCH_API = "https://www.law.go.kr/DRF/lawSearch.do"
const LAW_SERVICE_API = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

// Very lightweight XML/HTML helpers
function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, "")
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// Extract all articles (조문) from eflaw XML
function extractArticlesFromXml(xml: string): Array<{ joNum: string; title?: string; text: string }> {
  const results: Array<{ joNum: string; title?: string; text: string }> = []
  const blocks = xml.match(/<조문[\s\S]*?<\/조문>/g) || []
  for (const block of blocks) {
    const joNum = (block.match(/<조문번호>([^<]+)<\/조문번호>/)?.[1] || "").trim()
    const title = block.match(/<조문제목>([^<]+)<\/조문제목>/)?.[1]?.trim()
    // Combine 조문내용 + 항내용 + 호내용
    const contents: string[] = []
    const joContents = block.match(/<조문내용>([\s\S]*?)<\/조문내용>/g) || []
    for (const c of joContents) contents.push(stripTags(c))
    const hangContents = block.match(/<항내용>([\s\S]*?)<\/항내용>/g) || []
    for (const c of hangContents) contents.push(stripTags(c))
    const hoContents = block.match(/<호내용>([\s\S]*?)<\/호내용>/g) || []
    for (const c of hoContents) contents.push(stripTags(c))
    const text = contents.join("\n").trim()
    if (text) results.push({ joNum, title, text })
  }
  return results
}

function normalizeNoSpace(s: string): string {
  return s.replace(/\s+/g, "").replace(/\u00A0/g, "").trim()
}

function scoreMatch(textNoSpace: string, baseLaw: string, articleNum: string, branch?: string): { ok: boolean; score: number; index: number } {
  const baseLawNo = normalizeNoSpace(baseLaw)
  const patterns: string[] = []
  // 이법/법/법명 + 제N조(의M)?
  const joCore = `제${articleNum}조` + (branch ? `의${branch}` : "")
  patterns.push(`이법${joCore}`)
  patterns.push(`법${joCore}`)
  patterns.push(`${baseLawNo}${joCore}`)
  patterns.push(joCore) // fallback: just the article reference

  let best = { ok: false, score: 0, index: -1 }
  for (const p of patterns) {
    const idx = textNoSpace.indexOf(p)
    if (idx >= 0) {
      let score = 1
      if (p.startsWith("이법")) score += 3
      if (p.startsWith("법")) score += 2
      if (p.startsWith(baseLawNo)) score += 2
      if (branch) score += 1
      if (!best.ok || score > best.score) best = { ok: true, score, index: idx }
    }
  }
  return best
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const baseLaw = searchParams.get("baseLaw") || ""
  const joLabel = searchParams.get("joLabel") || ""
  const kind = searchParams.get("kind") || "decree" // decree | rule

  if (!OC) {
    return NextResponse.json({ error: "LAW_OC 환경변수가 필요합니다." }, { status: 500 })
  }
  if (!baseLaw || !joLabel) {
    return NextResponse.json({ error: "baseLaw, joLabel은 필수입니다." }, { status: 400 })
  }

  try {
    const suffix = kind === "rule" ? "시행규칙" : "시행령"
    const query = `${baseLaw} ${suffix}`

    // 1) Find decree/rule law ID via lawSearch
    const searchParamsDRF = new URLSearchParams({ target: "law", type: "XML", OC, query })
    const searchUrl = `${LAW_SEARCH_API}?${searchParamsDRF.toString()}`
    const searchRes = await fetch(searchUrl, { next: { revalidate: 3600 } })
    const searchXml = await searchRes.text()
    const lawId = searchXml.match(/<법령ID>([^<]+)<\/법령ID>/)?.[1] || ""
    const lawName = searchXml.match(/<법령명>([^<]+)<\/법령명>/)?.[1] || `${baseLaw} ${suffix}`
    if (!lawId) {
      return NextResponse.json({ lawName, candidates: [] })
    }

    // 2) Fetch full decree/rule XML
    const eflawParams = new URLSearchParams({ target: "eflaw", type: "XML", OC, ID: lawId })
    const eflawUrl = `${LAW_SERVICE_API}?${eflawParams.toString()}`
    const eflawRes = await fetch(eflawUrl, { next: { revalidate: 3600 } })
    const eflawXml = await eflawRes.text()

    // 3) Prepare match target from joLabel (e.g., "38조", "38조의2")
    const m = joLabel.match(/(\d+)\s*조(?:의\s*(\d+))?/)
    const articleNum = m?.[1] || ""
    const branch = m?.[2]
    if (!articleNum) {
      return NextResponse.json({ lawName, candidates: [] })
    }

    // 4) Parse and score
    const articles = extractArticlesFromXml(eflawXml)
    const candidates = articles
      .map((a) => {
        const noSpace = normalizeNoSpace(a.text)
        const s = scoreMatch(noSpace, baseLaw, articleNum, branch)
        return { ...a, score: s.score, matchIndex: s.index, ok: s.ok }
      })
      .filter((x) => x.ok)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => {
        // Build simple HTML with snippet emphasis
        const text = x.text
        const core = `제${articleNum}조` + (branch ? `의${branch}` : "")
        const highlighted = escapeHtml(text).replace(new RegExp(core, "g"), `<mark>${core}</mark>`)
        const html = highlighted.replace(/\n/g, "<br/>")
        return { joNum: x.joNum, title: x.title, score: x.score, html }
      })

    debugLogger.info("related search", { baseLaw, joLabel, kind, candidates: candidates.length })
    return NextResponse.json({ lawName, candidates })
  } catch (error) {
    debugLogger.error("related search error", error)
    return NextResponse.json({ error: error instanceof Error ? error.message : "unknown" }, { status: 500 })
  }
}
