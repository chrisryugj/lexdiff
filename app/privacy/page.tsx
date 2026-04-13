import { PrivacyContent } from '@/components/legal/privacy-content'

export const metadata = { title: 'LexDiff 개인정보처리방침' }

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 md:py-14 text-foreground">
      <PrivacyContent />
    </main>
  )
}
