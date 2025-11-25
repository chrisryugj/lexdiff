"use client"

export function ProfessionalFooter() {
    return (
        <footer className="bg-black border-t border-white/10 py-12">
            <div className="container mx-auto px-6 max-w-7xl">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
                    <div className="col-span-1 md:col-span-2">
                        <h3 className="text-2xl font-bold text-white mb-4">LexDiff</h3>
                        <p className="text-gray-500 max-w-sm">
                            대한민국 최고의 법률 AI 플랫폼. <br />
                            법령 검색부터 분석까지, 전문가를 위한 솔루션.
                        </p>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-4">Platform</h4>
                        <ul className="space-y-2 text-sm text-gray-500">
                            <li><a href="#" className="hover:text-white transition-colors">기능 소개</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">요금제</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">API 문서</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="text-white font-semibold mb-4">Company</h4>
                        <ul className="space-y-2 text-sm text-gray-500">
                            <li><a href="#" className="hover:text-white transition-colors">회사 소개</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">채용</a></li>
                            <li><a href="#" className="hover:text-white transition-colors">문의하기</a></li>
                        </ul>
                    </div>
                </div>

                <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-gray-600">
                        © 2025 Chris Ryu. All rights reserved.
                    </p>
                    <div className="flex gap-6 text-sm text-gray-600">
                        <a href="#" className="hover:text-white transition-colors">이용약관</a>
                        <a href="#" className="hover:text-white transition-colors">개인정보처리방침</a>
                    </div>
                </div>
            </div>
        </footer>
    )
}
