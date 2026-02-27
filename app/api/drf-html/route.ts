import { NextResponse } from "next/server"
import { load, type CheerioAPI, type Cheerio, type Element } from "cheerio"
import sanitizeHtml from "sanitize-html"
import iconv from "iconv-lite"
import { buildJO } from "@/lib/law-parser"

function ensureOc(url: string, oc: string): string {
  try {
    const u = new URL(url, DRF_BASE)
    if (u.pathname.includes("/DRF/lawService.do") && !u.searchParams.has("OC")) {
      u.searchParams.set("OC", oc)
    }
    return u.toString()
  } catch {
    return url
  }
}

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
        ...(sanitizeHtml.defaults.allowedTags || []),
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

// Build readable 조문 라벨 from 6-digit JO (e.g., 003900 -> 제39조)
function joLabelFromJoCode(jo?: string) {
  if (!jo) return undefined
  if (!/^\d{6}$/.test(jo)) return jo
  const a = parseInt(jo.slice(0, 4), 10)
  const b = parseInt(jo.slice(4, 6), 10)
  return b === 0 ? `제${a}조` : `제${a}조의${b}`
}

// Extract region starting at '제n조(조문제목)' and ending right AFTER the first bracketed amendment mark like [개정 2024.12.31]
function extractArticleRegionAfterAmend($: CheerioAPI, jo?: string) {
  const label = joLabelFromJoCode(jo)
  const root = $("body")
  if (!label) return root
  const needle = label.replace(/\s+/g, "")

  // 1) find start node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let start: any = null
  const sels = "h1,h2,h3,h4,dt,p,div,li,span"
  root.find(sels).each((_: number, el: Element) => {
    const txt = $(el).text().replace(/\s+/g, "")
    if (!start && txt.startsWith(needle)) {
      start = $(el)
      return false
    }
  })
  if (!start) return root

  // 2) choose container
  let container = start.closest("li")
  if (!container.length) container = start.closest("dd")
  if (!container.length) container = start.closest("div")
  if (!container.length) container = start

  // 3) collect until AFTER first bracketed amendment mark
  const out = $("<div></div>")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cur: any = container
  let steps = 0
  // handles [개정 2024.12.31], [전문개정 2024.12.31], ＜개정 2024.12.31＞ 등
  const amendBracket = /\[(?:개정|전문개정|전부개정|신설|삭제)[^\]]*\]|＜\s*(?:개정|전문개정|전부개정|신설|삭제)[^＞]*＞/;
  while (cur && cur.length && steps < 200) {
    out.append($.html(cur) || "")
    // if current node contains bracketed amend mark, stop AFTER including it
    if (amendBracket.test(cur.text())) break
    const next = cur.next()
    if (!next.length) break
    // stop at next article start to avoid leaking to next 조문
    const t = next.text().trim()
    if (/^제\s*\d+\s*조/.test(t)) break
    cur = next
    steps++
  }
  return out
}

function rewriteAnchors(
  $: CheerioAPI,
  ctx: { lawId?: string; lawTitle?: string } = {},
) {
  $("a[href]").each((_: number, el: Element) => {
    const a = $(el)
    const text = a.text().trim()
    const href = (a.attr("href") || "").toString()
    const onclick = (a.attr("onclick") || "").toString()
    // Remove same-article paragraph/item anchors
    if (/제\s*\d+\s*항/.test(text) || /제\s*\d+\s*호/.test(text)) {
      a.replaceWith(text)
      return
    }

    // 1) javascript: or onclick handlers that embed params
    const jsLike = /^javascript\s*:\s*;?$/i.test(href) || /#AJAX/i.test(href) || onclick.length > 0
    if (jsLike) {
      const src = `${href} ${onclick}`
      const idMatch = src.match(/ID\s*=\s*(\d{4,})/i) || src.match(/\b(\d{6,})\b/)
      const mstMatch = src.match(/MST\s*=\s*([0-9]+)/i)
      const joMatch = src.match(/JO\s*=\s*(\d{6})/i) || src.match(/제\s*\d+\s*조(의\s*\d+)?/)
      const efMatch = src.match(/efYd\s*=\s*(\d{8})/i)
      const id = idMatch?.[1]
      const mst = mstMatch?.[1]
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
      // Try to extract viewer-relative URL from the handler, e.g. '/법령/국세징수법/제12조' or '/LSW/lsInfoP.do?...'
      const pathMatch = src.match(/['"](\/[^'"\s]+\.(?:do|jsp)(?:\?[^'"\s]*)?)['"]/i) || src.match(/['"](\/법령\/[^"]+)['"]/)
      if (pathMatch && pathMatch[1]) {
        const abs = `https://www.law.go.kr${pathMatch[1]}`
        a.attr("href", abs).addClass("law-html-link").attr("data-href", abs)
        a.attr("target", "_blank").attr("rel", "noopener noreferrer")
        return
      }
      // Same-law ‘제n조’ without id → use current lawId
      if (!id && !mst && ctx.lawId && /제\s*\d+\s*조/.test(text)) {
        let sameJo = ""; try { sameJo = buildJO(text) } catch {}
        if (sameJo) {
          const sp = new URLSearchParams({ target: "eflaw", type: "HTML", ID: ctx.lawId, JO: sameJo })
          const abs = `${DRF_BASE}?${sp.toString()}`
          a.attr("href", abs).addClass("law-drf-link law-html-link").attr("data-href", abs).attr("data-jo", sameJo)
          a.attr("target", "_blank").attr("rel", "noopener")
          return
        }
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
    if (abs && !/^https?:\/\/www\.law\.go\.kr\/javascript:;?$/i.test(abs) && !/#AJAX/i.test(abs)) {
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
        const abs = ensureOc(new URL(iframeSrc, DRF_BASE).toString(), OC)
        console.log("[drf-html] following frame:", abs)
        const fr = await fetch(abs, { next: { revalidate: 1800 } })
        const fctype = fr.headers.get("content-type") || ""
        const fbuf = Buffer.from(await fr.arrayBuffer())
        let fhtml = fbuf.toString("utf8")
        if (/euc-kr|ks_c_5601|ms949/i.test(fctype) || /charset=(euc-kr|ks_c_5601|ms949)/i.test(fhtml)) {
          try { fhtml = iconv.decode(fbuf, "euc-kr") } catch {}
        }
        const _$ = load(fhtml)
        // First rewrite anchors on the whole doc, then slice the region so links persist
        rewriteAnchors(_$, { lawId })
        const region = extractArticleRegionAfterAmend(_$, joParam)
        bodyHtml = region.html() || _$("body").html() || _$.root().html() || fhtml
        console.log("[drf-html] frame content-type:", fctype, "len:", bodyHtml.length)
      } catch (frameErr) {
        console.log("[drf-html] frame fetch failed", frameErr)
      }
    } else {
      // Rewrite first, then extract region
      rewriteAnchors($, { lawId })
      const region = extractArticleRegionAfterAmend($, joParam)
      bodyHtml = region.html() || bodyHtml
    }
    // Normalize excessive line breaks
    let collapsed = (bodyHtml || "").replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br/>')
    collapsed = collapsed.replace(/^\s*(<br\s*\/?>\s*)+/i, '')
    collapsed = collapsed.replace(/(<br\s*\/?>\s*)+$/i, '')
    // Highlight amendment marks
    collapsed = collapsed
      .replace(/\[(?:개정|전문개정|전부개정|신설|삭제)[^\]]*\]/g, '<span class="rev-mark">$&</span>')
      .replace(/<\s*(?:개정|전문개정|전부개정|신설|삭제)[^>]*>/g, (m) => `<span class="rev-mark">${m.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</span>`)
    const safe = sanitizeKeepAnchors(collapsed)
    console.log("[drf-html] content-type:", ctype, "len:", bodyHtml.length, "sanitized:", safe.length)
    return NextResponse.json({ html: safe })
  } catch (e) {
    console.error("[drf-html] error", e)
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
