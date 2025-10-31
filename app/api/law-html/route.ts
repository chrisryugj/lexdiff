import { NextResponse } from "next/server"
import { load } from "cheerio"
import sanitizeHtml from "sanitize-html"
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

function pickMainContainer($: cheerio.CheerioAPI) {
  // Try a set of known containers; fallback to body
  const candidates = [
    "#conScroll",
    "#conBody",
    "#concontent",
    ".con_box",
    ".conbox",
    ".view_wrap",
    "#content",
    "main",
  ]
  for (const sel of candidates) {
    const el = $(sel)
    if (el && el.length) return el.first()
  }
  return $("body")
}

function extractArticleHtml($: cheerio.CheerioAPI, joLabel?: string) {
  const root = pickMainContainer($)
  if (!joLabel) return root.html() || ""

  // Find a node that contains the joLabel text
  const needle = joLabel.replace(/\s+/g, "")
  let start: cheerio.Cheerio | null = null
  // Prefer headings or dl/dt first
  const searchSelectors = "h1, h2, h3, h4, dt, a, p, li, div, span"
  root.find(searchSelectors).each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, "")
    if (!start && txt.includes(needle)) {
      start = $(el)
      return false
    }
  })
  if (!start) return root.html() || ""

  // Expand to a reasonable container (e.g., parent li or div)
  let container = start.closest("li")
  if (!container.length) container = start.closest("dd")
  if (!container.length) container = start.closest("div")
  if (!container.length) container = start

  // Collect until next article header-like node
  const nodes: string[] = []
  let cur: cheerio.Cheerio | null = container
  const limit = 40 // safety cap
  let steps = 0
  while (cur && cur.length && steps < limit) {
    nodes.push($.html(cur) || "")
    const next = cur.next()
    if (!next.length) break
    const t = next.text().trim()
    if (/^제\s*\d+\s*조/.test(t)) break // next article
    cur = next
    steps++
  }
  return nodes.join("\n")
}

function sanitizeKeepAnchors(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: Array.from(new Set([
      ...sanitizeHtml.defaults.allowedTags,
      "img",
      "span",
      "table",
      "thead",
      "tbody",
      "tr",
      "td",
      "th",
      "sup",
      "sub",
      "dl",
      "dt",
      "dd",
    ])),
    allowedAttributes: {
      a: ["href", "title", "class", "id", "data-href"],
      img: ["src", "alt"],
      '*': ["class", "id", "style"],
    },
    transformTags: {
      a: (tagName, attribs) => {
        const href = absUrl(attribs.href || "")
        return {
          tagName: "a",
          attribs: { class: "law-html-link", href: "#", "data-href": href, title: attribs.title || "" },
        }
      },
    },
    // Keep line breaks readable
    textFilter: (text) => text,
  })
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

    // Fetch viewer HTML
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
    const raw = extractArticleHtml($, joLabel || undefined)
    let sanitized = sanitizeKeepAnchors(raw)
    // Fallback: if result looks too short, use whole container
    if (!sanitized || sanitized.replace(/<[^>]+>/g, "").trim().length < 10) {
      const all = pickMainContainer($).html() || ""
      sanitized = sanitizeKeepAnchors(all)
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
