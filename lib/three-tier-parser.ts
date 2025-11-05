import { debugLogger } from "./debug-logger"
import type {
  ThreeTierArticle,
  ThreeTierData,
  ThreeTierMeta,
  DelegationItem,
  CitationItem,
} from "./law-types"

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
  debugLogger.info("위임조문 3단비교 파싱 시작")

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

    debugLogger.info(`법률조문 ${articleArray.length}개 파싱 시작`)

    for (const rawArticle of articleArray) {
      const articleNum = rawArticle.조번호 || "0000"
      const branchNum = rawArticle.조가지번호 || "00"
      const jo = convertToJO(articleNum, branchNum)
      const joNum = formatJoNum(jo)
      const title = rawArticle.조제목 || ""
      const content = rawArticle.조내용 || ""

      const delegations: DelegationItem[] = []

      // 시행령조문 파싱
      if (rawArticle.시행령조문) {
        const sihyungryung = Array.isArray(rawArticle.시행령조문)
          ? rawArticle.시행령조문
          : [rawArticle.시행령조문]

        for (const item of sihyungryung) {
          delegations.push({
            type: "시행령",
            lawName: meta.sihyungryungName,
            jo: item.조번호 ? convertToJO(item.조번호, item.조가지번호 || "00") : undefined,
            joNum: item.조번호 ? formatJoNum(convertToJO(item.조번호, item.조가지번호 || "00")) : undefined,
            title: item.조제목 || "",
            content: item.조내용 || "",
          })
        }
      }

      // 시행규칙조문목록 파싱
      if (rawArticle.시행규칙조문목록?.시행규칙조문) {
        const sihyungkyuchik = Array.isArray(rawArticle.시행규칙조문목록.시행규칙조문)
          ? rawArticle.시행규칙조문목록.시행규칙조문
          : [rawArticle.시행규칙조문목록.시행규칙조문]

        for (const item of sihyungkyuchik) {
          delegations.push({
            type: "시행규칙",
            lawName: meta.sihyungkyuchikName,
            jo: item.조번호 ? convertToJO(item.조번호, item.조가지번호 || "00") : undefined,
            joNum: item.조번호 ? formatJoNum(convertToJO(item.조번호, item.조가지번호 || "00")) : undefined,
            title: item.조제목 || "",
            content: item.조내용 || "",
          })
        }
      }

      // 위임행정규칙목록 파싱
      if (rawArticle.위임행정규칙목록?.위임행정규칙) {
        const rules = Array.isArray(rawArticle.위임행정규칙목록.위임행정규칙)
          ? rawArticle.위임행정규칙목록.위임행정규칙
          : [rawArticle.위임행정규칙목록.위임행정규칙]

        for (const item of rules) {
          delegations.push({
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

      // 조문 데이터 추가 (위임조문이 있는 경우에만)
      if (delegations.length > 0) {
        articles.push({
          jo,
          joNum,
          title,
          content,
          delegations,
          citations: [], // 위임조문 파싱에서는 인용조문 없음
        })
      }
    }

    debugLogger.success(`위임조문 파싱 완료: ${articles.length}개 조문 (위임조문 보유)`)

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
  debugLogger.info("인용조문 3단비교 파싱 시작")

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

    debugLogger.info(`법률조문 ${articleArray.length}개 파싱 시작`)

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

    debugLogger.success(`인용조문 파싱 완료: ${articles.length}개 조문`)

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
