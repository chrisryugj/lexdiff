"use client"

import { Star, Settings, Menu, X } from "lucide-react"
import { useState, useEffect } from "react"

interface OrganicHeaderProps {
  onReset: () => void
  onFavoritesClick: () => void
  onSettingsClick: () => void
}

export function OrganicHeader({ onReset, onFavoritesClick, onSettingsClick }: OrganicHeaderProps) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50)
    }
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-700 ease-out ${
        scrolled
          ? 'py-3 bg-[#faf9f7]/80 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.05)]'
          : 'py-6 bg-transparent'
      }`}
      style={{ fontFamily: "Pretendard, sans-serif" }}
    >
      <div className="container mx-auto max-w-6xl px-6">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <button
            onClick={onReset}
            className="group flex items-center gap-3"
          >
            <div className={`relative transition-all duration-500 ${scrolled ? 'w-8 h-8' : 'w-10 h-10'}`}>
              {/* Organic blob shape */}
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <defs>
                  <linearGradient id="organicGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="#ea580c" />
                    <stop offset="100%" stopColor="#dc2626" />
                  </linearGradient>
                </defs>
                <path
                  d="M50 5C75 5 95 25 95 50C95 75 75 95 50 95C25 95 5 75 5 50C5 25 25 5 50 5"
                  fill="url(#organicGrad)"
                  className="transition-all duration-500 group-hover:scale-110 origin-center"
                  style={{ transformOrigin: 'center' }}
                />
              </svg>
            </div>
            <span className={`font-bold tracking-tight transition-all duration-500 ${
              scrolled ? 'text-lg' : 'text-xl'
            }`}>
              LexDiff
            </span>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            <button
              onClick={onFavoritesClick}
              className="flex items-center gap-2 text-sm text-[#1a1a1a]/60 hover:text-[#1a1a1a] transition-colors duration-300"
            >
              <Star className="w-4 h-4" />
              <span>즐겨찾기</span>
            </button>
            <button
              onClick={onSettingsClick}
              className="flex items-center gap-2 text-sm text-[#1a1a1a]/60 hover:text-[#1a1a1a] transition-colors duration-300"
            >
              <Settings className="w-4 h-4" />
              <span>설정</span>
            </button>
          </nav>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 -mr-2"
          >
            {menuOpen ? (
              <X className="w-5 h-5" />
            ) : (
              <Menu className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-500 ease-out ${
            menuOpen ? 'max-h-40 opacity-100 mt-6' : 'max-h-0 opacity-0'
          }`}
        >
          <nav className="flex flex-col gap-4 pb-4">
            <button
              onClick={() => { onFavoritesClick(); setMenuOpen(false) }}
              className="flex items-center gap-3 text-sm text-[#1a1a1a]/60 hover:text-[#1a1a1a] transition-colors"
            >
              <Star className="w-4 h-4" />
              <span>즐겨찾기</span>
            </button>
            <button
              onClick={() => { onSettingsClick(); setMenuOpen(false) }}
              className="flex items-center gap-3 text-sm text-[#1a1a1a]/60 hover:text-[#1a1a1a] transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span>설정</span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  )
}
