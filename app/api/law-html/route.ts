import { NextResponse } from "next/server"
import { load } from "cheerio"
import sanitizeHtml from "sanitize-html"
import iconv from "iconv-lite"

/**
 * 개정 태그 키워드를 4가지 타입으로 분류
 */
function getRevisionType(keyword: string): 'new' | 'edit' | 'delete' | 'etc' {
  if (/신설/.test(keyword)) return 'new'
  if (/삭제/.test(keyword)) return 'delete'
  if (/개정|전문개정|전부개정|제정/.test(keyword)) return 'edit'
  return 'etc'
}

function absUrl(href: string): string {
  try {
    if (!href) return ""
    if (/^https?:/i.test(href)) return href
    if (href.startsWith("//")) return `https:${href}`
    if (href.startsWith("/")) return `https://www.law.go.kr${href}`
    return `https://www.law.go.kr/${href.replace(/^\./, "")}`
  } catch {
    return href
  }
}

function pickMainContainer($: cheerio.CheerioAPI) {
  const candidates = ["#conScroll", "#contentBody", "#conBody", "#concontent", ".con_box", ".conbox", ".view_wrap", "#content", "main"]
  for (const sel of candidates) {
    const el = $(sel)
    if (el && el.length) return el.first()
  }
  return $("body")
}

function extractArticleHtml($: cheerio.CheerioAPI, joLabel?: string) {
  const root = pickMainContainer($)
  if (!joLabel) return root.html() || ""
  const needle = joLabel.replace(/\s+/g, "")
  let start: cheerio.Cheerio | null = null
  const searchSelectors = "h1, h2, h3, h4, dt, a, p, li, div, span"
  root.find(searchSelectors).each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, "")
    if (!start && txt.includes(needle)) { start = $(el); return false }
  })
  if (!start) return root.html() || ""

  let container = start.closest("li")
  if (!container.length) container = start.closest("dd")
  if (!container.length) container = start.closest("div")
  if (!container.length) container = start

  const nodes: string[] = []
  let cur: cheerio.Cheerio | null = container
  let steps = 0
  const limit = 60
  while (cur && cur.length && steps < limit) {
    nodes.push($.html(cur) || "")
    const next = cur.next()
    if (!next.length) break
    const thisText = cur.text()
    if (/\[(?:개정|전문개정|전부개정|신설|삭제)[^\]]*\]/.test(thisText) || /＜\s*(?:개정|전문개정|전부개정|신설|삭제)[^＞]*＞/.test(thisText)) break
    const t = next.text().trim()
    if (/^제\s*\d+\s*조/.test(t)) break
    cur = next
    steps++
  }
  return nodes.join("\n")
}

function sanitizeKeepAnchors(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: Array.from(new Set([
      ...sanitizeHtml.defaults.allowedTags,
      "img", "span", "table", "thead", "tbody", "tr", "td", "th", "sup", "sub", "dl", "dt", "dd",
    ])),
    allowedAttributes: {
      a: ["href", "title", "class", "id", "data-href", "target", "rel"],
      img: ["src", "alt"],
      '*': ["class", "id"],
    },
  })
}

function rewriteAnchorsKeepHref(fragmentHtml: string): string {
  const $ = load(fragmentHtml)
  $("a").each((_, el) => {
    const a = $(el)
    let href = (a.attr("href") || "").toString()
    const onclick = (a.attr("onclick") || "").toString()
    if (/^javascript\s*:\s*;?$/i.test(href) || /#AJAX/i.test(href)) {
      const mPath = onclick.match(/['"](\/[^'"\s]+\.(?:do|jsp)(?:\?[^'"\s]*)?)['"]/i) || onclick.match(/['"](\/법령\/[^"]+)['"]/)
      if (mPath && mPath[1]) href = `https://www.law.go.kr${mPath[1]}`
    }
    const abs = absUrl(href)
    if (abs) {
      a.attr("href", abs)
      a.addClass("law-html-link")
      a.attr("data-href", abs)
      a.attr("target", "_blank").attr("rel", "noopener noreferrer")
    }
  })
  return $("body").html() || $.root().html() || fragmentHtml
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const urlParam = searchParams.get("url") || ""
  const lawName = searchParams.get("lawName") || ""
  const joLabel = searchParams.get("joLabel") || ""
  const debug = searchParams.get("debug") === "1"

  try {
    let targetUrl = urlParam
    if (!targetUrl) {
      if (!lawName || !joLabel) {
        return NextResponse.json({ error: "lawName 또는 url이 필요합니다." }, { status: 400 })
      }
      targetUrl = `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}/${encodeURIComponent(joLabel)}`
    }

    // If the incoming URL is a DRF endpoint, ensure OC is present
    try {
      const LAW_OC = process.env.LAW_OC || ""
      const u = new URL(targetUrl, "https://www.law.go.kr")
      if (u.pathname.includes("/DRF/lawService.do") && LAW_OC && !u.searchParams.has("OC")) {
        u.searchParams.set("OC", LAW_OC)
        targetUrl = u.toString()
      }
    } catch {}

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
    let raw = extractArticleHtml($, joLabel || undefined)
    raw = raw.replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br/>').replace(/^\s*(<br\s*\/?>\s*)+/i, '').replace(/(<br\s*\/?>\s*)+$/i, '')
    raw = raw
      .replace(/\[(?:개정|전문개정|전부개정|신설|삭제)[^\]]*\]/g, (match) => {
        const keyword = match.match(/개정|전문개정|전부개정|신설|삭제/)?.[0] || ''
        const type = getRevisionType(keyword)
        return `<span class="rev-mark rev-mark-${type}">${match}</span>`
      })
      .replace(/<\s*(?:개정|전문개정|전부개정|신설|삭제)[^>]*>/g, (m) => {
        const keyword = m.match(/개정|전문개정|전부개정|신설|삭제/)?.[0] || ''
        const type = getRevisionType(keyword)
        return `<span class="rev-mark rev-mark-${type}">${m.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`
      })
    const withAnchors = rewriteAnchorsKeepHref(raw)
    let sanitized = sanitizeKeepAnchors(withAnchors)
    // Robust fallbacks
    const trimmedLen = sanitized.replace(/<[^>]+>/g, "").trim().length
    if (trimmedLen < 10) {
      let all = pickMainContainer($).html() || ""
      all = rewriteAnchorsKeepHref(all)
      sanitized = sanitizeKeepAnchors(all)
    }
    // If still too short, fallback to whole document
    if (sanitized.replace(/<[^>]+>/g, "").trim().length < 10) {
      let whole = rewriteAnchorsKeepHref(html)
      sanitized = sanitizeKeepAnchors(whole)
    }
    if (debug) {
      console.log("[law-html] url:", targetUrl)
      console.log("[law-html] joLabel:", joLabel)
      console.log("[law-html] sanitized length:", sanitized.length)
    }
    return NextResponse.json({ html: sanitized })
  } catch (e) {
    console.error("[law-html] error:", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
