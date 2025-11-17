"use client"

import { Sparkles, GitCompare, Star, Scale, Zap, Shield } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

const features = [
  {
    icon: Sparkles,
    title: "AI 자연어 검색",
    description: "일상 언어로 질문하면 AI가 관련 법령을 찾아 실시간으로 답변합니다",
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    icon: GitCompare,
    title: "법령 비교 분석",
    description: "구법과 신법을 나란히 비교하고 AI가 변경 내용을 요약해드립니다",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    icon: Star,
    title: "스마트 즐겨찾기",
    description: "자주 찾는 법령을 저장하고 빠르게 접근할 수 있습니다",
    color: "text-amber-600",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    icon: Scale,
    title: "3단 비교 시스템",
    description: "법률-시행령-시행규칙을 한눈에 비교하고 위임관계를 파악합니다",
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  {
    icon: Zap,
    title: "실시간 업데이트",
    description: "법제처 API와 연동하여 항상 최신 법령 정보를 제공합니다",
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/30",
  },
  {
    icon: Shield,
    title: "행정규칙 검색",
    description: "법령과 연관된 훈령, 예규, 고시 등을 자동으로 찾아드립니다",
    color: "text-cyan-600",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/30",
  },
]

export function FeatureCards() {
  return (
    <div className="w-full max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <h3 className="text-2xl font-bold text-foreground mb-2" style={{ fontFamily: "Pretendard, sans-serif" }}>주요 기능</h3>
        <p className="text-muted-foreground" style={{ fontFamily: "Pretendard, sans-serif" }}>LexDiff가 제공하는 강력한 법령 검색 도구</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => {
          const Icon = feature.icon
          return (
            <Card
              key={index}
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50 animate-fade-in"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <CardContent className="p-6">
                <div className={`${feature.bgColor} w-12 h-12 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className={`h-6 w-6 ${feature.color}`} />
                </div>
                <h4 className="text-lg font-semibold text-foreground mb-2" style={{ fontFamily: "Pretendard, sans-serif" }}>{feature.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed" style={{ fontFamily: "Pretendard, sans-serif" }}>{feature.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
