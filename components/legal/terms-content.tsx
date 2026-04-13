import { TERMS_VERSION } from '@/lib/privacy/consent-versions'

/**
 * 이용약관 본문 — 페이지와 모달에서 공유.
 * 바깥 <main>/<header> 없이 순수 컨텐츠만 렌더링.
 */
export function TermsContent() {
  return (
    <div>
      <header className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">
          LexDiff 이용약관
        </h1>
        <p className="text-xs text-muted-foreground">
          버전 {TERMS_VERSION} · 시행일 2026-04-13
        </p>
      </header>

      <div className="space-y-8 text-[14px] md:text-[15px] leading-[1.75] text-foreground/90">
        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제1조 (목적)
          </h2>
          <p>
            본 약관은 LexDiff(이하 &quot;서비스&quot;)가 제공하는 한국 법령 조회·비교·AI 기반
            법령 검색 기능의 이용과 관련하여 서비스 제공자와 이용자 간의 권리·의무 및 책임
            사항을 규정함을 목적으로 합니다.
          </p>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제2조 (서비스 내용)
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-foreground">
            <li>법제처 공개 API 기반 법령/판례/해석례 조회</li>
            <li>법령 개정 이력 비교 및 조문 변경 분석</li>
            <li>AI 기반 법령 질의응답 (FC-RAG)</li>
            <li>사용자별 즐겨찾기 및 검색 이력 관리</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제3조 (회원가입 및 계정)
          </h2>
          <p>
            서비스는 Google OAuth 로그인을 통해 회원가입을 진행합니다. 이용자는 본 약관 및
            개인정보처리방침에 동의한 후 서비스를 이용할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제4조 (AI 검색 결과의 한계)
          </h2>
          <p>
            서비스가 제공하는 AI 검색 결과는{' '}
            <strong className="font-semibold text-foreground">참고 자료</strong>이며 법률
            자문을 대체하지 않습니다. 실제 법적 판단이 필요한 경우 반드시 변호사 등 전문가의
            상담을 받으시기 바랍니다. 서비스는 AI 답변의 정확성·완전성·최신성을 보장하지
            않으며, 이를 근거로 한 의사결정의 결과에 대해 책임지지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제5조 (이용자의 의무)
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-foreground">
            <li>타인의 개인정보를 질의에 입력하지 않을 것</li>
            <li>서비스를 법령 위반 또는 제3자의 권리 침해 목적으로 사용하지 않을 것</li>
            <li>서비스 운영을 방해하는 행위(자동화 스크립트 대량 호출 등)를 하지 않을 것</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제6조 (면책)
          </h2>
          <p>
            서비스는 천재지변, 외부 API 장애, 제3자(법제처, AI 공급자) 서비스 중단 등
            불가항력으로 인한 손해에 대해 책임지지 않습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제7조 (약관 개정)
          </h2>
          <p>
            서비스는 관련 법령을 준수하는 범위 내에서 본 약관을 개정할 수 있으며, 개정 시
            적용일 7일 전 서비스 내 공지합니다. 개정 약관에 동의하지 않을 경우 서비스 이용을
            중단할 수 있습니다.
          </p>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            제8조 (준거법 및 관할)
          </h2>
          <p>
            본 약관은 대한민국 법률에 따라 해석되며, 서비스와 이용자 간 분쟁은 민사소송법상
            관할 법원을 제1심 법원으로 합니다.
          </p>
        </section>
      </div>

      <footer className="mt-10 pt-6 border-t border-border text-xs text-muted-foreground">
        문의:{' '}
        <a href="mailto:ryuseungin@naver.com" className="text-brand-navy dark:text-brand-gold underline underline-offset-2">
          ryuseungin@naver.com
        </a>
      </footer>
    </div>
  )
}
