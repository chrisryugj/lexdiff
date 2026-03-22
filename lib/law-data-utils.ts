/**
 * law-data-utils.ts
 *
 * Consolidated law data parsing utilities.
 * Previously duplicated across law-utils.ts, law-json-parser.ts,
 * law-parser-server.ts, admrul-parser.ts, law-xml-parser.tsx,
 * ai-answer-processor.ts, and revision-parser.ts.
 */

// ---------------------------------------------------------------------------
// Types for 항/호/목 hierarchy (law.go.kr API structure)
// ---------------------------------------------------------------------------

/** Content field can be a plain string, an array of strings, or an object with a content property */
type ContentValue = string | string[] | { content: string }

/** 목 (sub-item) within a 호 */
export interface MokContent {
  목내용?: ContentValue
}

/** 호 (item) within a 항, optionally containing 목 */
export interface HoContent {
  호내용?: ContentValue
  목?: MokContent[]
}

/** 항 (paragraph), optionally containing 호 */
export interface HangContent {
  항내용?: ContentValue
  호?: HoContent[]
}

// ---------------------------------------------------------------------------
// convertArticleNumberToCode
// ---------------------------------------------------------------------------

/**
 * Convert an article number (+ optional branch number) to a 6-digit JO code.
 *
 * @example
 * convertArticleNumberToCode(2, 0)   // { code: "000200", display: "제2조" }
 * convertArticleNumberToCode(38, 2)  // { code: "003802", display: "제38조의2" }
 * convertArticleNumberToCode("10")   // { code: "001000", display: "제10조" }
 */
export function convertArticleNumberToCode(
  articleNum: string | number,
  branchNum?: string | number,
): { code: string; display: string } {
  const mainNum =
    typeof articleNum === "string" ? Number.parseInt(articleNum, 10) : articleNum
  const branch = branchNum
    ? typeof branchNum === "string"
      ? Number.parseInt(branchNum, 10)
      : branchNum
    : 0

  if (isNaN(mainNum)) {
    return { code: "000000", display: "제0조" }
  }

  const code =
    mainNum.toString().padStart(4, "0") + branch.toString().padStart(2, "0")
  const display =
    branch > 0 ? `제${mainNum}조의${branch}` : `제${mainNum}조`

  return { code, display }
}

// ---------------------------------------------------------------------------
// flattenArrayContent
// ---------------------------------------------------------------------------

/**
 * Flatten a potentially nested array of strings into a single string,
 * filtering out `<img>` tags. Handles deeply nested arrays.
 *
 * @example
 * flattenArrayContent("hello")            // "hello"
 * flattenArrayContent(["a", ["b", "c"]])  // "a\nb\nc"
 */
export function flattenArrayContent(value: ContentValue | unknown): string {
  if (typeof value === "string") return value

  // Handle object with content property
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "content" in (value as Record<string, unknown>)
  ) {
    return (value as { content: string }).content || ""
  }

  if (!Array.isArray(value)) return ""

  const flatten = (arr: unknown[]): string[] => {
    const result: string[] = []
    for (const item of arr) {
      if (typeof item === "string") {
        // Exclude <img> tags (keep table borders and other HTML)
        if (!item.startsWith("<img") && !item.startsWith("</img")) {
          result.push(item)
        }
      } else if (Array.isArray(item)) {
        result.push(...flatten(item))
      }
    }
    return result
  }

  return flatten(value).join("\n")
}

// ---------------------------------------------------------------------------
// resolveContentValue  (internal helper)
// ---------------------------------------------------------------------------

/**
 * Resolve a ContentValue (string | string[] | { content }) to a plain string.
 * Uses flattenArrayContent for array/object cases and also handles
 * the `.map(c => ...)` pattern from law-parser-server.ts.
 */
function resolveContentValue(raw: ContentValue | undefined): string | null {
  if (raw === undefined || raw === null) return null

  if (typeof raw === "string") return raw

  if (Array.isArray(raw)) {
    return (raw as unknown[])
      .map((c) =>
        typeof c === "string"
          ? c
          : c && typeof c === "object" && "content" in (c as Record<string, unknown>)
            ? ((c as { content: string }).content || "")
            : "",
      )
      .join("\n")
  }

  // Object with content property
  if (typeof raw === "object" && "content" in raw) {
    return raw.content || ""
  }

  return null
}

// ---------------------------------------------------------------------------
// extractContentFromHangArray
// ---------------------------------------------------------------------------

/**
 * Extract text content from a 항 (paragraph) array, recursively processing
 * 호 (items) and 목 (sub-items).
 *
 * This is the most complete version, handling edge cases such as:
 * - 항내용 없고 호만 있는 경우 (e.g. 도로법 시행령 제55조)
 * - 항만 있고 항내용/호가 없는 경우
 * - 호만 있는 경우
 * - ContentValue being string, string[], or { content: string }
 *
 * @param hangArray - Array of 항 objects from the law.go.kr API
 * @returns Extracted text content (trimmed)
 */
export function extractContentFromHangArray(hangArray: HangContent[]): string {
  let content = ""

  if (!Array.isArray(hangArray)) {
    return content
  }

  // Check whether any 항 has meaningful 항내용
  const hasHangContent = hangArray.some((hang) => {
    const hangContent = hang.항내용
    if (!hangContent) return false

    if (Array.isArray(hangContent)) {
      return hangContent.some(
        (c) => c && typeof c === "string" && c.trim(),
      )
    }
    if (typeof hangContent === "string") {
      return hangContent.trim().length > 0
    }
    if (
      typeof hangContent === "object" &&
      "content" in hangContent &&
      hangContent.content
    ) {
      return hangContent.content.trim().length > 0
    }
    return false
  })

  // Collect all 호 across all 항
  const allItems: HoContent[] = hangArray.flatMap((hang) =>
    hang.호 && Array.isArray(hang.호) ? hang.호 : [],
  )

  if (hasHangContent) {
    // --- 항내용 exists: process each 항 normally ---
    for (const hang of hangArray) {
      if (hang.항내용) {
        const resolved = resolveContentValue(hang.항내용)
        if (resolved) {
          content += "\n" + resolved
        }
      }

      if (hang.호 && Array.isArray(hang.호)) {
        for (const ho of hang.호) {
          if (ho.호내용) {
            const resolved = resolveContentValue(ho.호내용)
            if (resolved) {
              content += "\n" + resolved
            }
          }

          if (ho.목 && Array.isArray(ho.목)) {
            for (const mok of ho.목) {
              if (mok.목내용) {
                const resolved = resolveContentValue(mok.목내용)
                if (resolved) {
                  content += "\n  " + resolved
                }
              }
            }
          }
        }
      }
    }
  } else if (allItems.length > 0) {
    // --- No 항내용, but 호 exist: output 호 directly ---
    for (const ho of allItems) {
      if (ho.호내용) {
        const resolved = resolveContentValue(ho.호내용)
        if (resolved) {
          content += "\n" + resolved
        }
      }

      if (ho.목 && Array.isArray(ho.목)) {
        for (const mok of ho.목) {
          if (mok.목내용) {
            const resolved = resolveContentValue(mok.목내용)
            if (resolved) {
              content += "\n  " + resolved
            }
          }
        }
      }
    }
  }

  return content.trim()
}

// ---------------------------------------------------------------------------
// escapeHtml
// ---------------------------------------------------------------------------

/**
 * Escape special HTML characters to prevent XSS and rendering issues.
 *
 * Handles: `&`, `<`, `>`, `"`, `'`
 *
 * @param text - Raw text to escape
 * @returns HTML-safe string
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

/**
 * Format a YYYYMMDD date string to a human-readable Korean format.
 *
 * @param dateStr - Date string in YYYYMMDD format
 * @param style   - Output style: `"korean"` for "2024년 01월 15일",
 *                  `"dash"` for "2024-01-15". Defaults to `"korean"`.
 * @returns Formatted date string, or the original string if invalid
 *
 * @example
 * formatDate("20240115")           // "2024년 01월 15일"
 * formatDate("20240115", "dash")   // "2024-01-15"
 * formatDate("")                   // ""
 */
export function formatDate(
  dateStr: string,
  style: "korean" | "dash" = "korean",
): string {
  if (!dateStr || dateStr.length !== 8) {
    return dateStr
  }

  const year = dateStr.substring(0, 4)
  const month = dateStr.substring(4, 6)
  const day = dateStr.substring(6, 8)

  if (style === "dash") {
    return `${year}-${month}-${day}`
  }

  return `${year}년 ${month}월 ${day}일`
}
