"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ReferenceModalRedesigned } from "./reference-modal-redesigned"
import { ComparisonModalRedesigned } from "./comparison-modal-redesigned"

export default function ModalTestPage() {
  const [showReference, setShowReference] = useState(false)
  const [showComparison, setShowComparison] = useState(false)

  // Sample law content for Reference Modal
  const sampleLawContent = `<div class="law-article">
<h3>제38조 (관세의 감면)</h3>

<p>① 다음 각 호의 어느 하나에 해당하는 물품에 대해서는 그 관세를 감면할 수 있다. <span class="rev-mark">&lt;개정 2020. 12. 29.&gt;</span></p>

<p class="para-marker">1. 우리나라에 주둔하는 국제연합군과 <a href="#" class="law-ref" data-law="주한미군지위협정">주한미군지위협정</a>에 따른 미합중국군대가 사용하는 물품</p>

<p class="para-marker">2. <a href="#" class="law-ref" data-law="외교관계에관한비엔나협약">외교관계에 관한 비엔나협약</a> 또는 <a href="#" class="law-ref" data-law="영사관계에관한비엔나협약">영사관계에 관한 비엔나협약</a>에 따라 특권 또는 면제를 받는 기관이나 사람에게 공급되는 물품</p>

<p class="para-marker">3. 재수출조건부 면세 대상 물품으로서 대통령령으로 정하는 것 <span class="rev-mark">[본조신설 2018. 12. 31.]</span></p>

<p>② 제1항에 따른 관세의 감면에 필요한 사항은 대통령령으로 정한다.</p>

<p>③ 제1항제3호에 따라 관세가 면제된 물품을 수출하지 아니하고 국내에서 소비·사용하려는 경우에는 즉시 세관장에게 신고하여야 하며, 감면된 관세를 납부하여야 한다.</p>
</div>`

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold">Modal Design Test Page</h1>
          <p className="text-muted-foreground">
            테스트할 모달 디자인 미리보기
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="p-6 border rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold">Reference Modal</h2>
            <p className="text-sm text-muted-foreground">
              법령 링크 클릭 시 표시되는 모달 - Editorial Legal Journal 스타일
            </p>
            <Button onClick={() => setShowReference(true)} size="lg" className="w-full">
              Open Reference Modal
            </Button>
          </div>

          <div className="p-6 border rounded-lg space-y-4">
            <h2 className="text-2xl font-semibold">Comparison Modal</h2>
            <p className="text-sm text-muted-foreground">
              신·구법 비교 모달 - Timeline Conversation 스타일
            </p>
            <Button onClick={() => setShowComparison(true)} size="lg" className="w-full">
              Open Comparison Modal
            </Button>
          </div>
        </div>

        <div className="p-6 border rounded-lg space-y-4">
          <h3 className="text-xl font-semibold">Design Principles</h3>
          <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
            <li><strong>Editorial Legal Journal</strong> - 법률 문서의 권위 + 현대 매거진의 가독성</li>
            <li><strong>Typography Hierarchy</strong> - Noto Serif KR (법조문) + Pretendard (UI)</li>
            <li><strong>Document-First Layout</strong> - 콘텐츠 중심, UI는 보조 역할</li>
            <li><strong>Subtle Legal Motifs</strong> - 법전, 문서, 인장 등의 시각적 은유</li>
            <li><strong>Sophisticated Colors</strong> - 법정 가운의 검정, 인장의 붉은색, 양피지 베이지</li>
          </ul>
        </div>
      </div>

      <ReferenceModalRedesigned
        isOpen={showReference}
        onClose={() => setShowReference(false)}
        title="관세법 제38조"
        html={sampleLawContent}
        lawName="관세법"
        articleNumber="38"
      />

      <ComparisonModalRedesigned
        isOpen={showComparison}
        onClose={() => setShowComparison(false)}
        lawTitle="관세법"
        lawId="001729"
        mst="001729"
      />
    </div>
  )
}
