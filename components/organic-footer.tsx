"use client"

import { Heart } from "lucide-react"

export function OrganicFooter() {
  return (
    <footer
      className="relative py-16 px-6 bg-[#1a1a1a] text-white overflow-hidden"
      style={{ fontFamily: "Pretendard, sans-serif" }}
    >
      {/* Decorative gradient */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-px"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, #f59e0b 50%, transparent 100%)',
        }}
      />

      <div className="container mx-auto max-w-6xl relative z-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Logo & Copyright */}
          <div className="flex flex-col items-center md:items-start gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8">
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <defs>
                    <linearGradient id="footerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f59e0b" />
                      <stop offset="50%" stopColor="#ea580c" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M50 5C75 5 95 25 95 50C95 75 75 95 50 95C25 95 5 75 5 50C5 25 25 5 50 5"
                    fill="url(#footerGrad)"
                  />
                </svg>
              </div>
              <span className="text-lg font-bold">LexDiff</span>
            </div>
            <p className="text-sm text-white/40">
              © 2025 Chris Ryu. All rights reserved.
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center gap-6 text-sm text-white/50">
            <a
              href="/admin/settings"
              className="hover:text-white transition-colors duration-300"
            >
              설정
            </a>
            <span className="text-white/20">|</span>
            <span>법제처 API 연동</span>
            <span className="text-white/20">|</span>
            <span className="flex items-center gap-1">
              Powered by Gemini AI
            </span>
          </div>

          {/* Made with love */}
          <div className="flex items-center gap-2 text-sm text-white/40">
            <span>Made with</span>
            <Heart className="w-4 h-4 text-red-400 fill-red-400 animate-pulse" />
            <span>in Seoul</span>
          </div>
        </div>
      </div>

      {/* Background decoration */}
      <div
        className="absolute bottom-0 right-0 w-64 h-64 rounded-full opacity-5 blur-3xl"
        style={{
          background: 'radial-gradient(circle, #f59e0b 0%, transparent 70%)',
        }}
      />
    </footer>
  )
}
