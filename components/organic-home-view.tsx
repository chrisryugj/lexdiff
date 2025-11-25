"use client"

import { useState } from "react"
import { OrganicHeader } from "@/components/organic-header"
import { OrganicHero } from "@/components/organic-hero"
import { OrganicFeatures } from "@/components/organic-features"
import { OrganicFooter } from "@/components/organic-footer"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import type { Favorite } from "@/lib/law-types"

export interface OrganicHomeViewProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
  onFavoriteSelect: (favorite: Favorite) => void
  isSearching: boolean
  ragLoading: boolean
  searchMode: 'basic' | 'rag'
}

export function OrganicHomeView({
  onSearch,
  onFavoriteSelect,
  isSearching,
  ragLoading,
  searchMode,
}: OrganicHomeViewProps) {
  const [favoritesDialogOpen, setFavoritesDialogOpen] = useState(false)

  const handleReset = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleFavoritesClick = () => {
    setFavoritesDialogOpen(true)
  }

  const handleSettingsClick = () => {
    window.location.href = '/admin/settings'
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] text-[#1a1a1a] selection:bg-amber-200/60 overflow-x-hidden">
      {/* Organic Grain Texture Overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-[1000] opacity-[0.03]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <OrganicHeader
        onReset={handleReset}
        onFavoritesClick={handleFavoritesClick}
        onSettingsClick={handleSettingsClick}
      />

      <main className="relative z-10">
        <OrganicHero
          onSearch={onSearch}
          isSearching={isSearching || ragLoading}
          searchMode={searchMode}
        />

        <OrganicFeatures />
      </main>

      <OrganicFooter />

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={onFavoriteSelect}
      />
      <ErrorReportDialog />
    </div>
  )
}
