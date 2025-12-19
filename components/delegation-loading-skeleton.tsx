import { Icon } from "@/components/ui/icon"

export function DelegationLoadingSkeleton() {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <Icon name="loader" className="h-8 w-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">
        위임 조문을 불러오는 중...
      </p>
      <div className="w-full max-w-md space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
            <div className="h-3 bg-muted rounded w-full"></div>
            <div className="h-3 bg-muted rounded w-5/6 mt-1"></div>
          </div>
        ))}
      </div>
    </div>
  )
}
