import type { DelegationItem } from "@/lib/law-types"
import type { DelegationGroup } from "./types"

export function normalizeDelegationLawName(item: DelegationItem, baseLawTitle: string): string {
    const name = (item.lawName || "").trim()
    if (name) return name
    if (item.type === "시행령") return `${baseLawTitle} 시행령`
    if (item.type === "시행규칙") return `${baseLawTitle} 시행규칙`
    if (item.type === "행정규칙") return "행정규칙"
    return baseLawTitle
}

export function groupDelegationsByLawName(items: DelegationItem[], baseLawTitle: string): DelegationGroup[] {
    const groups: DelegationGroup[] = []
    const idxByName = new Map<string, number>()

    for (const item of items) {
        const lawName = normalizeDelegationLawName(item, baseLawTitle)
        const idx = idxByName.get(lawName)
        if (idx === undefined) {
            idxByName.set(lawName, groups.length)
            groups.push({ lawName, items: [item] })
        } else {
            groups[idx].items.push(item)
        }
    }

    return groups
}

export function formatDelegationHeader(joNum?: string, title?: string): string {
    const j = (joNum || "").trim()
    const t = (title || "").trim()
    if (!j) return t
    if (!t) return j

    const compactJ = j.replace(/\s+/g, "")
    const compactT = t.replace(/\s+/g, "")
    if (compactT.startsWith(compactJ)) return t

    if (t.startsWith("(") || t.startsWith("（")) return `${j}${t}`
    return `${j}(${t})`
}
