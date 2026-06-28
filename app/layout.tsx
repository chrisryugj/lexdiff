import type React from "react"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { ErrorBoundary, UnhandledRejectionWatcher } from "@/components/error-boundary"
import { MotionProvider } from "@/components/providers/motion-provider"
import { ConsentGate } from "@/components/consent-gate"
import { FavoritesSync } from "@/components/favorites-sync"
import { AiGateProvider } from "@/components/ai-gate-provider"
import { Toaster } from "@/components/ui/toaster"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
}

const OG_IMAGE = "/og/lexdiff-kakao-og.png"
const OG_TITLE = "LexDiff — 법령 비교 · AI 법률 검색"
const OG_DESC = "법제처 데이터 기반 법령·판례 조회와 신·구 조문 비교, AI 법률 질의응답."

export const metadata: Metadata = {
  // 카톡/SNS 공유 미리보기는 절대 URL 필요 → 상대경로 OG 이미지를 이 base 로 해석.
  metadataBase: new URL("https://lexdiff.gomdori.app"),
  title: "LexDiff — Your AI-Powered Legal Companion.",
  description: "LexDiff: Your AI-Powered Legal Companion",
  generator: "Chris Ryu",
  verification: {
    // Google Search Console → 속성 추가 → HTML 태그 방식에서 받은 값을 여기 넣기
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },
  openGraph: {
    type: "website",
    siteName: "LexDiff",
    title: OG_TITLE,
    description: OG_DESC,
    url: "https://lexdiff.gomdori.app",
    locale: "ko_KR",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "LexDiff" }],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESC,
    images: [OG_IMAGE],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head />
      <body className={`font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <UnhandledRejectionWatcher />
            <MotionProvider>
              <AiGateProvider>
                {children}
              </AiGateProvider>
              <footer className="border-t border-border/40 bg-background/50 py-4 px-6 text-center text-xs text-muted-foreground">
                <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                  <span>© {new Date().getFullYear()} LexDiff</span>
                  <a href="/privacy" className="hover:text-foreground hover:underline">개인정보처리방침</a>
                  <a href="/terms" className="hover:text-foreground hover:underline">서비스 약관</a>
                  <a href="/help" className="hover:text-foreground hover:underline">도움말</a>
                </nav>
              </footer>
              <ConsentGate />
              <FavoritesSync />
              <Toaster />
            </MotionProvider>
          </ErrorBoundary>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
