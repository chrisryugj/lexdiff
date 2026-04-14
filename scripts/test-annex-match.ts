import { linkifyMarkdownLegalRefs } from '../lib/link-specialized.ts'

const cases = [
  {
    name: '조례 헤딩 + 지공법 인용 후 별표 (스크린샷 재현)',
    input: `# 서울특별시 광진구 지방공무원 복무 조례

**목적**
제1조(목적) 이 조례는 「지방공무원법」 제59조 및 「지방공무원 복무규정」에 따라 서울특별시 광진구 지방공무원의 복무에 관한 사항을 규정함을 목적으로 한다.

**복무선서**
제2조(복무선서)① 서울특별시 광진구 지방공무원(이하 "공무원"이라 한다)은 「지방공무원법」(이하 "법"이라 한다) 제47조에 따라 취임할 때에 서울특별시 광진구청장(이하 "구청장"이라 한다) 앞에서 선서하여야 한다.② 제1항의 선서는 별표 1 의 선서문에 따른다.③ 선서의 방법, 절차 등은 별표 2 와 같이 한다.`,
    expectLaw: '서울특별시 광진구 지방공무원 복무 조례',
    notExpectLaw: '지방공무원법',
  },
  {
    name: '헤딩 없음 → 3순위 조례 인용 fallback',
    input: `「지방공무원법」 제59조에 따라 제정된 「광진구 복무 조례」의 내용을 설명하면, 별표 1에서 정한 바와 같다.`,
    expectLaw: '광진구 복무 조례',
  },
  {
    name: '직접 인용: 「법명」 별표 N',
    input: `이 사항은 「도로법 시행령」 별표 3에 규정되어 있다.`,
    expectLaw: '도로법 시행령',
  },
  {
    name: '가까운 법 바로 직후 별표',
    input: `「관세법」 별표 2`,
    expectLaw: '관세법',
  },
  {
    name: '아무 법령명도 없음 → 링크 미생성',
    input: `별표 1에 따른다.`,
    expectLaw: null,
  },
]

let pass = 0, fail = 0
for (const c of cases) {
  const out = linkifyMarkdownLegalRefs(c.input)
  const annexLinks = [...out.matchAll(/\[([^\]]*별표[^\]]*)\]\(annex:\/\/([^\/]+)\/[^)]+\)/g)]
  const lawsFound = annexLinks.map(m => decodeURIComponent(m[2]))

  let ok = true
  if (c.expectLaw === null) {
    ok = annexLinks.length === 0
  } else {
    ok = lawsFound.length > 0 && lawsFound.every(l => l === c.expectLaw)
  }
  if (c.notExpectLaw) {
    ok = ok && !lawsFound.includes(c.notExpectLaw)
  }

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`)
  console.log(`      annex links: ${annexLinks.length}, laws: [${lawsFound.join(', ')}]`)
  if (!ok && c.expectLaw) console.log(`      expect: ${c.expectLaw}`)
  if (!ok && c.notExpectLaw) console.log(`      notExpect: ${c.notExpectLaw}`)
  if (ok) pass++; else fail++
}
console.log(`\n${pass} pass / ${fail} fail`)
process.exit(fail > 0 ? 1 : 0)
