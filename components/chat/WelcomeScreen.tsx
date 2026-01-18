'use client'

import { m, type Variants } from 'framer-motion'
import { Icon } from '@/components/ui/icon'

interface WelcomeScreenProps {
  onExampleClick: (query: string, mode: 'law' | 'ai') => void
}

const EXAMPLES = [
  {
    icon: 'file-text' as const,
    text: '관세법 제38조',
    description: '특정 조문 바로가기',
    mode: 'law' as const,
    color: 'blue'
  },
  {
    icon: 'help-circle' as const,
    text: '관세법 신고납부 요건이 뭐야?',
    description: '요건/조건 질문',
    mode: 'ai' as const,
    color: 'purple'
  },
  {
    icon: 'git-compare' as const,
    text: '징계처분과 해임의 차이',
    description: '비교 질문',
    mode: 'ai' as const,
    color: 'purple'
  },
  {
    icon: 'sparkles' as const,
    text: '지방세 감면 특례 대상은?',
    description: '면제/특례 질문',
    mode: 'ai' as const,
    color: 'purple'
  },
]

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2,
    },
  },
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1],
    },
  },
}

export function WelcomeScreen({ onExampleClick }: WelcomeScreenProps) {
  return (
    <m.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 py-12"
    >
      {/* Logo */}
      <m.div variants={itemVariants} className="flex items-center gap-3 mb-4">
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-xl shadow-purple-500/20">
            <Icon name="scale" className="w-8 h-8 text-white" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center border-2 border-background">
            <Icon name="sparkles" className="w-3 h-3 text-white" />
          </div>
        </div>
      </m.div>

      {/* Title */}
      <m.h1
        variants={itemVariants}
        className="text-4xl md:text-5xl font-bold text-foreground mb-2"
        style={{ fontFamily: 'GiantsInline, sans-serif' }}
      >
        LexDiff
      </m.h1>

      <m.p
        variants={itemVariants}
        className="text-lg text-muted-foreground mb-2"
      >
        AI Legal Platform
      </m.p>

      <m.p
        variants={itemVariants}
        className="text-sm text-muted-foreground/70 mb-10 text-center max-w-md"
      >
        법령 검색부터 AI 분석까지, 대한민국 법률 정보를 가장 쉽고 빠르게
      </m.p>

      {/* Example cards */}
      <m.div
        variants={itemVariants}
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl"
      >
        {EXAMPLES.map((example) => {
          return (
            <button
              key={example.text}
              onClick={() => onExampleClick(example.text, example.mode)}
              className={`
                group flex items-start gap-3 p-4 rounded-xl border-2
                transition-all duration-200 text-left
                hover:scale-[1.02] active:scale-[0.98]
                ${example.color === 'blue'
                  ? 'border-blue-500/20 hover:border-blue-500/50 hover:bg-blue-500/5'
                  : 'border-purple-500/20 hover:border-purple-500/50 hover:bg-purple-500/5'
                }
              `}
            >
              <div className={`
                flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                ${example.color === 'blue'
                  ? 'bg-blue-500/10 text-blue-500'
                  : 'bg-purple-500/10 text-purple-500'
                }
              `}>
                <Icon name={example.icon} className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {example.text}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {example.description}
                </p>
              </div>
              <div className={`
                text-xs px-2 py-1 rounded-full
                ${example.color === 'blue'
                  ? 'bg-blue-500/10 text-blue-500'
                  : 'bg-purple-500/10 text-purple-500'
                }
              `}>
                {example.mode === 'law' ? '법령' : 'AI'}
              </div>
            </button>
          )
        })}
      </m.div>
    </m.div>
  )
}
