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

export const metadata: Metadata = {
  title: "LexDiff — Your AI-Powered Legal Companion.",
  description: "LexDiff: Your AI-Powered Legal Companion",
  generator: "Chris Ryu",
  verification: {
    // Google Search Console → 속성 추가 → HTML 태그 방식에서 받은 값을 여기 넣기
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
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
