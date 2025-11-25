"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Scale, Star, Settings, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { favoritesStore } from "@/lib/favorites-store"
import { motion, AnimatePresence } from "framer-motion"

interface FuturisticHeaderProps {
    onReset?: () => void
    onFavoritesClick?: () => void
    onSettingsClick?: () => void
}

export function FuturisticHeader({ onReset, onFavoritesClick, onSettingsClick }: FuturisticHeaderProps) {
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
        <motion.header
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none"
        >
            <div className={`pointer-events-auto flex items-center justify-between gap-8 px-6 py-3 rounded-full transition-all duration-500 ${scrolled
                    ? 'bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_0_40px_-10px_rgba(0,0,0,0.5)]'
                    : 'bg-transparent border border-transparent'
                }`}>
                <button
                    onClick={handleHomeClick}
                    className="flex items-center gap-3 group"
                >
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 shadow-lg shadow-purple-500/20 group-hover:shadow-purple-500/40 transition-shadow duration-300">
                        <Scale className="h-4 w-4 text-white" />
                        <div className="absolute inset-0 rounded-full bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                        LexDiff
                    </span>
                </button>

                <div className="h-4 w-[1px] bg-white/10" />

                <div className="flex items-center gap-1">
                    {favoritesCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onFavoritesClick}
                            className="rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                        >
                            <Star className="h-4 w-4 mr-1.5 text-yellow-400" />
                            <span className="text-xs font-medium">{favoritesCount}</span>
                        </Button>
                    )}

                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={onSettingsClick}
                        className="rounded-full hover:bg-white/10 text-gray-300 hover:text-white transition-colors w-9 h-9"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </motion.header>
    )
}
