import { NextResponse } from "next/server"
import { load } from "cheerio"
import sanitizeHtml from "sanitize-html"
import iconv from "iconv-lite"
import { buildJO } from "@/lib/law-parser"

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
        "dl",
        "dt",
        "dd",
      ]),
    ),
    allowedAttributes: {
      a: ["href", "title", "target", "rel", "class", "data-law-id", "data-jo", "data-efyd", "data-mst", "data-href"],
      '*': ["class", "id"],
    },
  })
}

function rewriteAnchors($: cheerio.CheerioAPI) {
  $("a[href]").each((_, el) => {
    const a = $(el)
    const text = a.text().trim()
    const href = a.attr("href") || ""
    const onclick = (a.attr("onclick") || "").toString()
    // Remove same-article paragraph/item anchors
    if (/제\s*\d+\s*항/.test(text) || /제\s*\d+\s*호/.test(text)) {
      a.replaceWith(text)
      return
    }

    // 1) javascript: or onclick handlers that embed params
    const jsLike = href.startsWith("javascript:") || onclick
    if (jsLike) {
      const src = `${href} ${onclick}`
      const idMatch = src.match(/ID\s*=\s*([0-9]+)/i) || src.match(/"(\d{6,})"/)
      const mstMatch = src.match(/MST\s*=\s*([0-9]+)/i)
      const joMatch = src.match(/JO\s*=\s*(\d{6})/i) || src.match(/제\s*\d+\s*조(의\s*\d+)?/)
      const efMatch = src.match(/efYd\s*=\s*(\d{8})/i)
      const id = idMatch?.[1] || ""
      const mst = mstMatch?.[1] || ""
      let joCode = joMatch?.[1] || ""
      if (!joCode && joMatch) {
        try { joCode = buildJO(joMatch[0]) } catch {}
      }
      if (id || mst) {
        const drfSp = new URLSearchParams({ target: "eflaw", type: "HTML" })
        if (id) drfSp.set("ID", id)
        if (mst) drfSp.set("MST", mst)
        if (joCode) drfSp.set("JO", joCode)
        if (efMatch?.[1]) drfSp.set("efYd", efMatch[1])
        const abs = `${DRF_BASE}?${drfSp.toString()}`
        a.attr("href", abs).addClass("law-drf-link law-html-link").attr("data-href", abs)
        if (id) a.attr("data-law-id", id)
        if (mst) a.attr("data-mst", mst)
        if (joCode) a.attr("data-jo", joCode)
        if (efMatch?.[1]) a.attr("data-efyd", efMatch[1])
        a.attr("target", "_blank").attr("rel", "noopener")
        return
      }
    }

    // 2) Normal href that points to DRF
    try {
      const u = new URL(href, DRF_BASE)
      if (u.pathname.includes("/DRF/lawService.do")) {
        const id = u.searchParams.get("ID") || ""
        const mst = u.searchParams.get("MST") || ""
        const jo = u.searchParams.get("JO") || ""
        const efyd = u.searchParams.get("efYd") || ""
        if (id || mst) {
          const drfSp = new URLSearchParams({ target: "eflaw", type: "HTML" })
          if (id) drfSp.set("ID", id)
          if (mst) drfSp.set("MST", mst)
          if (jo) drfSp.set("JO", jo)
          if (efyd) drfSp.set("efYd", efyd)
          const abs = `${DRF_BASE}?${drfSp.toString()}`
          a.attr("href", abs).addClass("law-drf-link law-html-link").attr("data-href", abs)
          if (id) a.attr("data-law-id", id)
          if (mst) a.attr("data-mst", mst)
          if (jo) a.attr("data-jo", jo)
          if (efyd) a.attr("data-efyd", efyd)
          a.attr("target", "_blank").attr("rel", "noopener")
          return
        }
      }
    } catch {}

    // 3) Fallback: keep external link but route through law-html proxy for modal
    const abs = absUrl(href)
    if (abs) {
      a.attr("href", abs).addClass("law-html-link").attr("data-href", abs).attr("title", a.attr("title") || "연결된 본문 열기").attr("target", "_blank").attr("rel", "noopener noreferrer")
      return
    }
  })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const lawId = searchParams.get("lawId") || ""
  const mstParam = searchParams.get("mst") || ""
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
    const sp = buildParams({ target: "eflaw", type: "HTML", OC, ID: lawId || undefined, MST: mstParam || undefined, JO: joParam, efYd: efYd || undefined })
    const url = `${DRF_BASE}?${sp.toString()}`
    console.log("[drf-html] fetch:", url)
    const res = await fetch(url, { next: { revalidate: 1800 } })
    const ctype = res.headers.get("content-type") || ""
    const buf = Buffer.from(await res.arrayBuffer())
    let html = buf.toString("utf8")
    if (/euc-kr|ks_c_5601|ms949/i.test(ctype) || /charset=(euc-kr|ks_c_5601|ms949)/i.test(html)) {
      try { html = iconv.decode(buf, "euc-kr") } catch {}
    }
    const $ = load(html)
    // Some DRF HTML responses embed content in an iframe; follow it
    let bodyHtml = $("body").html() || $.root().html() || html
    const iframeSrc = $("iframe[src], frame[src]").first().attr("src")
    if (iframeSrc) {
      try {
        const abs = new URL(iframeSrc, DRF_BASE).toString()
        console.log("[drf-html] following frame:", abs)
        const fr = await fetch(abs, { next: { revalidate: 1800 } })
        const fctype = fr.headers.get("content-type") || ""
        const fbuf = Buffer.from(await fr.arrayBuffer())
        let fhtml = fbuf.toString("utf8")
        if (/euc-kr|ks_c_5601|ms949/i.test(fctype) || /charset=(euc-kr|ks_c_5601|ms949)/i.test(fhtml)) {
          try { fhtml = iconv.decode(fbuf, "euc-kr") } catch {}
        }
        const _$ = load(fhtml)
        rewriteAnchors(_$)
        bodyHtml = _$("body").html() || _$.root().html() || fhtml
        console.log("[drf-html] frame content-type:", fctype, "len:", bodyHtml.length)
      } catch (frameErr) {
        console.log("[drf-html] frame fetch failed", frameErr)
      }
    } else {
      rewriteAnchors($)
    }
    const safe = sanitizeKeepAnchors(bodyHtml)
    console.log("[drf-html] content-type:", ctype, "len:", bodyHtml.length, "sanitized:", safe.length)
    return NextResponse.json({ html: safe })
  } catch (e) {
    console.error("[drf-html] error", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
