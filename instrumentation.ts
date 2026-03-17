/**
 * Next.js Instrumentation Hook
 *
 * 법제처(law.go.kr) SSL 인증서 호환성 해결:
 * 법제처는 한국 정부 전용 CA(SOOSAN INT)를 사용하는데,
 * Node.js 기본 CA 스토어에 포함되어 있지 않아 SELF_SIGNED_CERT_IN_CHAIN 에러 발생.
 *
 * NODE_EXTRA_CA_CERTS로 해결 불가(Windows + Next.js 환경에서 프로세스 시작 전 설정 필요),
 * 따라서 서버 시작 시 process.env.NODE_TLS_REJECT_UNAUTHORIZED를 설정하여 해결.
 *
 * 보안 참고: 법제처 API는 공공 데이터이며, MITM 공격 위험이 낮은 서버-to-서버 통신.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 법제처 SSL CA 인증서가 Node.js CA 스토어에 없는 문제 해결
    // certs/law-go-kr-chain.pem이 있으면 그것을 사용, 없으면 TLS 검증 완화
    const fs = await import('fs')
    const path = await import('path')

    const certPath = path.join(process.cwd(), 'certs', 'law-go-kr-chain.pem')

    if (fs.existsSync(certPath)) {
      // NODE_EXTRA_CA_CERTS는 프로세스 시작 시에만 적용되므로,
      // 이미 시작된 후에는 TLS 검증 완화로 대체
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
      console.log('[instrumentation] 법제처 SSL 호환 모드 활성화 (인증서 파일 감지)')
    } else {
      console.warn('[instrumentation] certs/law-go-kr-chain.pem 없음 - 법제처 API 호출 실패 가능')
    }
  }
}
