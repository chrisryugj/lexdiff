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
          버전 {PRIVACY_VERSION} · 시행일 2026-04-13
        </p>
      </header>

      <div className="space-y-8 text-[14px] md:text-[15px] leading-[1.75] text-foreground/90">
        <p>
          LexDiff(이하 &quot;서비스&quot;)는 「개인정보 보호법」 및 「정보통신망 이용촉진 및
          정보보호 등에 관한 법률」을 준수하며, 이용자의 개인정보를 소중히 보호합니다.
        </p>

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
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground/90 mb-1.5">
                다. 선택 수집 항목 (별도 동의 시)
              </h3>
              <ul className="list-disc pl-5 space-y-1 marker:text-muted-foreground">
                <li>AI 검색 질의 내용 및 답변</li>
                <li>AI 검색 메타데이터 (검색 유형, 도구 호출 로그, 응답 시간)</li>
              </ul>
              <p className="mt-2 text-sm text-muted-foreground">
                선택 항목은{' '}
                <strong className="font-semibold text-foreground">AI 품질 개선 목적으로만</strong>{' '}
                사용되며, 별도 동의 없이는 수집되지 않습니다. 동의는 언제든지 철회할 수 있으며,
                철회 시 이후 질의는 기록되지 않습니다.
              </p>
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
            <li>(선택 동의 시) AI 검색 품질 개선 — 로그 분석을 통한 모델/프롬프트 개선</li>
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
                  <td className="px-3 py-2">AI 질의 로그 (선택 동의)</td>
                  <td className="px-3 py-2">
                    <strong className="font-semibold">30일</strong> 경과 후 자동 삭제
                  </td>
                </tr>
                <tr>
                  <td className="px-3 py-2">접속 IP/User-Agent</td>
                  <td className="px-3 py-2">3개월 (정보통신망법 제48조의2)</td>
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
              <strong className="font-semibold text-foreground">익명화</strong>: AI 질의 로그는
              사용자 ID를 직접 저장하지 않고 HMAC-SHA256 해시로 변환하여 저장합니다. 별도의
              솔트(salt)를 분리 관리하므로 데이터베이스 유출만으로는 특정 사용자를 역추적할 수
              없습니다.
            </li>
            <li>
              <strong className="font-semibold text-foreground">PII 스크러빙</strong>: 저장 전
              주민등록번호, 전화번호, 이메일, 계좌번호, IP 주소 등 식별 가능한 개인정보를
              자동으로 마스킹합니다.
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
            6. 개인정보 처리 위탁
          </h2>
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">수탁자</th>
                  <th className="text-left font-semibold px-3 py-2 border-b border-border">위탁 업무</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                <tr>
                  <td className="px-3 py-2">Supabase Inc.</td>
                  <td className="px-3 py-2">회원 인증, 데이터베이스 운영</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Vercel Inc.</td>
                  <td className="px-3 py-2">웹 호스팅, 서버리스 함수 실행</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Google LLC</td>
                  <td className="px-3 py-2">OAuth 인증</td>
                </tr>
                <tr>
                  <td className="px-3 py-2">Anthropic PBC / Google LLC</td>
                  <td className="px-3 py-2">AI 모델 API (질의 처리 — 저장은 30일 이내)</td>
                </tr>
              </tbody>
            </table>
          </div>
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
              AI 로그 수집 동의 철회 및 기존 로그 전체 삭제 — 사용자 메뉴 &gt; 개인정보 설정에서
              즉시 가능
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
      </div>
    </div>
  )
}
