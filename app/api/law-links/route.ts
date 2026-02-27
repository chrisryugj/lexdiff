import { NextResponse } from "next/server"
import { load, type CheerioAPI, type Cheerio, type Element } from "cheerio"
import iconv from "iconv-lite"

function absUrl(href: string): string {
  try {
    if (!href) return ""
    if (href.startsWith("http")) return href
    if (href.startsWith("//")) return `https:${href}`
    if (href.startsWith("/")) return `https://www.law.go.kr${href}`
    return `https://www.law.go.kr/${href.replace(/^\./, "")}`
  } catch {
    return href
  }
}

function pickMainContainer($: CheerioAPI) {
  const candidates = ["#conScroll", "#conBody", "#concontent", ".con_box", ".conbox", ".view_wrap", "#content", "main", "body"]
  for (const sel of candidates) {
    const el = $(sel)
    if (el && el.length) return el.first()
  }
  return $("body")
}

function extractRegion($: CheerioAPI, joLabel?: string) {
  const root = pickMainContainer($)
  if (!joLabel) return root
  const needle = joLabel.replace(/\s+/g, "")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let start: any = null
  const searchSelectors = "h1, h2, h3, h4, dt, a, p, li, div, span"
  root.find(searchSelectors).each((_: number, el: Element) => {
    const txt = $(el).text().replace(/\s+/g, "")
    if (!start && txt.includes(needle)) {
      start = $(el)
      return false
    }
  })
  if (!start) return root
  const container = start.closest("li")
  if (!container.length) return start.closest("dd").length ? start.closest("dd") : start.closest("div").length ? start.closest("div") : start
  return container
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const urlParam = searchParams.get("url") || ""
  const lawName = searchParams.get("lawName") || ""
  const joLabel = searchParams.get("joLabel") || ""

  try {
    let targetUrl = urlParam
    if (!targetUrl) {
      if (!lawName || !joLabel) {
        return NextResponse.json({ error: "lawName 또는 url이 필요합니다." }, { status: 400 })
      }
      targetUrl = `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(joLabel)}`
    }
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      next: { revalidate: 3600 },
    })
    const ctype = res.headers.get("content-type") || ""
    const buf = Buffer.from(await res.arrayBuffer())
    let html = buf.toString("utf8")
    if (/euc-kr|ks_c_5601|ms949/i.test(ctype) || /charset=(euc-kr|ks_c_5601|ms949)/i.test(html)) {
      try { html = iconv.decode(buf, "euc-kr") } catch {}
    }
    const $ = load(html)
    const region = extractRegion($, joLabel)
    const links: Array<{ text: string; href: string }> = []
    region.find('a[href]').each((_: number, el: Element) => {
      const a = $(el)
      const text = a.text().trim()
      const href = absUrl(a.attr('href') || '')
      if (!text || !href) return
      // Filter out 제n항/제n호
      if (/제\s*\d+\s*항/.test(text) || /제\s*\d+\s*호/.test(text)) return
      // Deduplicate
      if (!links.some(l => l.text === text && l.href === href)) {
        links.push({ text, href })
      }
    })
    // Sort by text length desc to avoid nested replacements later
    links.sort((a, b) => b.text.length - a.text.length)
    return NextResponse.json({ links })
  } catch (e) {
    console.error('[law-links] error', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'unknown' }, { status: 500 })
  }
}
