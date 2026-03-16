import React from 'react'

// 짧은 컬럼으로 취급할 헤더 키워드 (숫자/기호성 컬럼만)
const SHORT_COLUMN_KEYWORDS = [
  '순번', 'no', 'no.', '#', '번호',
  '단계', 'step',
  '선택',
  '날짜', '일시',
  '✅', '❌'
]

interface TableProps {
  children: React.ReactNode
}

interface ThProps {
  children: React.ReactNode
  [key: string]: any
}

interface TdProps {
  children: React.ReactNode
}

export function TableRenderer({ children }: TableProps) {
  return (
    <div className="overflow-x-auto my-4 mx-0 sm:mx-3 rounded-md border border-border/50 bg-card/50 -mx-1">
      <table className="w-full border-collapse table-auto" style={{ fontSize: 'inherit', minWidth: '320px' }}>
        {children}
      </table>
    </div>
  )
}

export function TheadRenderer({ children }: TableProps) {
  return (
    <thead className="bg-muted/50 border-b border-border text-xs uppercase text-muted-foreground">
      {children}
    </thead>
  )
}

export function ThRenderer({ children, ...props }: ThProps) {
  // 텍스트 내용 확인
  const textContent = typeof children === 'string'
    ? children.toLowerCase().trim()
    : Array.isArray(children) && typeof children[0] === 'string'
      ? children[0].toLowerCase().trim()
      : ''

  const isShortColumn = SHORT_COLUMN_KEYWORDS.some(k => textContent === k || textContent.includes(k))

  return (
    <th
      className={`
        px-2 sm:px-4 py-2 sm:py-2.5 text-left font-semibold text-foreground/80 align-middle
        ${isShortColumn
          ? 'whitespace-nowrap text-center w-px'
          : 'min-w-[60px] sm:min-w-[100px]'
        }
      `}
      style={{ fontSize: 'inherit' }}
      {...props}
    >
      {children}
    </th>
  )
}

export function TdRenderer({ children }: TdProps) {
  return (
    <td className="px-2 sm:px-4 py-2 sm:py-2.5 border-b border-border/50 text-foreground/90 align-top leading-relaxed break-keep" style={{ fontSize: 'inherit' }}>
      {children}
    </td>
  )
}
