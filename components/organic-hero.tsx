"use client"

import { SearchBar } from "@/components/search-bar"
import { useEffect, useState, useRef } from "react"
import { ArrowDown, Sparkles } from "lucide-react"

interface OrganicHeroProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
  isSearching: boolean
  searchMode: 'basic' | 'rag'
}

export function OrganicHero({ onSearch, isSearching, searchMode }: OrganicHeroProps) {
  const [mounted, setMounted] = useState(false)
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  const heroRef = useRef<HTMLElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (heroRef.current) {
        const rect = heroRef.current.getBoundingClientRect()
        setMousePosition({
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height
        })
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [])

  const scrollToFeatures = () => {
    const featuresSection = document.getElementById('features')
    if (featuresSection) {
      featuresSection.scrollIntoView({ behavior: 'smooth' })
    }
  }

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden"
      style={{ fontFamily: "Pretendard, sans-serif" }}
    >
      {/* Organic Background Shapes */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Warm gradient blob - top right */}
        <div
          className="absolute w-[800px] h-[800px] rounded-full opacity-30 blur-3xl transition-transform duration-[2000ms] ease-out"
          style={{
            background: 'radial-gradient(circle, #fcd34d 0%, #f59e0b 30%, transparent 70%)',
            top: '-20%',
            right: '-10%',
            transform: `translate(${mousePosition.x * -30}px, ${mousePosition.y * -30}px)`,
          }}
        />
        {/* Cool gradient blob - bottom left */}
        <div
          className="absolute w-[600px] h-[600px] rounded-full opacity-20 blur-3xl transition-transform duration-[2500ms] ease-out"
          style={{
            background: 'radial-gradient(circle, #a3e635 0%, #65a30d 30%, transparent 70%)',
            bottom: '-10%',
            left: '-5%',
            transform: `translate(${mousePosition.x * 20}px, ${mousePosition.y * 20}px)`,
          }}
        />
        {/* Accent blob - center */}
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-10 blur-3xl transition-transform duration-[3000ms] ease-out"
          style={{
            background: 'radial-gradient(circle, #fb923c 0%, #ea580c 30%, transparent 70%)',
            top: '40%',
            left: '50%',
            transform: `translate(-50%, -50%) translate(${mousePosition.x * 40}px, ${mousePosition.y * 40}px)`,
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-4xl mx-auto text-center">
        {/* Badge */}
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur-sm border border-[#1a1a1a]/5 shadow-sm mb-8 transition-all duration-1000 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-[#1a1a1a]/70">AI 기반 법률 검색 플랫폼</span>
        </div>

        {/* Title */}
        <h1
          className={`text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 transition-all duration-1000 delay-100 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <span className="block text-[#1a1a1a]">법률의 복잡함을</span>
          <span
            className="block mt-2 bg-clip-text text-transparent"
            style={{
              backgroundImage: 'linear-gradient(135deg, #f59e0b 0%, #ea580c 50%, #dc2626 100%)',
            }}
          >
            단순하게
          </span>
        </h1>

        {/* Subtitle */}
        <p
          className={`text-lg md:text-xl text-[#1a1a1a]/60 max-w-2xl mx-auto mb-12 leading-relaxed break-keep transition-all duration-1000 delay-200 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          법령 검색부터 신구법 비교, AI 분석까지.
          <br className="hidden md:block" />
          대한민국 법률 정보를 가장 자연스럽게 탐색하세요.
        </p>

        {/* Search Container */}
        <div
          className={`w-full max-w-2xl mx-auto transition-all duration-1000 delay-300 ${
            mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}
        >
          <div className="relative group">
            {/* Glow effect */}
            <div
              className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
              style={{
                background: 'linear-gradient(135deg, #fcd34d 0%, #f59e0b 50%, #ea580c 100%)',
              }}
            />
            {/* Search bar container */}
            <div className="relative bg-white rounded-2xl shadow-xl shadow-black/5 border border-[#1a1a1a]/5 p-2 overflow-hidden">
              <SearchBar
                onSearch={onSearch}
                isLoading={isSearching}
                searchMode={searchMode}
              />
            </div>
          </div>

          {/* Search hints */}
          <div className="flex flex-wrap justify-center gap-2 mt-6">
            {['민법', '형법', '상법', '근로기준법'].map((hint, i) => (
              <button
                key={hint}
                onClick={() => onSearch({ lawName: hint })}
                className={`px-3 py-1.5 text-sm text-[#1a1a1a]/50 hover:text-[#1a1a1a] bg-white/50 hover:bg-white rounded-full border border-[#1a1a1a]/5 hover:border-[#1a1a1a]/10 transition-all duration-300 hover:shadow-sm ${
                  mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                }`}
                style={{ transitionDelay: `${400 + i * 50}ms` }}
              >
                {hint}
              </button>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <button
          onClick={scrollToFeatures}
          className={`absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[#1a1a1a]/30 hover:text-[#1a1a1a]/60 transition-all duration-500 ${
            mounted ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDelay: '600ms' }}
        >
          <span className="text-xs tracking-widest uppercase">Scroll</span>
          <ArrowDown className="w-4 h-4 animate-bounce" />
        </button>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-1/4 left-8 w-2 h-2 rounded-full bg-amber-400/40 animate-pulse" />
      <div className="absolute top-1/3 right-12 w-3 h-3 rounded-full bg-orange-400/30 animate-pulse" style={{ animationDelay: '1s' }} />
      <div className="absolute bottom-1/4 left-16 w-1.5 h-1.5 rounded-full bg-lime-400/40 animate-pulse" style={{ animationDelay: '2s' }} />
      <div className="absolute bottom-1/3 right-20 w-2.5 h-2.5 rounded-full bg-amber-500/20 animate-pulse" style={{ animationDelay: '0.5s' }} />
    </section>
  )
}
