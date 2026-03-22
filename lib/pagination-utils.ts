/**
 * lib/pagination-utils.ts
 *
 * 공유 페이지네이션 유틸리티
 */

/**
 * 페이지네이션 번호 배열 생성
 *
 * - totalPages <= 7: 모든 페이지 표시
 * - currentPage 앞쪽: [1, 2, 3, 4, 5, '...', total]
 * - currentPage 뒤쪽: [1, '...', total-4, total-3, total-2, total-1, total]
 * - currentPage 중앙: [1, '...', current-1, current, current+1, '...', total]
 */
export function generatePageNumbers(currentPage: number, totalPages: number): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const pages: (number | string)[] = []

  if (currentPage <= 4) {
    pages.push(1, 2, 3, 4, 5, '...', totalPages)
  } else if (currentPage >= totalPages - 3) {
    pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
  } else {
    pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages)
  }

  return pages
}
