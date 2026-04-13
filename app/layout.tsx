import type React from "react"
import type { Metadata, Viewport } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { ErrorBoundary, UnhandledRejectionWatcher } from "@/components/error-boundary"
import { MotionProvider } from "@/components/providers/motion-provider"
import { ConsentGate } from "@/components/consent-gate"
import { FavoritesSync } from "@/components/favorites-sync"
import { AiGateProvider } from "@/components/ai-gate-provider"
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
              <ConsentGate />
              <FavoritesSync />
            </MotionProvider>
          </ErrorBoundary>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
