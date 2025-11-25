"use client"

import { SearchBar } from "@/components/search-bar"
import { motion } from "framer-motion"

interface ProfessionalHeroProps {
    onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
    isSearching: boolean
    searchMode: 'basic' | 'rag'
}

export function ProfessionalHero({ onSearch, isSearching, searchMode }: ProfessionalHeroProps) {
    return (
        <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-20 overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 z-0">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-[128px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[128px] animate-pulse delay-1000" />
                <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
            </div>

            <div className="relative z-10 w-full max-w-5xl mx-auto text-center space-y-12">
                {/* Typography */}
                <div className="space-y-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                    >
                        <h2 className="text-sm md:text-base font-medium tracking-[0.2em] text-blue-400 uppercase mb-4">
                            Next Generation Legal AI
                        </h2>
                        <h1 className="text-5xl md:text-8xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/50 pb-2">
                            LexDiff
                        </h1>
                    </motion.div>

                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
                        className="text-lg md:text-2xl text-gray-400 max-w-2xl mx-auto font-light leading-relaxed"
                    >
                        법률 전문가를 위한 가장 진보된 AI 파트너.<br className="hidden md:block" />
                        복잡한 법령 분석부터 판례 검색까지, 단 한 번의 검색으로.
                    </motion.p>
                </div>

                {/* Search Section */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
                    className="w-full max-w-3xl mx-auto"
                >
                    <div className="p-1 rounded-2xl bg-gradient-to-b from-white/10 to-white/5 backdrop-blur-sm border border-white/10 shadow-2xl">
                        <div className="bg-black/50 rounded-xl p-2">
                            <SearchBar
                                onSearch={onSearch}
                                isLoading={isSearching}
                                searchMode={searchMode}
                                className="bg-transparent border-none focus:ring-0 text-lg"
                            />
                        </div>
                    </div>
                    <p className="mt-4 text-sm text-gray-500">
                        예시: "근로기준법 제23조", "임대차보호법 최우선변제금"
                    </p>
                </motion.div>

                {/* Stats / Trust Indicators */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.8 }}
                    className="pt-12 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-white/5"
                >
                    {[
                        { label: "법령 데이터", value: "150,000+" },
                        { label: "판례 데이터", value: "80,000+" },
                        { label: "일일 분석", value: "5,000+" },
                        { label: "AI 정확도", value: "99.9%" },
                    ].map((stat, index) => (
                        <div key={index} className="text-center">
                            <div className="text-2xl md:text-3xl font-bold text-white mb-1">{stat.value}</div>
                            <div className="text-xs md:text-sm text-gray-500 uppercase tracking-wider">{stat.label}</div>
                        </div>
                    ))}
                </motion.div>
            </div>

            {/* Scroll Indicator */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 1 }}
                className="absolute bottom-10 left-1/2 -translate-x-1/2"
            >
                <div className="w-[1px] h-16 bg-gradient-to-b from-transparent via-white/20 to-transparent" />
            </motion.div>
        </section>
    )
}
