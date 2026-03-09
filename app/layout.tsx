import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { ErrorBoundary } from "@/components/error-boundary"
import { MotionProvider } from "@/components/providers/motion-provider"
import "./globals.css"

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
      <body className={`font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ErrorBoundary>
            <MotionProvider>
              {children}
            </MotionProvider>
          </ErrorBoundary>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
