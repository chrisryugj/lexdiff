import { NextResponse } from "next/server"
import { GoogleGenAI } from "@google/genai"
import { debugLogger } from "@/lib/debug-logger"

export async function POST(request: Request) {
  try {
    const { lawTitle, joNum, oldContent, newContent, effectiveDate, isPrecedent } = await request.json()

    // 판례 모드에서는 newContent만 필요
    if (!isPrecedent && (!oldContent || !newContent)) {
      return NextResponse.json({ error: "구법과 신법 내용이 필요합니다" }, { status: 400 })
    }
    if (isPrecedent && !newContent) {
      return NextResponse.json({ error: "판례 내용이 필요합니다" }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      debugLogger.error("GEMINI_API_KEY 환경 변수가 설정되지 않았습니다")
      return NextResponse.json(
        { error: "AI 서비스가 설정되지 않았습니다. GEMINI_API_KEY 환경 변수를 설정해주세요." },
        { status: 500 },
      )
    }

    debugLogger.info("AI 요약 생성 시작", { lawTitle, joNum, effectiveDate, isPrecedent })

    console.log("========== AI에 전달되는 데이터 ==========")
    console.log("모드:", isPrecedent ? "판례 요약" : "법령 비교")
    console.log("법령명/사건명:", lawTitle)
    console.log("조문:", joNum)
    console.log("시행일/선고일:", effectiveDate || "정보 없음")
    if (!isPrecedent) {
      console.log("구법 내용 길이:", oldContent?.length || 0, "자")
      console.log(oldContent?.substring(0, 500))
    }
    console.log("신법/판례 내용 길이:", newContent.length, "자")
    console.log(newContent.substring(0, 500))
    console.log("==========================================")

    const ai = new GoogleGenAI({ apiKey })

    // 판례 요약용 프롬프트
    const precedentPrompt = `시스템: 당신은 대한민국 법원 판례를 핵심적으로 분석하고 요약하는 전문가입니다.

사용자 맥락:
- 사건명: ${lawTitle}
${effectiveDate ? `- 선고일: ${effectiveDate}` : ""}
- 판결문 전문:
"""
${newContent.substring(0, 6000)}
"""

지시:
제시된 판례를 다음 형식으로 분석하세요.

1. **핵심 쟁점 (2~3줄)**
   - 이 사건의 핵심 법적 쟁점을 간결하게 요약
   - 원고와 피고의 주장을 명확하게 기술

2. **판결 요지 (2~3줄)**
   - 법원의 최종 판단과 그 근거를 요약
   - 적용된 주요 법리를 명시

3. **실무 시사점 (1~2줄)**
   - 이 판례가 실무에 주는 시사점
   - 유사 사건에서 주의해야 할 점

4. **관련 조문**
   - 판결에서 인용된 주요 법령 조문 나열

불필요한 서론, 표, 강조 기호, 이모티콘은 사용하지 마세요.
원문에 없는 내용은 추정하지 마세요.

출력 형식 예시:

[핵심 쟁점]
원고는 해당 거래가 제조업에 해당하여 지방세특례제한법상 취득세 감면 대상이라고 주장하였으나, 피고는 실제 사업 형태가 제조업에 해당하지 않는다고 반박하였습니다.

[판결 요지]
대법원은 제조업 해당 여부는 등록 업종이 아닌 실제 사업 내용과 작업 형태를 종합하여 판단해야 한다고 판시하였습니다. 원고의 사업이 실질적으로 제조업에 해당하는지 원심에서 심리가 부족하다고 보아 파기환송하였습니다.

[실무 시사점]
취득세 감면 적용 시 사업자등록 업종만으로 판단하지 말고, 실제 사업 운영 형태를 종합적으로 검토해야 합니다.

[관련 조문]
- 지방세특례제한법 제58조의3
- 상고심절차에 관한 특례법 제4조`

    // 법령 비교용 프롬프트
    const lawComparePrompt = `시스템: 당신은 핵심을 명확하게 전달하는 대한민국 법령 개정 비교 분석가입니다.

사용자 맥락:
- 법령명: ${lawTitle}
- 조문: ${joNum}
${effectiveDate ? `- 시행일: ${effectiveDate}` : ""}
- 구법 본문(발췌):
"""
${oldContent.substring(0, 2000)}
"""
- 신법 본문(발췌):
"""
${newContent.substring(0, 2000)}
"""

지시:
제시된 구법과 신법을 비교하여 다음 형식으로 분석하세요.

1. **핵심 차이점 요약 (2~3줄)**
   - 이번 개정의 가장 중요한 변경사항을 2~3줄로 간결하게 요약
   - 무엇이 어떻게 바뀌었는지 명확하게 기술

2. **실무 영향 분석 (1줄)**
   - 이 변경이 실무에 미치는 영향을 1줄로 요약
   - 납세자, 기업, 공무원 등 실무 담당자 관점에서 작성

3. **세부 변경사항**
   각 변경점은 다음 형식으로 작성:
   - 첫 문장: 무엇이 어떻게 변경되었는지 명확하게 기술
   - 두 번째 문장(선택): 변경의 의미나 영향을 간단히 설명
   - 마지막에 변경 카테고리를 괄호로 표시: (용어 변경), (실질 내용 변경), (시행일 관련)

불필요한 서론, 제목, 표, 강조 기호, 이모티콘은 사용하지 마세요.
추정 금지. 원문 근거가 없으면 "불명확"이라고 표시하세요.

출력 형식 예시:

[핵심 차이점]
기획재정부령으로 규정되던 권한이 기획재정부장관으로 변경되고, 국세와 관세 간 과세가격 조정 신청 절차가 신설되었습니다. 납세자는 통지를 받은 날로부터 30일 내에 조정을 신청할 수 있습니다.

[실무 영향]
납세자는 국세와 관세의 과세가격 불일치 시 조정 신청이 가능해져 이중과세 위험이 감소합니다.

[세부 변경사항]
- 제2항에서 "기획재정부령"이 "기획재정부장관"으로 변경되었습니다. 이는 권한 주체를 부처의 규칙에서 장관으로 명확히 한 것입니다. (용어 변경)
- 제4항에 국세의 정상가격과 관세의 과세가격 간의 조정 신청 절차가 신설되었습니다. 납세자는 통지를 받은 날로부터 30일 내에 기획재정부장관에게 조정을 신청할 수 있습니다. (실질 내용 변경)`

    // 모드에 따라 프롬프트 선택
    const prompt = isPrecedent ? precedentPrompt : lawComparePrompt

    console.log("========== Gemini에 전달되는 프롬프트 ==========")
    console.log(prompt)
    console.log("================================================")

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: prompt,
    })

    const summary = response.text

    debugLogger.success("AI 요약 생성 완료", { length: summary.length })

    return NextResponse.json({ summary })
  } catch (error) {
    debugLogger.error("AI 요약 생성 실패", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI 요약 생성 중 오류가 발생했습니다" },
      { status: 500 },
    )
  }
}
