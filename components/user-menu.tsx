'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { getSupabaseBrowserClient } from '@/lib/supabase/browser'
import { favoritesStore } from '@/lib/favorites-store'
import type { Favorite } from '@/lib/law-types'
import { formatJO } from '@/lib/law-parser'
import { LegalDocDialog, type LegalDoc } from '@/components/legal/legal-doc-dialog'
import { PrivacySettingsDialog } from '@/components/legal/privacy-settings-dialog'

interface UserMenuProps {
  onLoginClick: () => void
  onFavoriteSelect: (fav: Favorite) => void
  onAllFavoritesClick?: () => void
}

type QuotaFeature = 'fc_rag' | 'summarize' | 'benchmark' | 'impact'
interface QuotaData {
  tier: 'free' | 'pro' | 'admin'
  counts: Record<QuotaFeature, number>
  limits: Record<QuotaFeature, number> | null
}

const FEATURE_LABELS: Record<QuotaFeature, string> = {
  fc_rag: 'AI 검색',
  summarize: '요약',
  benchmark: '벤치마크',
  impact: '영향 추적',
}

export function UserMenu({ onLoginClick, onFavoriteSelect, onAllFavoritesClick }: UserMenuProps) {
  const [user, setUser] = useState<User | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [avatarFailed, setAvatarFailed] = useState(false)
  const [quota, setQuota] = useState<QuotaData | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [docOpen, setDocOpen] = useState<LegalDoc | null>(null)
  const [privacySettingsOpen, setPrivacySettingsOpen] = useState(false)

  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const unsub = favoritesStore.subscribe(setFavorites)
    setFavorites(favoritesStore.getFavorites())
    return () => { unsub() }
  }, [])

  // 메뉴 열릴 때마다 최신 쿼터 fetch
  useEffect(() => {
    if (!menuOpen || !user) return
    fetch('/api/quota').then(async r => {
      if (r.ok) setQuota(await r.json())
    }).catch(() => { /* ignore */ })
  }, [menuOpen, user])

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    // 1. 클라이언트 세션 제거 (localStorage/쿠키)
    await supabase.auth.signOut()
    // 2. 서버 라우트로 POST → 서버 쿠키까지 확실히 제거 + 리다이렉트
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = '/auth/signout'
    document.body.appendChild(form)
    form.submit()
  }

  if (!user) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={onLoginClick}
        className="flex items-center gap-2"
      >
        <Icon name="user" size={18} />
        <span className="hidden sm:inline text-xs">로그인</span>
      </Button>
    )
  }

  const initial = (user.email?.[0] || '?').toUpperCase()
  const name = (user.user_metadata?.full_name as string) || user.email || ''
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined
  const previewFavorites = favorites.slice(0, 5)
  const isAdmin = quota?.tier === 'admin'

  return (
    <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="사용자 메뉴"
          className="group relative rounded-full p-0 bg-transparent border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-all duration-200"
        >
          <span className="absolute inset-0 rounded-full ring-1 ring-border group-hover:ring-brand-gold/60 group-hover:shadow-[0_0_0_3px_rgba(191,149,63,0.12)] transition-all duration-200 pointer-events-none" />
          {avatarUrl && !avatarFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              referrerPolicy="no-referrer"
              onError={() => setAvatarFailed(true)}
              className="h-8 w-8 rounded-full object-cover transition-transform duration-200 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy/80 text-white flex items-center justify-center text-xs font-semibold transition-transform duration-200 group-hover:scale-[1.04]">
              {initial}
            </div>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[19rem] p-0 overflow-hidden rounded-xl border border-border/80 shadow-xl">
        {/* 프로필 헤더 */}
        <div className="relative px-5 pt-5 pb-4 bg-gradient-to-br from-brand-navy/[0.07] via-background to-brand-gold/[0.06]">
          <div className="flex items-center gap-3">
            <div className="relative">
              {avatarUrl && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt={name}
                  referrerPolicy="no-referrer"
                  className="h-11 w-11 rounded-full object-cover ring-2 ring-background shadow-sm"
                />
              ) : (
                <div className="h-11 w-11 rounded-full bg-gradient-to-br from-brand-navy to-brand-navy/70 text-white flex items-center justify-center text-sm font-semibold ring-2 ring-background shadow-sm">
                  {initial}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold truncate">{name}</span>
                {isAdmin && (
                  <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-gradient-to-b from-brand-gold/25 to-brand-gold/10 text-brand-gold ring-1 ring-brand-gold/30">
                    ADMIN
                  </span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground truncate block mt-0.5">{user.email}</span>
            </div>
          </div>
        </div>

        {/* 쿼터 사용량 */}
        <div className="px-5 py-3.5 border-t border-border/60">
          {isAdmin ? (
            <div className="flex items-center gap-2.5 rounded-lg bg-gradient-to-r from-brand-gold/10 to-brand-gold/[0.03] ring-1 ring-brand-gold/25 px-3 py-2.5">
              <div className="h-7 w-7 rounded-md bg-brand-gold/20 flex items-center justify-center">
                <Icon name="sparkles" size={14} className="text-brand-gold" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-brand-gold">무제한 플랜</div>
                <div className="text-[10px] text-muted-foreground">모든 AI 기능 자유 사용</div>
              </div>
            </div>
          ) : (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                오늘 사용량
              </div>
              {!quota ? (
                <div className="text-[11px] text-muted-foreground">불러오는 중...</div>
              ) : (
                <div className="space-y-2">
                  {(Object.keys(FEATURE_LABELS) as QuotaFeature[]).map(key => {
                    const used = quota.counts[key] || 0
                    const limit = quota.limits?.[key]
                    const pct = limit ? Math.min(100, (used / limit) * 100) : 0
                    return (
                      <div key={key} className="flex items-center gap-2.5 text-[11px]">
                        <span className="w-14 text-muted-foreground">{FEATURE_LABELS[key]}</span>
                        {limit ? (
                          <>
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-navy'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="tabular-nums text-muted-foreground w-11 text-right">
                              {used}/{limit}
                            </span>
                          </>
                        ) : (
                          <span className="flex-1 text-brand-gold">무제한</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* 즐겨찾기 */}
        <div className="border-t border-border/60 pt-2.5 pb-1">
          <div className="px-5 pb-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon name="star" size={12} className="text-amber-500" />
              즐겨찾기
            </span>
            <span className="text-[10px] text-muted-foreground">{favorites.length}</span>
          </div>
          {previewFavorites.length === 0 ? (
            <div className="px-5 pb-2 text-[11px] text-muted-foreground/80 italic">
              아직 즐겨찾기가 없습니다
            </div>
          ) : (
            <div className="px-2">
              {previewFavorites.map((fav, idx) => (
                <DropdownMenuItem
                  key={`${fav.lawTitle}-${fav.jo || ''}-${idx}`}
                  onClick={() => onFavoriteSelect(fav)}
                  className="flex flex-col items-start gap-0.5 cursor-pointer rounded-md px-3 py-1.5 focus:bg-brand-navy/5"
                >
                  <span className="text-xs font-medium truncate w-full">{fav.lawTitle}</span>
                  {fav.jo && (
                    <span className="text-[10px] text-muted-foreground">{formatJO(fav.jo)}</span>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          )}
          {favorites.length > 5 && onAllFavoritesClick && (
            <div className="px-2">
              <DropdownMenuItem onClick={onAllFavoritesClick} className="text-[11px] justify-center text-primary rounded-md">
                전체 보기 ({favorites.length})
              </DropdownMenuItem>
            </div>
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <div className="p-1.5">
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setMenuOpen(false); setPrivacySettingsOpen(true) }}
            className="rounded-md px-3 py-2 text-[12px] cursor-pointer"
          >
            <Icon name="shield" size={13} className="mr-2" />
            개인정보 설정
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setMenuOpen(false); setDocOpen('terms') }}
            className="rounded-md px-3 py-2 text-[12px] text-muted-foreground cursor-pointer"
          >
            이용약관
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => { e.preventDefault(); setMenuOpen(false); setDocOpen('privacy') }}
            className="rounded-md px-3 py-2 text-[12px] text-muted-foreground cursor-pointer"
          >
            개인정보처리방침
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleSignOut}
            className="rounded-md px-3 py-2 text-[12px] text-muted-foreground focus:bg-red-500/10 focus:text-red-600 dark:focus:text-red-400 cursor-pointer"
          >
            <Icon name="x" size={13} className="mr-2" />
            로그아웃
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
      <LegalDocDialog doc={docOpen} onClose={() => setDocOpen(null)} />
      <PrivacySettingsDialog open={privacySettingsOpen} onClose={() => setPrivacySettingsOpen(false)} />
    </DropdownMenu>
  )
}
