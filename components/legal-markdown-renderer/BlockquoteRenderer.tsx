import React from 'react'

/**
 * 텍스트 추출 헬퍼 (인라인 요소용 - 공백으로 연결)
 */
function getTextInner(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getTextInner).join('')
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    if (props?.children) return getTextInner(props.children)
  }
  return ''
}

/**
 * 텍스트 추출 헬퍼 (블록 요소용 - 줄바꿈으로 연결)
 */
function getText(node: React.ReactNode): string {
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(getText).join('\n')
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode }
    if (props?.children) return getTextInner(props.children)
  }
  return ''
}

/**
 * 노드 트리 분할 헬퍼
 */
function splitNodes(nodes: React.ReactNode[], splitIndex: number): [React.ReactNode[], React.ReactNode[]] {
  let currentLength = 0
  const left: React.ReactNode[] = []
  const right: React.ReactNode[] = []
  let splitFound = false

  React.Children.forEach(nodes, (node, index) => {
    if (splitFound) {
      right.push(node)
      return
    }

    const nodeText = getTextInner(node)
    const nodeLength = nodeText.length

    if (currentLength + nodeLength <= splitIndex) {
      left.push(node)
      currentLength += nodeLength
    } else {
      splitFound = true
      const localSplitIndex = splitIndex - currentLength

      if (typeof node === 'string') {
        left.push(node.substring(0, localSplitIndex))
        right.push(node.substring(localSplitIndex))
      } else if (React.isValidElement(node)) {
        const props = node.props as { children?: React.ReactNode }
        const childNodes = React.Children.toArray(props.children)
        const [childLeft, childRight] = splitNodes(childNodes, localSplitIndex)

        const baseKey = node.key || `split-${index}`

        if (childLeft.length > 0) {
          left.push(React.cloneElement(node, {
            ...props,
            key: `${baseKey}-left`,
            children: childLeft
          } as React.Attributes & { children?: React.ReactNode }))
        }
        if (childRight.length > 0) {
          right.push(React.cloneElement(node, {
            ...props,
            key: `${baseKey}-right`,
            children: childRight
          } as React.Attributes & { children?: React.ReactNode }))
        }
      } else {
        left.push(node)
      }
      currentLength += nodeLength
    }
  })

  return [left, right]
}

/**
 * 괄호 제거 헬퍼
 */
function removeParentheses(nodes: React.ReactNode[]): React.ReactNode[] {
  return nodes.map((node, i) => {
    if (typeof node === 'string') {
      return node.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
    }
    if (React.isValidElement(node)) {
      const props = node.props as { children?: React.ReactNode; key?: React.Key }
      const newChildren = props.children ? removeParentheses(React.Children.toArray(props.children)) : undefined
      return React.cloneElement(node, {
        ...props,
        children: newChildren
      } as any)
    }
    return node
  })
}

/**
 * [부분 인용] 텍스트 제거 헬퍼
 */
function removePartialQuoteText(nodes: React.ReactNode[]): React.ReactNode[] {
  return nodes.map((node) => {
    if (typeof node === 'string') {
      return node.replace(/\s*\[?\s*부분\s*인용\s*\]?\s*/gi, ' ').trim()
    }
    if (React.isValidElement(node)) {
      const props = node.props as { children?: React.ReactNode }
      const newChildren = props.children ? removePartialQuoteText(React.Children.toArray(props.children)) : undefined
      return React.cloneElement(node, {
        ...props,
        children: newChildren
      } as any)
    }
    return node
  })
}

/**
 * [...] 를 인라인 배지로 대체하는 헬퍼
 */
function replaceOmittedWithBadge(nodes: React.ReactNode[]): React.ReactNode[] {
  return nodes.flatMap((node, idx) => {
    if (typeof node === 'string') {
      const parts = node.split(/(\[\.{3}\]|\[…\])/)
      return parts.map((part, i) => {
        if (part === '[...]' || part === '[…]') {
          return (
            <span
              key={`omit-${idx}-${i}`}
              className="inline-flex items-center mx-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/30 rounded cursor-help align-middle"
              title="이하 내용이 생략되었습니다. 링크를 통해 전문을 확인하세요."
            >
              이하 생략
            </span>
          )
        }
        return part
      })
    }
    if (React.isValidElement(node)) {
      const props = node.props as { children?: React.ReactNode }
      const newChildren = props.children ? replaceOmittedWithBadge(React.Children.toArray(props.children)) : undefined
      return React.cloneElement(node, {
        ...props,
        children: newChildren
      } as any)
    }
    return node
  })
}

interface BlockquoteRendererProps {
  children: React.ReactNode
}

/**
 * 법령 조문 인용 블록 렌더러
 * - 조문 제목/본문 분리
 * - [부분 인용] 배지 표시
 * - [...] 생략 표시
 */
export function BlockquoteRenderer({ children }: BlockquoteRendererProps) {
  const childrenArray = React.Children.toArray(children)
  const fullText = getText(childrenArray).trim()

  // 법령 조문 패턴: "법령명 제N조 (제목) 본문" 형태 파싱
  const match = fullText.match(/^(.+?(?:조|항|호)(?:의\d+)?(?:\s*\(.*?\))?)([\s\n]+)([\s\S]+)$/)

  if (match) {
    const titleText = match[1]
    const separatorText = match[2]

    const titleEndIndex = fullText.indexOf(titleText) + titleText.length
    const separatorLength = separatorText.length

    // 1차 분할: Title vs (Separator + Content)
    const [titleNodes, restNodes] = splitNodes(childrenArray, titleEndIndex)

    // 2차 분할: Separator vs Content
    const [, contentNodes] = splitNodes(restNodes, separatorLength)

    const cleanTitleNodes = removeParentheses(titleNodes)

    // [부분 인용] 감지
    const isPartialQuote = /\[?\s*부분\s*인용\s*\]?/i.test(fullText)
    // [...] 감지 (이하 생략)
    const isOmitted = fullText.includes('[...]') || fullText.includes('[…]')

    const finalTitleNodes = isPartialQuote ? removePartialQuoteText(cleanTitleNodes) : cleanTitleNodes
    let processedContentNodes = isPartialQuote ? removePartialQuoteText(contentNodes) : contentNodes
    const finalContentNodes = isOmitted ? replaceOmittedWithBadge(processedContentNodes) : processedContentNodes

    return (
      <blockquote className="border-l-4 border-primary/40 bg-muted/30 pl-3 !pr-4 py-0.5 my-2 rounded-r-md !ml-3 !mr-3 not-italic overflow-visible">
        <div className="flex flex-col gap-0 [&_p]:my-0 [&_p]:leading-relaxed">
          {/* 조문 제목 Group */}
          <div className="text-[#a0a0a0] font-normal text-sm break-words flex items-center gap-1.5 flex-wrap [&_strong]:font-normal [&_b]:font-normal">
            {finalTitleNodes}
            {isPartialQuote && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 rounded cursor-help"
                title="부분 인용된 조문입니다. 링크를 통해 전문을 확인하세요."
              >
                부분 인용
              </span>
            )}
          </div>
          {/* 조문 본문 Group */}
          <div className="text-foreground dark:text-white text-sm leading-relaxed mt-0.5">
            {finalContentNodes}
          </div>
        </div>
      </blockquote>
    )
  }

  // 기본 렌더링
  return (
    <blockquote className="border-l-4 border-primary/40 bg-muted/30 pl-3 !pr-4 py-0.5 my-1 rounded-r-md !ml-0 !mr-0 not-italic overflow-visible [&_p]:my-0 [&_p:first-of-type]:text-muted-foreground [&_p:first-of-type]:mb-1 [&_p:not(:first-of-type)]:text-foreground dark:[&_p:not(:first-of-type)]:text-white">
      <div className="leading-relaxed">
        {children}
      </div>
    </blockquote>
  )
}
