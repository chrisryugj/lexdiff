"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface LawSearchResult {
  lawId?: string
  mst?: string
  lawName: string
  lawType: string
  promulgationDate?: string
  effectiveDate?: string
}

interface LawSelectorProps {
  results: LawSearchResult[]
  query?: { lawName: string; article?: string; jo?: string }
  onSelect: (law: LawSearchResult) => void
  onCancel: () => void
}

export function LawSelector({ results, query, onSelect, onCancel }: LawSelectorProps) {
  return (
    <div className="w-full max-w-4xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>법령 선택</CardTitle>
          <CardDescription>
            검색 결과 {results.length}개의 법령이 있습니다. 조회할 법령을 선택하세요.
            {query?.article && <span className="block mt-2 text-foreground font-medium">조문: {query.article}</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-3">
              {results.map((law) => (
                <Card
                  key={law.lawId || law.mst || law.lawName}
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onSelect(law)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-lg">{law.lawName}</h3>
                          <Badge variant="secondary">{law.lawType}</Badge>
                        </div>
                        <div className="text-sm text-muted-foreground space-y-1">
                          {law.promulgationDate && <div>공포일자: {law.promulgationDate}</div>}
                          {law.effectiveDate && <div>시행일자: {law.effectiveDate}</div>}
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        선택
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" onClick={onCancel}>
              취소
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
