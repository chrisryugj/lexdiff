# 헌법 검색 및 아이콘 표시 구현

## 요약
"헌법" 검색 시 바로 매칭되도록 alias 추가하고, 법령 뷰어에서 헌법 전용 아이콘/배지 표시

## 수정 파일

### 1. `lib/search-normalizer.ts`
- `LAW_ALIAS_ENTRIES`에 헌법 alias 추가:
```typescript
{
  canonical: "대한민국헌법",
  aliases: ["헌법", "헌 법"],
}
```

### 2. `components/law-viewer.tsx`
- lucide-react에서 `Landmark` 아이콘 import 추가 (헌법 아이콘으로 사용)
- 1283줄 Badge 표시 로직 수정:
```typescript
// 현재
{isOrdinance ? "자치법규" : "법률"}

// 변경
{isOrdinance ? "자치법규" : lawTitle === "대한민국헌법" ? "헌법" : "법률"}
```
- 헌법일 경우 배지 스타일도 차별화 (예: 금색 배경)

### 3. (선택) 다른 Badge 위치들
- 934줄, 975줄, 1029줄 등 다른 법령 타입 배지에도 동일 로직 적용 필요 시 확인

## 구현 순서
1. alias 추가 (search-normalizer.ts)
2. 법령 뷰어 배지 수정 (law-viewer.tsx)
3. 테스트: "헌법" 검색 → 바로 뷰어 진입 확인
4. 커밋/푸시
