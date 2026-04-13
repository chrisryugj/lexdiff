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

interface UserMenuProps {
  onLoginClick: () => void
  onFavoriteSelect: (fav: Favorite) => void
  onAllFavoritesClick?: () => void
}

export function UserMenu({ onLoginClick, onFavoriteSelect, onAllFavoritesClick }: UserMenuProps) {
  const [user, setUser] = useState<User | null>(null)
  const [favorites, setFavorites] = useState<Favorite[]>([])

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

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient()
    await supabase.auth.signOut()
    setUser(null)
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt={name} className="h-7 w-7 rounded-full" />
          ) : (
            <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
              {initial}
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold truncate">{name}</span>
          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Icon name="star" size={13} className="text-amber-500" />
            즐겨찾기
          </span>
          <span className="text-[10px]">{favorites.length}개</span>
        </DropdownMenuLabel>
        {previewFavorites.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground text-center">
            아직 즐겨찾기가 없습니다
          </div>
        ) : (
          previewFavorites.map((fav, idx) => (
            <DropdownMenuItem
              key={`${fav.lawTitle}-${fav.jo || ''}-${idx}`}
              onClick={() => onFavoriteSelect(fav)}
              className="flex flex-col items-start gap-0.5 cursor-pointer"
            >
              <span className="text-xs font-medium truncate w-full">{fav.lawTitle}</span>
              {fav.jo && (
                <span className="text-[10px] text-muted-foreground">{formatJO(fav.jo)}</span>
              )}
            </DropdownMenuItem>
          ))
        )}
        {favorites.length > 5 && onAllFavoritesClick && (
          <DropdownMenuItem onClick={onAllFavoritesClick} className="text-xs justify-center text-primary">
            전체 보기 ({favorites.length})
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut} className="text-red-600 dark:text-red-400">
          <Icon name="x" size={14} className="mr-2" />
          로그아웃
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
