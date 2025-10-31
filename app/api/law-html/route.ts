import { NextResponse } from "next/server"
import { load } from "cheerio"
import sanitizeHtml from "sanitize-html"

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
  root.find("a, h2, h3, h4, p, li, div, span").each((_, el) => {
    const txt = $(el).text().replace(/\s+/g, "")
    if (!start && txt.includes(needle)) {
      start = $(el)
      return false
    }
  })
  if (!start) return root.html() || ""

  // Expand to a reasonable container (e.g., parent li or div)
  let container = start.closest("li")
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
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
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
    ]),
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
    const html = await res.text()
    const $ = load(html)
    const raw = extractArticleHtml($, joLabel || undefined)
    const sanitized = sanitizeKeepAnchors(raw)
    return NextResponse.json({ html: sanitized })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}

