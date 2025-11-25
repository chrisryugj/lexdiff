"use client"

import { useState, useEffect } from "react"
import { ProfessionalHeader } from "@/components/professional-header"
import { ProfessionalHero } from "@/components/professional-hero"
import { ProfessionalFeatures } from "@/components/professional-features"
import { ProfessionalFooter } from "@/components/professional-footer"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import type { Favorite } from "@/lib/law-types"

export interface ProfessionalHomeViewProps {
  onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
  onFavoriteSelect: (favorite: Favorite) => void
  isSearching: boolean
  ragLoading: boolean
  searchMode: 'basic' | 'rag'
}

export function ProfessionalHomeView({
  onSearch,
  onFavoriteSelect,
  isSearching,
  ragLoading,
  searchMode,
}: ProfessionalHomeViewProps) {
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
    <div className="min-h-screen bg-black text-white selection:bg-white/20 selection:text-white">
      <ProfessionalHeader
        onReset={handleReset}
        onFavoritesClick={handleFavoritesClick}
        onSettingsClick={handleSettingsClick}
      />

      <main>
        <ProfessionalHero
          onSearch={onSearch}
          isSearching={isSearching || ragLoading}
          searchMode={searchMode}
        />

        <ProfessionalFeatures />
      </main>

      <ProfessionalFooter />

      <FavoritesDialog
        isOpen={favoritesDialogOpen}
        onClose={() => setFavoritesDialogOpen(false)}
        onSelect={onFavoriteSelect}
      />
      <ErrorReportDialog />
    </div>
  )
}
