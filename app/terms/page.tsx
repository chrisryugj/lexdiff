import { TermsContent } from '@/components/legal/terms-content'

export const metadata = { title: 'LexDiff 이용약관' }

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-10 md:py-14 text-foreground">
      <TermsContent />
    </main>
  )
}
