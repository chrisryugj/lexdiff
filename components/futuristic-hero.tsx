"use client"

import { SearchBar } from "@/components/search-bar"
import { motion } from "framer-motion"
import { Sparkles } from "lucide-react"

interface FuturisticHeroProps {
    onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
    isSearching: boolean
    searchMode: 'basic' | 'rag'
}

export function FuturisticHero({ onSearch, isSearching, searchMode }: FuturisticHeroProps) {
    return (
        <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden" style={{ fontFamily: "Pretendard, sans-serif" }}>
            {/* Aurora Background */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-purple-600/20 rounded-full blur-[120px] animate-blob mix-blend-screen" />
                <div className="absolute top-[20%] right-[-10%] w-[50%] h-[50%] bg-blue-600/20 rounded-full blur-[120px] animate-blob animation-delay-2000 mix-blend-screen" />
                <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-indigo-600/20 rounded-full blur-[120px] animate-blob animation-delay-4000 mix-blend-screen" />
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-20 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_70%)]" />
            </div>

            <div className="relative z-10 w-full max-w-5xl mx-auto text-center">
                {/* Badge */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8"
                >
                    <Sparkles className="w-3 h-3 text-purple-400" />
                    <span className="text-xs font-medium text-purple-200 tracking-wide uppercase">AI 기반 법률 인텔리전스</span>
                </motion.div>

                {/* Title */}
                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.1 }}
                    className="text-6xl md:text-8xl font-bold tracking-tight mb-6"
                >
                    <span className="inline-block bg-clip-text text-transparent bg-gradient-to-b from-white via-white to-white/30">
                        Legal
                    </span>
                    <br />
                    <span className="inline-block bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 animate-gradient-x">
                        Intelligence
                    </span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed break-keep"
                >
                    법률 리서치의 미래를 경험하세요. <br className="hidden md:block" />
                    단 한 번의 검색으로 판례 분석부터 법령 비교까지.
                </motion.p>

                {/* Search Container */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                    className="w-full max-w-2xl mx-auto relative group"
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200" />
                    <div className="relative p-2 bg-black/50 backdrop-blur-xl rounded-2xl border border-white/10 ring-1 ring-white/10 shadow-2xl">
                        <SearchBar
                            onSearch={onSearch}
                            isLoading={isSearching}
                            searchMode={searchMode}
                            className="bg-transparent border-none focus:ring-0 text-lg placeholder:text-gray-600"
                        />
                    </div>
                </motion.div>

                {/* Floating Elements */}
                <div className="absolute top-1/2 left-0 -translate-y-1/2 -translate-x-1/2 hidden lg:block">
                    <FloatingCard delay={0} title="판례 데이터" value="80K+" />
                </div>
                <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 hidden lg:block">
                    <FloatingCard delay={2} title="AI 정확도" value="99.9%" />
                </div>
            </div>
        </section>
    )
}

function FloatingCard({ delay, title, value }: { delay: number, title: string, value: string }) {
    return (
        <motion.div
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
            className="p-4 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md w-32 text-center"
        >
            <div className="text-2xl font-bold text-white mb-1">{value}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wider">{title}</div>
        </motion.div>
    )
}
