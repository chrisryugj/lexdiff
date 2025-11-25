"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Scale, Star, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"

interface ProfessionalHeaderProps {
    onReset?: () => void
    onFavoritesClick?: () => void
    onSettingsClick?: () => void
    className?: string
}

export function ProfessionalHeader({ onReset, onFavoritesClick, onSettingsClick, className }: ProfessionalHeaderProps) {
    const [favoritesCount, setFavoritesCount] = useState(0)
    const [scrolled, setScrolled] = useState(false)

    useEffect(() => {
        const unsubscribe = favoritesStore.subscribe((favs) => {
            setFavoritesCount(favs.length)
        })
        setFavoritesCount(favoritesStore.getFavorites().length)

        const handleScroll = () => {
            setScrolled(window.scrollY > 20)
        }
        window.addEventListener("scroll", handleScroll)

        return () => {
            unsubscribe()
            window.removeEventListener("scroll", handleScroll)
        }
    }, [])

    const handleHomeClick = (e: React.MouseEvent) => {
        e.preventDefault()
        if (onReset) {
            onReset()
        }
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    return (
        <header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${scrolled
                    ? 'bg-black/80 backdrop-blur-md border-white/10 py-2'
                    : 'bg-transparent border-transparent py-4'
                } ${className}`}
        >
            <div className="container mx-auto max-w-7xl flex items-center justify-between px-6">
                <button
                    onClick={handleHomeClick}
                    className="flex items-center gap-3 group"
                >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${scrolled ? 'bg-white/10 group-hover:bg-white/20' : 'bg-white/10 group-hover:bg-white/20'
                        }`}>
                        <Scale className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex flex-col items-start">
                        <h1 className="text-xl font-bold text-white tracking-tight leading-none">
                            LexDiff
                        </h1>
                        <p className="text-[10px] text-gray-400 font-medium tracking-widest uppercase mt-0.5">
                            Legal AI Platform
                        </p>
                    </div>
                </button>

                <div className="flex items-center gap-2">
                    {favoritesCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onFavoritesClick}
                            className="flex items-center gap-2 text-gray-300 hover:text-white hover:bg-white/10"
                        >
                            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                            <Badge variant="secondary" className="bg-white/10 text-white hover:bg-white/20 border-none text-[10px] h-5 min-w-[1.25rem]">
                                {favoritesCount}
                            </Badge>
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onSettingsClick}
                        className="text-gray-300 hover:text-white hover:bg-white/10 w-9 h-9"
                        title="설정"
                    >
                        <Settings className="h-5 w-5" />
                    </Button>
                </div>
            </div>
        </header>
    )
}
