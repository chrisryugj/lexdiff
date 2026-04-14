import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter(l => l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)
const KEY = env.GEMINI_API_KEY
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1) }

const queries = process.argv.slice(2)
if (queries.length === 0) queries.push('근로기준법 제60조', '민법 제839조의2', '상법 제382조')

for (const query of queries) {
  console.log(`\n=== ${query} ===`)
  const start = Date.now()
  const res = await fetch('http://localhost:3000/api/fc-rag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-user-api-key': KEY },
    body: JSON.stringify({ query }),
  })
  if (!res.ok) { console.log('HTTP', res.status); continue }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  const events = { status: [], tool_call: [], answer: null, fromCache: false, source: [], tokens: null }
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      try {
        const ev = JSON.parse(line.slice(6))
        if (ev.type === 'status') {
          events.status.push(ev.message || ev.data?.message)
          if ((ev.message || '').includes('캐시')) events.fromCache = true
        }
        if (ev.type === 'tool_call') events.tool_call.push(`${ev.name}(${JSON.stringify(ev.query || ev.args || {}).slice(0,80)})`)
        if (ev.type === 'answer') events.answer = ev.data?.answer || ev.answer
        if (ev.type === 'source') events.source.push(ev.data?.source || ev.source)
        if (ev.type === 'token_usage') events.tokens = ev.data || ev
      } catch {}
    }
  }
  const ms = Date.now() - start
  console.log(`  elapsed: ${ms}ms  fromCache: ${events.fromCache}`)
  console.log(`  tools: ${events.tool_call.join(' | ')}`)
  console.log(`  answer(120): ${(events.answer || '').slice(0, 160).replace(/\n/g, ' ')}`)
  if (events.tokens) console.log(`  tokens: in=${events.tokens.inputTokens ?? events.tokens.input_tokens} out=${events.tokens.outputTokens ?? events.tokens.output_tokens} cached=${events.tokens.cachedTokens ?? '-'}`)
}
