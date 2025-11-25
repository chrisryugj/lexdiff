"use client"

import { useState } from "react"
import { FuturisticHeader } from "@/components/futuristic-header"
import { FuturisticHero } from "@/components/futuristic-hero"
import { FuturisticFeatures } from "@/components/futuristic-features"
import { FuturisticFooter } from "@/components/futuristic-footer"
import { FavoritesDialog } from "@/components/favorites-dialog"
import { ErrorReportDialog } from "@/components/error-report-dialog"
import type { Favorite } from "@/lib/law-types"

export interface FuturisticHomeViewProps {
    onSearch: (query: { lawName: string; article?: string; jo?: string }) => Promise<void>
    onFavoriteSelect: (favorite: Favorite) => void
    isSearching: boolean
    ragLoading: boolean
    searchMode: 'basic' | 'rag'
}

export function FuturisticHomeView({
    onSearch,
    onFavoriteSelect,
    isSearching,
    ragLoading,
    searchMode,
}: FuturisticHomeViewProps) {
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
        <div className="min-h-screen bg-[#030014] text-white selection:bg-purple-500/30 selection:text-purple-200 overflow-x-hidden">
            <FuturisticHeader
                onReset={handleReset}
                onFavoritesClick={handleFavoritesClick}
                onSettingsClick={handleSettingsClick}
            />

            <main className="relative z-10">
                <FuturisticHero
                    onSearch={onSearch}
                    isSearching={isSearching || ragLoading}
                    searchMode={searchMode}
                />

                <FuturisticFeatures />
            </main>

            <FuturisticFooter />

            <FavoritesDialog
                isOpen={favoritesDialogOpen}
                onClose={() => setFavoritesDialogOpen(false)}
                onSelect={onFavoriteSelect}
            />
            <ErrorReportDialog />
        </div>
    )
}
