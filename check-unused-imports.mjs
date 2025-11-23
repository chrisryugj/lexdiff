#!/usr/bin/env node

/**
 * Check for unused imports in law-viewer.tsx
 */

import { readFileSync } from 'fs'

const filePath = 'components/law-viewer.tsx'
const content = readFileSync(filePath, 'utf-8')

// Extract all named imports
const imports = [
  'React',
  'useState', 'useEffect', 'useRef', 'useMemo', 'useCallback',
  'Panel', 'PanelGroup', 'PanelResizeHandle',
  'Card', 'Button', 'Badge', 'ScrollArea', 'Separator',
  'Tabs', 'TabsList', 'TabsTrigger', 'TabsContent',
  'BookOpen', 'GitCompare', 'Star', 'Sparkles', 'AlertCircle',
  'ZoomIn', 'ZoomOut', 'RotateCcw', 'ExternalLink',
  'ChevronDown', 'ChevronUp', 'Bookmark', 'BookmarkCheck',
  'FileText', 'Link2', 'Eye', 'Loader2', 'RefreshCw', 'ShieldCheck',
  'Copy', 'CheckCircle2', 'AlertTriangle', 'FileSearch', 'Check',
  'Calendar', 'ListOrdered', 'Building2', 'GitMerge', 'MessageCircleQuestion',
  'LawArticle', 'LawMeta', 'ThreeTierData',
  'extractArticleText', 'formatDelegationContent',
  'buildJO', 'formatJO', 'ParsedRelatedLaw', 'parseRelatedLawTitle',
  'ReferenceModal', 'RevisionHistory', 'ArticleBottomSheet',
  'FloatingActionButton', 'VirtualizedArticleList', 'VirtualizedFullArticleView',
  'DelegationLoadingSkeleton', 'SwipeTutorial', 'SwipeHint',
  'parseArticleHistoryXML', 'useAdminRules', 'AdminRuleMatch',
  'parseAdminRuleContent', 'formatAdminRuleHTML',
  'getAdminRuleContentCache', 'setAdminRuleContentCache', 'clearAdminRuleContentCache',
  'useToast', 'useSwipe', 'convertAIAnswerToHTML', 'debugLogger', 'VerifiedCitation'
]

const unused = []
const used = []

for (const name of imports) {
  // Create regex to find usage (but not in import line)
  const importLinePattern = new RegExp(`^import.*${name}`, 'm')
  const usagePattern = new RegExp(`\\b${name}\\b`, 'g')

  // Remove import lines before searching
  const contentWithoutImports = content.split('\n').slice(62).join('\n')

  const matches = contentWithoutImports.match(usagePattern)

  if (!matches || matches.length === 0) {
    unused.push(name)
  } else {
    used.push({ name, count: matches.length })
  }
}

console.log('=== Unused Imports ===')
if (unused.length === 0) {
  console.log('✅ No unused imports found!')
} else {
  unused.forEach(name => console.log(`  ❌ ${name}`))
}

console.log('\n=== Usage Summary ===')
console.log(`Total imports: ${imports.length}`)
console.log(`Used: ${used.length}`)
console.log(`Unused: ${unused.length}`)
