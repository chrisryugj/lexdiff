"use client"

export function FuturisticFooter() {
    return (
        <footer className="py-12 border-t border-white/5 bg-black/50 backdrop-blur-xl" style={{ fontFamily: "Pretendard, sans-serif" }}>
            <div className="container mx-auto px-6 max-w-7xl flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-sm text-gray-500">모든 시스템 정상 작동 중</span>
                </div>

                <div className="flex gap-8 text-sm text-gray-500">
                    <a href="#" className="hover:text-white transition-colors">개인정보처리방침</a>
                    <a href="#" className="hover:text-white transition-colors">이용약관</a>
                    <a href="#" className="hover:text-white transition-colors">API 문서</a>
                </div>

                <div className="text-sm text-gray-600">
                    © 2025 LexDiff AI. All rights reserved.
                </div>
            </div>
        </footer>
    )
}
