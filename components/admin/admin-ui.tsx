/**
 * Admin UI Components - LexDiff Professional Edition
 * Shared components for consistent admin interface
 */

import { ReactNode } from 'react'
import { IconType } from '@/lib/icons'
import { Icon } from '@/components/ui/icon'

interface StatCardProps {
  label: string
  value: number | string
  icon?: IconType
  variant?: 'default' | 'primary' | 'accent' | 'warning'
}

export function StatCard({ label, value, icon: iconName, variant = 'default' }: StatCardProps) {
  const variants = {
    default: 'from-card/50 to-card/30 border-border/50',
    primary: 'from-primary/10 via-primary/5 to-transparent border-primary/20',
    accent: 'from-accent/10 via-accent/5 to-transparent border-accent/20',
    warning: 'from-warning/10 via-warning/5 to-transparent border-warning/20'
  }

  const textColors = {
    default: 'text-foreground',
    primary: 'text-primary',
    accent: 'text-accent',
    warning: 'text-warning'
  }

  return (
    <div
      className={`p-4 bg-gradient-to-br ${variants[variant]} backdrop-blur-sm rounded-xl border shadow-sm hover:shadow-md transition-shadow`}
    >
      {iconName && (
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded-lg ${variant === 'default' ? 'bg-muted' : `bg-${variant}/20`}`}>
            <Icon name={iconName} className={`h-4 w-4 ${textColors[variant]}`} />
          </div>
          <div className={`text-sm font-medium ${textColors[variant]}`}>{label}</div>
        </div>
      )}
      {!iconName && <div className={`text-sm ${textColors[variant]} mb-1`}>{label}</div>}
      <div className={`text-3xl font-bold ${textColors[variant]}`}>{value}</div>
    </div>
  )
}

interface ProgressBarProps {
  percent: number
  label?: string
}

export function ProgressBar({ percent, label }: ProgressBarProps) {
  return (
    <div className="space-y-2">
      {label && <div className="text-sm text-muted-foreground">{label}</div>}
      <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-accent to-primary rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"
          style={{ width: '50%' }}
        />
      </div>
    </div>
  )
}

interface InfoCardProps {
  children: ReactNode
}

export function InfoCard({ children }: InfoCardProps) {
  return (
    <div className="p-4 bg-muted/30 backdrop-blur-sm rounded-xl border border-border/50">
      <div className="text-sm text-muted-foreground space-y-1">{children}</div>
    </div>
  )
}

interface ActionBarProps {
  children: ReactNode
}

export function ActionBar({ children }: ActionBarProps) {
  return (
    <div className="flex items-center justify-between p-4 bg-card/50 backdrop-blur-sm rounded-xl border border-border/50 shadow-sm">
      {children}
    </div>
  )
}
