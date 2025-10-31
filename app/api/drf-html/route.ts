import { NextResponse } from "next/server"
import { load } from "cheerio"
import sanitizeHtml from "sanitize-html"
import iconv from "iconv-lite"
import { buildJO } from "@/lib/law-parser"

const DRF_BASE = "https://www.law.go.kr/DRF/lawService.do"
const OC = process.env.LAW_OC || ""

function buildParams(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v) sp.set(k, v)
  })
  return sp
}

function sanitizeKeepAnchors(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: Array.from(
      new Set([
        ...sanitizeHtml.defaults.allowedTags,
        "a",
        "span",
        "table",
        "thead",
        "tbody",
        "tr",
        "td",
        "th",
        "ul",
        "ol",
        "li",
        "sup",
        "sub",
        "br",
      ]),
    ),
    allowedAttributes: {
      a: ["href", "title", "target", "rel", "class", "data-law-id", "data-jo", "data-efyd"],
      '*': ["class", "id"],
    },
  })
}

function rewriteAnchors($: cheerio.CheerioAPI) {
  $("a[href]").each((_, el) => {
    const a = $(el)
    const text = a.text().trim()
    const href = a.attr("href") || ""
    // Remove same-article paragraph/item anchors
    if (/제\s*\d+\s*항/.test(text) || /제\s*\d+\s*호/.test(text)) {
      a.replaceWith(text)
      return
    }

    try {
      const u = new URL(href, DRF_BASE)
      if (u.pathname.includes("/DRF/lawService.do")) {
        const id = u.searchParams.get("ID") || ""
        const mst = u.searchParams.get("MST") || ""
        const jo = u.searchParams.get("JO") || ""
        const efyd = u.searchParams.get("efYd") || ""
        if (id || mst) {
          a.attr("href", "#")
          a.attr("class", (a.attr("class") || "") + " law-drf-link")
          if (id) a.attr("data-law-id", id)
          if (mst) a.attr("data-law-id", mst) // treat MST as id for our proxy
          if (jo) a.attr("data-jo", jo)
          if (efyd) a.attr("data-efyd", efyd)
          a.removeAttr("target")
          a.attr("rel", "noopener")
          return
        }
      }
      // External link: keep as new tab
      a.attr("target", "_blank")
      a.attr("rel", "noopener noreferrer")
    } catch {
      // leave as-is
    }
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lawId = searchParams.get("lawId") || searchParams.get("mst") || ""
  const jo = searchParams.get("jo") || ""
  const efYd = searchParams.get("efYd") || ""
  if (!OC) return NextResponse.json({ error: "LAW_OC is required" }, { status: 500 })
  if (!lawId) return NextResponse.json({ error: "lawId (or mst) is required" }, { status: 400 })

  try {
    // Normalize JO to 6-digit code if given as '제N조(의M)'
    let joParam: string | undefined = undefined
    if (jo) {
      if (/^\d{6}$/.test(jo)) joParam = jo
      else {
        try { joParam = buildJO(jo) } catch { joParam = undefined }
      }
    }
    const sp = buildParams({ target: "eflaw", type: "HTML", OC, ID: lawId, JO: joParam, efYd: efYd || undefined })
    const url = `${DRF_BASE}?${sp.toString()}`
    const res = await fetch(url, { next: { revalidate: 1800 } })
    const ctype = res.headers.get("content-type") || ""
    const buf = Buffer.from(await res.arrayBuffer())
    let html = buf.toString("utf8")
    if (/euc-kr|ks_c_5601|ms949/i.test(ctype) || /charset=(euc-kr|ks_c_5601|ms949)/i.test(html)) {
      try { html = iconv.decode(buf, "euc-kr") } catch {}
    }
    const $ = load(html)
    rewriteAnchors($)
    const bodyHtml = $("body").html() || $.root().html() || html
    const safe = sanitizeKeepAnchors(bodyHtml)
    return NextResponse.json({ html: safe })
  } catch (e) {
    console.error("[drf-html] error", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
