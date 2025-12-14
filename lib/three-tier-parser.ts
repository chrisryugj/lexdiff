import { debugLogger } from "./debug-logger"
import type {
  ThreeTierArticle,
  ThreeTierData,
  ThreeTierMeta,
  DelegationItem,
  CitationItem,
} from "./law-types"

function normalizeWhitespace(text: string): string {
  return (text || "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim()
}

function normalizeDelegationTitle(title: string, joNum?: string): string {
  let t = normalizeWhitespace(title)
  if (!t) return ""

  // Common pattern from 3-tier API: "제10조(인사기록)" → "인사기록"
  const mParen = t.match(/^제\s*\d+\s*조(?:의\s*\d+)?\s*\(([^)]+)\)$/)
  if (mParen?.[1]) return normalizeWhitespace(mParen[1])

  // If title starts with joNum, strip it.
  const j = normalizeWhitespace(joNum || "").replace(/\s+/g, "")
  if (j) {
    const compact = t.replace(/\s+/g, "")
    if (compact.startsWith(j)) {
      t = t.substring(t.indexOf(j) + j.length).trim()
      t = t.replace(/^[\s:：-]+/, "").trim()
    }
  }

  // Strip leading "제N조/제N조의M" if still present.
  t = t.replace(/^제\s*\d+\s*조(?:의\s*\d+)?\s*/, "").trim()
  t = t.replace(/^[\s:：-]+/, "").trim()

  return t
}

function stripLeadingJoHeaderFromContent(content: string): string {
  if (!content) return ""
  const raw = content.trim()
  const m = raw.match(/^(제\s*\d+\s*조(?:의\s*\d+)?\s*(?:\([^)]+\))?)\s*([\s\S]*)$/)
  if (!m) return raw

  const header = m[1] || ""
  const body = (m[2] || "").trim()
  // Only strip when the header looks like a real 조문 헤더 (parentheses present).
  if (/\([^)]+\)/.test(header) && body) return body
  return raw
}

function pickBestLawName(a?: string, b?: string, type?: DelegationItem["type"], meta?: ThreeTierMeta): string {
  const aa = normalizeWhitespace(a || "")
  const bb = normalizeWhitespace(b || "")
  if (!aa) return bb
  if (!bb) return aa

  // Prefer names that are not the "default" 시행령/시행규칙 name from meta when duplicates exist.
  if (meta && type === "시행령") {
    const def = normalizeWhitespace(meta.sihyungryungName || "")
    if (def && aa === def && bb !== def) return bb
    if (def && bb === def && aa !== def) return aa
  }
  if (meta && type === "시행규칙") {
    const def = normalizeWhitespace(meta.sihyungkyuchikName || "")
    if (def && aa === def && bb !== def) return bb
    if (def && bb === def && aa !== def) return aa
  }

  // Otherwise prefer longer (more specific) name.
  return bb.length > aa.length ? bb : aa
}

function dedupeDelegations(items: DelegationItem[], meta: ThreeTierMeta): DelegationItem[] {
  const map = new Map<string, DelegationItem>()

  for (const item of items) {
    const key = item.jo ? `${item.type}|${item.jo}` : `${item.type}|${normalizeWhitespace(item.lawName || "")}|${normalizeWhitespace(item.title || "")}`
    const prev = map.get(key)
    if (!prev) {
      map.set(key, item)
      continue
    }

    const merged: DelegationItem = {
      ...prev,
      lawName: pickBestLawName(prev.lawName, item.lawName, item.type, meta),
      title: normalizeWhitespace(prev.title || "").length >= normalizeWhitespace(item.title || "").length ? prev.title : item.title,
      content: prev.content && prev.content.trim().length >= item.content.trim().length ? prev.content : item.content,
    }
    map.set(key, merged)
  }

  return Array.from(map.values())
}

/**
 * 조번호를 6자리 JO 코드로 변환
 * 예: "0038" + "00" => "003800"
 * 예: "0010" + "02" => "001002"
 */
function convertToJO(articleNum: string, branchNum: string = "00"): string {
  const article = articleNum.padStart(4, "0")
  const branch = branchNum.padStart(2, "0")
  return article + branch
}

/**
 * JO 코드를 한글 조문 표시로 변환
 * 예: "003800" => "제38조"
 * 예: "001002" => "제10조의2"
 */
function formatJoNum(jo: string): string {
  const articleNum = parseInt(jo.substring(0, 4), 10)
  const branchNum = parseInt(jo.substring(4, 6), 10)

  if (branchNum === 0) {
    return `제${articleNum}조`
  }
  return `제${articleNum}조의${branchNum}`
}

/**
 * 위임조문 3단비교 JSON 파싱 (knd=2)
 */
export function parseThreeTierDelegation(jsonData: any): ThreeTierData {

  try {
    const service = jsonData.LspttnThdCmpLawXService

    if (!service) {
      throw new Error("LspttnThdCmpLawXService 데이터가 없습니다")
    }

    const basicInfo = service.기본정보 || {}
    const meta: ThreeTierMeta = {
      lawId: basicInfo.법령ID || "",
      lawName: basicInfo.법령명 || "",
      lawSummary: basicInfo.법령요약정보 || "",
      sihyungryungId: basicInfo.시행령ID || "",
      sihyungryungName: basicInfo.시행령명 || "",
      sihyungryungSummary: basicInfo.시행령요약정보 || "",
      sihyungkyuchikId: basicInfo.시행규칙ID || "",
      sihyungkyuchikName: basicInfo.시행규칙명 || "",
      sihyungkyuchikSummary: basicInfo.시행규칙요약정보 || "",
      exists: basicInfo.삼단비교존재여부 === "Y",
      basis: basicInfo.삼단비교기준 || "L",
    }

    debugLogger.info("기본정보 파싱 완료", {
      lawName: meta.lawName,
      exists: meta.exists,
    })

    const articles: ThreeTierArticle[] = []
    const rawArticles = service.위임조문삼단비교?.법률조문

    if (!rawArticles) {
      debugLogger.warning("법률조문 데이터가 없습니다")
      return { meta, articles: [], kndType: "위임조문" }
    }

    const articleArray = Array.isArray(rawArticles) ? rawArticles : [rawArticles]

    // CRITICAL: 같은 법 조문에 대해 여러 시행령/시행규칙이 API에서 개별 객체로 올 수 있음
    // 예: 관세법 제38조 → 시행령 32조, 32조의2, 32조의3, 시행규칙 8조
    // 이들을 jo 코드별로 병합해야 함
    const articleMap = new Map<string, ThreeTierArticle>()

    for (const rawArticle of articleArray) {
      const articleNum = rawArticle.조번호 || "0000"
      const branchNum = rawArticle.조가지번호 || "00"
      const jo = convertToJO(articleNum, branchNum)
      const joNum = formatJoNum(jo)
      const title = rawArticle.조제목 || ""
      const content = rawArticle.조내용 || ""

      // 원본 데이터 구조 확인용 로그 (처음 1개만)
      if (articleArray.indexOf(rawArticle) === 0) {
        debugLogger.debug("첫 번째 조문 원본 JSON 구조", {
          조번호: rawArticle.조번호,
          전체키목록: Object.keys(rawArticle),
          시행령조문존재: !!rawArticle.시행령조문,
          시행규칙조문목록존재: !!rawArticle.시행규칙조문목록,
          위임행정규칙목록존재: !!rawArticle.위임행정규칙목록,
          원본데이터샘플: JSON.stringify(rawArticle).substring(0, 500)
        })
      }

      // 기존 조문 데이터가 있으면 가져오기, 없으면 새로 생성
      let article = articleMap.get(jo)
      if (!article) {
        article = {
          jo,
          joNum,
          title,
          content,
          delegations: [],
          citations: [],
        }
        articleMap.set(jo, article)
      }

      // 시행령조문 파싱
      if (rawArticle.시행령조문) {
        const sihyungryung = Array.isArray(rawArticle.시행령조문)
          ? rawArticle.시행령조문
          : [rawArticle.시행령조문]

        debugLogger.debug(`조문 ${formatJoNum(jo)} 시행령 ${sihyungryung.length}개 파싱`, {
          시행령데이터: sihyungryung.map(item => ({
            조번호: item.조번호,
            조가지번호: item.조가지번호,
            조제목: item.조제목,
            조내용길이: item.조내용?.length || 0
          }))
        })

        for (const item of sihyungryung) {
          const joCode = item.조번호 ? convertToJO(item.조번호, item.조가지번호 || "00") : undefined
          const joNumDisplay = joCode ? formatJoNum(joCode) : undefined
          const lawName = item.법령명 || item.시행령명 || item.법령명_한글 || meta.sihyungryungName
          const normalizedTitle = normalizeDelegationTitle(item.조제목 || "", joNumDisplay)
          article.delegations.push({
            type: "시행령",
            // CRITICAL: 일부 응답은 시행령 조문마다 법령명이 포함될 수 있음 (다른 시행령 혼재 케이스)
            lawName,
            jo: joCode,
            joNum: joNumDisplay,
            title: normalizedTitle,
            content: stripLeadingJoHeaderFromContent(item.조내용 || ""),
          })
        }
      } else {
        debugLogger.debug(`조문 ${formatJoNum(jo)} 시행령 데이터 없음`)
      }

      // 시행규칙조문 파싱 (시행령조문과 동일한 레벨)
      if (rawArticle.시행규칙조문) {
        const sihyungkyuchik = Array.isArray(rawArticle.시행규칙조문)
          ? rawArticle.시행규칙조문
          : [rawArticle.시행규칙조문]

        debugLogger.debug(`조문 ${formatJoNum(jo)} 시행규칙 ${sihyungkyuchik.length}개 파싱`, {
          시행규칙데이터: sihyungkyuchik.map(item => ({
            조번호: item.조번호,
            조가지번호: item.조가지번호,
            조제목: item.조제목,
            법령명: item.법령명,
            조내용길이: item.조내용?.length || 0,
            조내용미리보기: item.조내용 ? item.조내용.substring(0, 50) : "(empty)"
          }))
        })

        for (const item of sihyungkyuchik) {
          const joCode = item.조번호 ? convertToJO(item.조번호, item.조가지번호 || "00") : undefined
          const joNumDisplay = joCode ? formatJoNum(joCode) : undefined
          const lawName = item.법령명 || meta.sihyungkyuchikName
          const normalizedTitle = normalizeDelegationTitle(item.조제목 || "", joNumDisplay)
          article.delegations.push({
            type: "시행규칙",
            lawName,
            jo: joCode,
            joNum: joNumDisplay,
            title: normalizedTitle,
            content: stripLeadingJoHeaderFromContent(item.조내용 || ""),
          })
        }
      } else {
        debugLogger.debug(`조문 ${formatJoNum(jo)} 시행규칙 데이터 없음`)
      }

      // 위임행정규칙목록 파싱
      if (rawArticle.위임행정규칙목록?.위임행정규칙) {
        const rules = Array.isArray(rawArticle.위임행정규칙목록.위임행정규칙)
          ? rawArticle.위임행정규칙목록.위임행정규칙
          : [rawArticle.위임행정규칙목록.위임행정규칙]

        for (const item of rules) {
          article.delegations.push({
            type: "행정규칙",
            lawName: item.위임행정규칙명 || "",
            jo: item.위임행정규칙조번호
              ? convertToJO(item.위임행정규칙조번호, item.위임행정규칙조가지번호 || "00")
              : undefined,
            joNum: item.위임행정규칙조번호
              ? formatJoNum(convertToJO(item.위임행정규칙조번호, item.위임행정규칙조가지번호 || "00"))
              : undefined,
            title: "",
            content: "", // 행정규칙은 내용이 없을 수 있음
          })
        }
      }
    }

    // Map에서 배열로 변환 (위임조문이 있는 경우에만)
    for (const article of articleMap.values()) {
      if (article.delegations.length > 0) {
        article.delegations = dedupeDelegations(article.delegations, meta)
      }
      if (article.delegations.length > 0) {
        articles.push(article)
      }
    }


    return {
      meta,
      articles,
      kndType: "위임조문",
    }
  } catch (error) {
    debugLogger.error("위임조문 3단비교 파싱 오류", error)
    throw error
  }
}

/**
 * 인용조문 3단비교 JSON 파싱 (knd=1)
 */
export function parseThreeTierCitation(jsonData: any): ThreeTierData {

  try {
    const service = jsonData.ThdCmpLawXService

    if (!service) {
      throw new Error("ThdCmpLawXService 데이터가 없습니다")
    }

    const basicInfo = service.기본정보 || {}
    const meta: ThreeTierMeta = {
      lawId: basicInfo.법령ID || "",
      lawName: basicInfo.법령명 || "",
      lawSummary: basicInfo.법령요약정보 || "",
      sihyungryungId: basicInfo.시행령ID || "",
      sihyungryungName: basicInfo.시행령명 || "",
      sihyungryungSummary: basicInfo.시행령요약정보 || "",
      sihyungkyuchikId: basicInfo.시행규칙ID || "",
      sihyungkyuchikName: basicInfo.시행규칙명 || "",
      sihyungkyuchikSummary: basicInfo.시행규칙요약정보 || "",
      exists: basicInfo.삼단비교존재여부 === "Y",
      basis: basicInfo.삼단비교기준 || "L",
    }

    debugLogger.info("기본정보 파싱 완료", {
      lawName: meta.lawName,
      exists: meta.exists,
    })

    const articles: ThreeTierArticle[] = []
    const rawArticles = service.인용조문삼단비교?.법률조문

    if (!rawArticles) {
      debugLogger.warning("법률조문 데이터가 없습니다")
      return { meta, articles: [], kndType: "인용조문" }
    }

    const articleArray = Array.isArray(rawArticles) ? rawArticles : [rawArticles]


    for (const rawArticle of articleArray) {
      const articleNum = rawArticle.조번호 || "0000"
      const branchNum = rawArticle.조가지번호 || "00"
      const jo = convertToJO(articleNum, branchNum)
      const joNum = formatJoNum(jo)
      const title = rawArticle.조제목 || ""
      const content = rawArticle.조내용 || ""

      // 인용조문에서는 citations를 파싱
      // (현재 API 응답 구조에서 인용조문 데이터가 어떻게 구성되어 있는지 확인 필요)
      const citations: CitationItem[] = []

      // TODO: 인용조문 구조 확인 후 파싱 로직 추가

      articles.push({
        jo,
        joNum,
        title,
        content,
        delegations: [], // 인용조문 파싱에서는 위임조문 없음
        citations,
      })
    }


    return {
      meta,
      articles,
      kndType: "인용조문",
    }
  } catch (error) {
    debugLogger.error("인용조문 3단비교 파싱 오류", error)
    throw error
  }
}
