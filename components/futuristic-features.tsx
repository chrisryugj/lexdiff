"use client"

import { motion } from "framer-motion"
import { Search, Brain, GitCompare, ShieldCheck, ArrowRight } from "lucide-react"

const features = [
    {
        title: "초고속 법령 검색",
        description: "수백만 건의 법률 데이터베이스에서 필요한 정보를 즉시 찾아냅니다.",
        icon: Search,
        colSpan: "col-span-1 md:col-span-2",
        bg: "bg-gradient-to-br from-purple-500/10 to-blue-500/10"
    },
    {
        title: "AI 법률 분석",
        description: "법률 문맥을 이해하는 고성능 AI가 핵심 내용을 요약합니다.",
        icon: Brain,
        colSpan: "col-span-1",
        bg: "bg-white/5"
    },
    {
        title: "신구법 비교",
        description: "개정 전후의 법령 변화를 시각적으로 비교하고 분석합니다.",
        icon: GitCompare,
        colSpan: "col-span-1",
        bg: "bg-white/5"
    },
    {
        title: "검증된 데이터",
        description: "국가법령정보센터와 실시간으로 연동된 신뢰할 수 있는 데이터.",
        icon: ShieldCheck,
        colSpan: "col-span-1 md:col-span-2",
        bg: "bg-gradient-to-br from-blue-500/10 to-purple-500/10"
    }
]

export function FuturisticFeatures() {
    return (
        <section className="py-32 px-6 relative z-10" style={{ fontFamily: "Pretendard, sans-serif" }}>
            <div className="container mx-auto max-w-6xl">
                <div className="mb-20">
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight">
                        압도적인 <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                            법률 인텔리전스
                        </span>
                    </h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className={`${feature.colSpan} group relative p-8 rounded-3xl border border-white/10 overflow-hidden hover:border-white/20 transition-colors ${feature.bg}`}
                        >
                            <div className="absolute top-0 right-0 p-8 opacity-20 group-hover:opacity-40 transition-opacity transform group-hover:scale-110 duration-500">
                                <feature.icon className="w-24 h-24 text-white" />
                            </div>

                            <div className="relative z-10 h-full flex flex-col justify-between">
                                <div>
                                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6 backdrop-blur-sm">
                                        <feature.icon className="w-6 h-6 text-white" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-white mb-3">{feature.title}</h3>
                                    <p className="text-gray-400 leading-relaxed break-keep">
                                        {feature.description}
                                    </p>
                                </div>

                                <div className="mt-8 flex items-center text-sm font-medium text-white/50 group-hover:text-white transition-colors">
                                    자세히 보기 <ArrowRight className="w-4 h-4 ml-2 transform group-hover:translate-x-1 transition-transform" />
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
