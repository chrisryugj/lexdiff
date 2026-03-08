"use client"

import { Badge } from "@/components/ui/badge"
import type { DelegationGroupCardProps } from "./types"
import { formatDelegationHeader } from "./utils"

export function DelegationGroupCard({
    group,
    fontSize,
    delegationsHtmlCache,
    delegationIndexByRef,
    handleContentClick
}: DelegationGroupCardProps) {
    return (
        <div className="p-3 rounded-lg border border-border">
            <div className="flex items-center justify-between gap-2 mb-2">
                <p className="font-semibold text-sm text-foreground truncate flex-1 min-w-0">
                    {group.lawName}
                </p>
                <Badge variant="outline" className="text-xs shrink-0">
                    {group.items.length}개
                </Badge>
            </div>
            <div className="space-y-3">
                {group.items.map((delegation) => {
                    const originalIdx = delegationIndexByRef.get(delegation)
                    const cacheKey = originalIdx === undefined ? "" : `${delegation.type}-${originalIdx}`
                    const itemKey =
                        cacheKey || `${group.lawName}-${delegation.jo || ""}-${delegation.joNum || ""}-${delegation.title || ""}`
                    const header = formatDelegationHeader(delegation.joNum, delegation.title)
                    return (
                        <div key={itemKey || header} className="pt-3 border-t border-border first:border-t-0 first:pt-0">
                            {header && (
                                <p className="font-semibold text-sm text-foreground mb-2 font-maruburi">
                                    {header}
                                </p>
                            )}
                            {delegation.content && (
                                <div
                                    className="text-xs text-foreground leading-relaxed break-words font-maruburi"
                                    style={{
                                        fontSize: `${fontSize}px`,
                                        lineHeight: "1.8",
                                        overflowWrap: "break-word",
                                        wordBreak: "break-word",
                                    }}
                                    onClick={handleContentClick}
                                    dangerouslySetInnerHTML={{ __html: cacheKey ? delegationsHtmlCache.get(cacheKey) || '' : '' }}
                                />
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
