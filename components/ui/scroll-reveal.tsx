"use client"

import React, { useEffect, useRef, useState } from "react"

interface ScrollRevealProps {
    children: React.ReactNode
    className?: string
    threshold?: number
    delay?: number
    duration?: string
    stagger?: number
    animation?: "fade-up" | "fade-in" | "blur-in"
    as?: React.ElementType
    enable?: boolean
}

export function ScrollReveal({
    children,
    className = "",
    threshold = 0.1,
    delay = 0,
    duration = "1000ms",
    stagger = 0,
    animation = "fade-up",
    as: Component = "div",
    enable = true,
}: ScrollRevealProps) {
    const [isVisible, setIsVisible] = useState(false)
    const ref = useRef<HTMLElement>(null)

    useEffect(() => {
        if (!enable) {
            setIsVisible(true)
            return
        }

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true)
                    observer.disconnect()
                }
            },
            {
                threshold,
                rootMargin: "0px 0px -50px 0px", // Trigger slightly before bottom
            }
        )

        if (ref.current) {
            observer.observe(ref.current)
        }

        return () => observer.disconnect()
    }, [threshold, enable])

    const getAnimationClass = () => {
        if (!isVisible) {
            switch (animation) {
                case "fade-up":
                    return "opacity-0 translate-y-8"
                case "fade-in":
                    return "opacity-0"
                case "blur-in":
                    return "opacity-0 blur-sm scale-95"
                default:
                    return "opacity-0"
            }
        }
        return "opacity-100 translate-y-0 blur-0 scale-100"
    }

    // If children is an array, we might want to stagger them
    // But for simplicity in this component, we'll just wrap the whole block
    // or let the user map over children and use ScrollReveal for each.
    // However, to support "stagger" for direct children easily without re-mapping:

    if (stagger > 0 && React.Children.count(children) > 1) {
        return (
            <Component ref={ref} className={className}>
                {React.Children.map(children, (child, index) => (
                    <div
                        style={{
                            transitionDelay: `${delay + index * stagger}ms`,
                            transitionDuration: duration,
                            transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)", // Apple-like ease
                        }}
                        className={`transition-all duration-700 ${getAnimationClass()}`}
                    >
                        {child}
                    </div>
                ))}
            </Component>
        )
    }

    return (
        <Component
            ref={ref}
            className={`${className} transition-all duration-700 ${getAnimationClass()}`}
            style={{
                transitionDelay: `${delay}ms`,
                transitionDuration: duration,
                transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
            }}
        >
            {children}
        </Component>
    )
}
