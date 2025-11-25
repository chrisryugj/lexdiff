"use client"

import { motion } from "framer-motion"
import { Scale, Search, Shield, Zap } from "lucide-react"

const features = [
    {
        icon: Search,
        title: "초고속 법령 검색",
        description: "키워드 하나로 관련 법령, 판례, 조문을 즉시 찾아냅니다. 더 이상 수많은 법전을 뒤적거릴 필요가 없습니다."
    },
    {
        icon: Zap,
        title: "AI 법률 분석",
        description: "최신 AI 모델이 복잡한 법률 용어를 해석하고, 판례의 핵심 요지를 요약하여 제공합니다."
    },
    {
        icon: Scale,
        title: "신구법 비교",
        description: "개정된 법령의 변경 사항을 한눈에 비교하세요. 삭제, 신설, 변경된 조항을 직관적으로 보여줍니다."
    },
    {
        icon: Shield,
        title: "검증된 데이터",
        description: "국가법령정보센터의 공식 데이터를 기반으로 하여 정확하고 신뢰할 수 있는 법률 정보를 제공합니다."
    }
]

export function ProfessionalFeatures() {
    return (
        <section className="py-32 bg-black relative overflow-hidden">
            <div className="container mx-auto px-6 max-w-7xl">
                <div className="mb-20 text-center max-w-3xl mx-auto">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6 text-white">
                        법률 업무의 <span className="text-blue-500">새로운 기준</span>
                    </h2>
                    <p className="text-gray-400 text-lg">
                        LexDiff는 단순한 검색 엔진이 아닙니다. 당신의 법률 업무를 보조하는 강력한 AI 파트너입니다.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {features.map((feature, index) => (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className="group p-8 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors duration-300"
                        >
                            <div className="w-12 h-12 rounded-lg bg-blue-500/10 flex items-center justify-center mb-6 group-hover:bg-blue-500/20 transition-colors">
                                <feature.icon className="w-6 h-6 text-blue-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-3">{feature.title}</h3>
                            <p className="text-gray-400 leading-relaxed text-sm">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    )
}
