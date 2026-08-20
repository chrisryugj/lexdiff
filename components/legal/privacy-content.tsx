import { PRIVACY_VERSION } from '@/lib/privacy/consent-versions'

/**
 * 개인정보처리방침 본문 — 페이지와 모달에서 공유.
 */
export function PrivacyContent() {
  return (
    <div>
      <header className="mb-8 pb-6 border-b border-border">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight mb-2">
          LexDiff 개인정보처리방침
        </h1>
        <p className="text-xs text-muted-foreground">
          버전 {PRIVACY_VERSION} · 시행일 2026-04-13 · 최종 개정 2026-08-20
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          2026-08-20 개정: 보유기간 표에 답변 피드백 항목 추가, 국외 이전 요약에 AI 엔진
          수탁자 보완, 접속기록·질의로그 관련 기재를 실제 처리 현황에 맞게 정정. 수집 항목·
          이용 목적·수탁자가 새로 늘어난 변경은 없습니다.
        </p>
      </header>

      <div className="space-y-8 text-[14px] md:text-[15px] leading-[1.75] text-foreground/90">
        <p>
          LexDiff(이하 &quot;서비스&quot;)는 「개인정보 보호법」 및 「정보통신망 이용촉진 및
          정보보호 등에 관한 법률」을 준수하며, 이용자의 개인정보를 소중히 보호합니다.
        </p>

        <div className="rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
          <strong className="font-semibold text-foreground">국외 이전 고지:</strong>{' '}
          본 서비스의 데이터베이스·인증 인프라(Supabase)는{' '}
          <strong className="font-semibold text-foreground">일본(Tokyo, ap-northeast-1)</strong>{' '}
          리전에서 운영되며, 회원 정보·쿼터·텔레메트리 등 모든 저장 데이터가 일본에 위치한
          서버에 보관됩니다. 자세한 내용은 제6항 및 제10항을 참고하십시오.
        </div>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-3">
            1. 수집하는 개인정보 항목 및 수집 방법
          </h2>

          <div className="space-y-4 pl-1">
            <div>
              <h3 className="text-sm font-semibold text-foreground/90 mb-1.5">
                가. 필수 수집 항목 (Google OAuth 로그인 시)
              </h3>
              <ul className="list-disc pl-5 space-y-1 marker:text-muted-foreground">
                <li>이메일 주소</li>
                <li>이름 (Google 프로필상 표시명)</li>
                <li>프로필 이미지 URL</li>
                <li>Google 계정 고유 식별자(sub)</li>
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground/90 mb-1.5">
                나. 자동 수집 항목
              </h3>
              <ul className="list-disc pl-5 space-y-1 marker:text-muted-foreground">
                <li>접속 IP 주소, User-Agent, 접속 시각 (서비스 운영 및 부정이용 방지 목적)</li>
                <li>서비스 이용 기록 (기능별 사용 횟수 — 쿼터 관리 목적)</li>
                <li>
                  <strong className="font-semibold text-foreground">AI 파이프라인 텔레메트리</strong>{' '}
                  — 질의·답변 <strong>원문은 저장하지 않으며</strong>, 아래 집계 신호만 저장합니다.
                  개인정보 해당 항목이 없으므로 별도 동의 없이 수집됩니다.
                  <ul className="list-[circle] pl-5 mt-1 space-y-0.5 text-muted-foreground">
                    <li>쿼리 유형/복잡도/도메인 분류 결과, 질의·답변 길이 버킷(&lt;50/50-200/200-500/500+자)</li>
                    <li>파이프라인 단계별 응답 시간, 도구 호출 이름(인자 제외), 오류 카테고리</li>
                    <li>인용된 법령 ID(MST 코드 — 공공정보), 신뢰도 점수, 모델 ID, 토큰 수/비용 추정</li>
                    <li>UA 클래스(mobile/desktop/tablet)와 30분 윈도우 세션 해시(영속 식별 불가)</li>
                  </ul>
                </li>
                <li>
                  <strong className="font-semibold text-foreground">조회 이력</strong>{' '}
                  — 로그인 사용자가 열람한 법령·조례·판례의 <strong>표시용 제목, 식별자(법령ID·조문번호·조례 일련번호·판례 ID), 조회 시각</strong>만 저장합니다.
                  최근 조회 항목 재조회 편의 제공 목적이며, 질의·답변 원문은 저장하지 않습니다. (비로그인 시 기기 내 localStorage에만 보관)
                </li>
                <li>
                  <strong className="font-semibold text-foreground">AI 답변 피드백</strong>{' '}
                  — 답변 하단의 피드백 버튼(좋음/별로/개선요청)을 직접 누른 경우에만 1건 기록합니다.
                  ‘좋음’은 유형·엔진 등 메타데이터만 저장하며, <strong>‘별로·개선요청’ 선택 시에 한해</strong> 품질
                  개선 목적으로 해당 질문·답변 본문을 함께 저장합니다. 이때 본문은 저장 직전
                  주민등록번호·연락처 등 식별정보가 자동 마스킹됩니다(제4항). (상시 자동 수집이
                  아니며, 버튼을 누르지 않으면 저장되지 않습니다)
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            2. 개인정보의 수집·이용 목적
          </h2>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-foreground">
            <li>회원 식별 및 로그인 세션 유지</li>
            <li>서비스 제공 및 사용자별 쿼터 관리</li>
            <li>부정이용 방지 및 서비스 운영 안정성 확보</li>
            <li>AI 답변 품질 개선 — 사용자가 남긴 답변 피드백(좋음/별로/개선요청) 분석을 통한 모델·프롬프트 개선</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-3">
            3. 개인정보의 보유 및 이용 기간
          </h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">항목</th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">보유 기간</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-3 py-2">회원 정보 (이메일, 이름 등)</td>
                  <td className="px-3 py-2">회원 탈퇴 시까지</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">쿼터 사용 로그</td>
                  <td className="px-3 py-2">회원 탈퇴 시까지</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">AI 파이프라인 텔레메트리 (본문 제외 집계)</td>
                  <td className="px-3 py-2">
                    <strong className="font-semibold">90일</strong> 경과 후 자동 삭제
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">조회 이력 (법령/조례/판례 메타)</td>
                  <td className="px-3 py-2">
                    마지막 조회 후 <strong className="font-semibold">180일</strong> 경과 시 자동 삭제
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">답변 피드백 (‘별로·개선요청’ 선택 시 질문·답변 본문 포함)</td>
                  <td className="px-3 py-2">
                    <strong className="font-semibold">180일</strong> 경과 후 자동 삭제
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">접속 IP/User-Agent</td>
                  <td className="px-3 py-2">
                    서비스 자체 데이터베이스에는 저장하지 않습니다. 남용 방지를 위한 일시적
                    처리(메모리상 요청 빈도 계산)에만 쓰이고 요청 처리 후 폐기되며, 그 외에는
                    호스팅 사업자(Vercel)의 접속 로그에만 기록되어 해당 사업자의 보관 정책을
                    따릅니다.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            4. 개인정보 보호를 위한 기술적 조치
          </h2>
          <ul className="list-disc pl-5 space-y-2 marker:text-muted-foreground">
            <li>
              <strong className="font-semibold text-foreground">원문 미저장</strong>: AI 질의와
              답변의 본문은 저장하지 않습니다. 품질 분석용 텔레메트리에는 분류 결과·길이 구간·
              응답 시간 같은 집계 신호만 기록되며, 본문이 담기는 컬럼 자체가 없습니다.
            </li>
            <li>
              <strong className="font-semibold text-foreground">익명화</strong>: 텔레메트리와
              피드백에 남는 세션 식별자는 사용자 ID를 직접 저장하지 않고 HMAC-SHA256 해시로
              변환하며, 30분 단위로 값이 바뀌어 장기 추적에 쓸 수 없습니다. 별도의 솔트(salt)를
              분리 관리하므로 데이터베이스 유출만으로는 특정 사용자를 역추적할 수 없습니다.
            </li>
            <li>
              <strong className="font-semibold text-foreground">PII 스크러빙</strong>: 이용자가
              ‘별로·개선요청’ 피드백을 눌러 질문·답변 본문이 보관되는 경우, 저장 직전에
              주민등록번호, 외국인등록번호, 사업자·법인등록번호, 전화번호, 이메일, 계좌번호,
              카드번호, IP 주소를 자동으로 마스킹합니다. 이용자가 실수로 입력한 민감정보가
              그대로 쌓이지 않도록 하는 안전장치입니다.
            </li>
            <li>
              <strong className="font-semibold text-foreground">접근 통제</strong>: 모든 로그
              데이터는 Supabase Row Level Security(RLS)로 일반 사용자 접근을 원천 차단하며,
              서비스 서버(service_role)만 기록·삭제할 수 있습니다.
            </li>
            <li>
              <strong className="font-semibold text-foreground">전송 구간 암호화</strong>: 모든
              통신은 HTTPS로 암호화됩니다.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            5. 개인정보의 제3자 제공
          </h2>
          <p className="mb-2">
            서비스는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 단, 아래의
            경우는 예외로 합니다.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-foreground">
            <li>이용자가 사전에 동의한 경우</li>
            <li>법령에 의거 수사기관 등이 적법한 절차에 따라 요구하는 경우</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-3">
            6. 개인정보 처리 위탁 및 국외 이전
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            서비스 운영을 위해 아래 업체에 개인정보 처리 업무를 위탁하고 있으며, 이전 국가·
            이전 방법·보유 기간 등을 고지합니다 (개인정보 보호법 제28조의8).
          </p>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">수탁자</th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">위탁 업무</th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">이전 국가 / 리전</th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">이전 방법</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-3 py-2">Supabase Inc.</td>
                  <td className="px-3 py-2">회원 인증, DB/RLS, 텔레메트리 저장</td>
                  <td className="px-3 py-2"><strong className="font-semibold">일본 (ap-northeast-1, Tokyo)</strong></td>
                  <td className="px-3 py-2">HTTPS/TLS 암호화 전송</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Vercel Inc.</td>
                  <td className="px-3 py-2">웹 호스팅, 서버리스 함수</td>
                  <td className="px-3 py-2">대한민국 (icn1, Seoul)</td>
                  <td className="px-3 py-2">HTTPS/TLS 암호화 전송</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Google LLC</td>
                  <td className="px-3 py-2">OAuth 인증, Gemini AI 모델 API (본인 키 등록 시 및 폴백 경로)</td>
                  <td className="px-3 py-2">미국 (global)</td>
                  <td className="px-3 py-2">HTTPS/TLS 암호화 전송</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Anthropic PBC</td>
                  <td className="px-3 py-2">법령 답변 AI 엔진(Themis) — Claude 모델 API에 질의 전송</td>
                  <td className="px-3 py-2">미국 (global)</td>
                  <td className="px-3 py-2">HTTPS/TLS 암호화 전송</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Cloudflare, Inc.</td>
                  <td className="px-3 py-2">AI 게이트웨이 프록시</td>
                  <td className="px-3 py-2">미국 / 글로벌 엣지</td>
                  <td className="px-3 py-2">HTTPS/TLS 암호화 전송</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            이전 항목: 회원 식별자, 인증 토큰, 쿼터 사용 기록, AI 파이프라인 텔레메트리(본문 제외).
            이전 일시: 서비스 이용 시점에 수시. 보유 기간: 본 방침 제3항의 항목별 보유 기간과 동일.
            이용자는 수탁자에 대한 개인정보 이전을 거부할 수 있으며, 거부 시 서비스의 전부
            또는 일부 이용이 제한됩니다.
          </p>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            7. 이용자의 권리
          </h2>
          <p className="mb-2">이용자는 언제든지 다음의 권리를 행사할 수 있습니다.</p>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-foreground">
            <li>개인정보 열람 요구</li>
            <li>오류 정정·삭제 요구</li>
            <li>처리 정지 요구</li>
            <li>
              AI 답변 피드백 등 수집 정보의 삭제 요청 — 아래 개인정보 보호책임자 이메일로 요청 시 처리
            </li>
            <li>회원 탈퇴</li>
          </ul>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            8. 개인정보 보호책임자
          </h2>
          <ul className="list-disc pl-5 space-y-1 marker:text-muted-foreground">
            <li>성명: 류승인</li>
            <li>
              이메일:{' '}
              <a href="mailto:ryuseungin@naver.com" className="text-brand-navy dark:text-brand-gold underline underline-offset-2">
                ryuseungin@naver.com
              </a>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            9. 개정 고지
          </h2>
          <p>
            본 방침은 법령·정책 변경에 따라 개정될 수 있으며, 개정 시 시행일 7일 전 서비스 내
            공지합니다. 중대한 변경의 경우 재동의 절차를 거칩니다.
          </p>
        </section>

        <section>
          <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
            10. 국외 이전 요약 (Data Transfer Disclosure)
          </h2>
          <p className="mb-2">
            이용자가 본 서비스를 이용하면, 일부 개인정보 및 서비스 데이터가 대한민국 외 국가에
            위치한 서버로 전송·저장됩니다. 이는 서비스 제공을 위한 필수적인 절차입니다.
          </p>
          <ul className="list-disc pl-5 space-y-1.5 marker:text-muted-foreground">
            <li>
              <strong className="font-semibold text-foreground">주 저장소 — 일본</strong>: Supabase
              (ap-northeast-1, Tokyo). 회원 정보, 쿼터, AI 텔레메트리가 일본 리전에 저장됩니다.
            </li>
            <li>
              <strong className="font-semibold text-foreground">AI 처리 — 미국</strong>: 이용자가
              입력한 질의는 답변 생성을 위해 AI 모델 제공사로 일시 전송됩니다. 기본 엔진인
              테미스(Themis)는 Anthropic PBC의 Claude 모델 API를, 폴백 경로 및 본인 키 등록 시에는
              Google LLC의 Gemini API를 사용하며 두 곳 모두 미국에서 처리됩니다. 전송된 질의는
              답변 생성 목적으로만 쓰이고 각 사업자의 API 데이터 정책을 따릅니다(Gemini API
              기본: 24시간 내 로그 삭제). 서비스는 이 질의·답변 본문을 자체적으로 저장하지
              않습니다.
            </li>
            <li>
              <strong className="font-semibold text-foreground">게이트웨이 — 글로벌 엣지</strong>:
              Cloudflare Workers. 요청 라우팅 용도이며 본문 저장 없음.
            </li>
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">
            본 서비스는 저장된 데이터 중 개인 식별 가능 정보는 해시 익명화 및 PII 마스킹을
            적용하여 국외 이전의 법적 위험을 최소화하고 있습니다. 본인의 데이터 삭제를 원하시는
            경우 제7항 및 제8항의 경로로 요청하십시오.
          </p>
        </section>
      </div>
    </div>
  )
}
