/**
 * SearchBar - 하위 호환 Facade
 *
 * 기존 import 유지: import { SearchBar } from "@/components/search-bar"
 * 새 모듈: components/search-bar/index.tsx
 *
 * @updated 2026-01-22 Phase 4 모듈화
 */

export { SearchBar } from "./search-bar/index"
export type { SearchBarProps, SearchQuery, Suggestion } from "./search-bar/types"
