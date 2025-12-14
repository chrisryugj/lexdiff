
import fetch from 'node-fetch'

const LAW_OC = process.env.LAW_OC || 'ryuseungin'

async function verify() {
    console.log('🔍 Searching for an ordinance...')
    // 1. Find an ordinance (서울특별시 주차장 설치 및 관리 조례)
    const query = '서울특별시 주차장 설치 및 관리 조례'
    const searchUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_OC}&target=ordin&type=JSON&query=${encodeURIComponent(query)}`

    const searchRes = await fetch(searchUrl)
    if (!searchRes.ok) throw new Error('Search failed ' + searchRes.status)
    const searchData = await searchRes.json() as any

    console.log('Search Response Keys:', Object.keys(searchData))

    let lawList
    if (searchData.LawSearch) {
        console.log('LawSearch Keys:', Object.keys(searchData.LawSearch))
        lawList = searchData.LawSearch.law
    } else if (searchData.OrdinSearch) {
        console.log('OrdinSearch Keys:', Object.keys(searchData.OrdinSearch))
        lawList = searchData.OrdinSearch.law || searchData.OrdinSearch.ordin
    }

    // Try to find law list (fallback)
    lawList = lawList || searchData?.law

    if (lawList && !Array.isArray(lawList)) {
        lawList = [lawList]
    }

    const ordinance = lawList?.[0]

    if (!ordinance) {
        console.error('No ordinance found')
        // console.log(JSON.stringify(searchData, null, 2))
        return
    }

    const lawId = ordinance.법령일련번호
    console.log(`✅ Found Ordinance: ${ordinance.법령명한글} (ID: ${lawId})`)

    // 2. Get Annexes (Using ordinbyl target)
    const annexUrl = `https://www.law.go.kr/DRF/lawSearch.do?OC=${LAW_OC}&target=ordinbyl&type=JSON&query=${encodeURIComponent(ordinance.법령명한글)}&search=2`
    const annexRes = await fetch(annexUrl)
    const annexData = await annexRes.json() as any

    // Checking structure based on previous file read
    const annexes = annexData?.licBylSearch?.ordinbyl || []
    console.log(`📋 Found ${annexes.length} annexes`)

    if (annexes.length === 0) return

    // 3. Try API for the first annex that is likely HWP (usually attached)
    const targetAnnex = annexes[0]
    const bylSeq = targetAnnex.별표일련번호
    const bylNo = targetAnnex.별표번호

    console.log(`🧪 Testing Annex: ${targetAnnex.별표명} (Seq: ${bylSeq}, No: ${bylNo})`)

    // 4. Call MOLEG Viewer Logic
    const formData = new URLSearchParams()
    formData.append('bylSeq', bylSeq)
    formData.append('bylNo', bylNo)
    formData.append('lsiSeq', lawId)

    console.log('📤 POST https://www.law.go.kr/LSW/lsBylContentsInfoR.do')
    const viewerRes = await fetch("https://www.law.go.kr/LSW/lsBylContentsInfoR.do", {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData
    })

    if (!viewerRes.ok) {
        console.log('Failed to fetch viewer:', viewerRes.status)
        return
    }

    const html = await viewerRes.text()

    // Check results
    const iframeSrcMatch = html.match(/src="([^"]+viewer\/skin\/doc\.html[^"]+)"/)
    const imageMatches = [...html.matchAll(/src="(\/LSW\/flDownload\.do\?flSeq=\d+)"/g)]

    console.log('--- Result ---')
    if (iframeSrcMatch) {
        console.log(`✅ Viewer URL found: https://www.law.go.kr${iframeSrcMatch[1].replace(/&amp;/g, "&")}`)
    } else {
        console.log('❌ No Viewer URL found in HTML')
        // console.log('Partial HTML:', html.substring(0, 500)) 
    }

    if (imageMatches.length > 0) {
        console.log(`✅ ${imageMatches.length} Fallback Images found`)
        console.log(`   Sample: https://www.law.go.kr${imageMatches[0][1]}`)
    } else {
        console.log('❌ No Fallback Images found')
    }
}

verify().catch(console.error)
