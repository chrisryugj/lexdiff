/**
 * Download KCS Interpretation API
 * POST /api/admin/download-kcs-interpretation
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LAW_OC = process.env.LAW_OC

interface DownloadRequest {
    query?: string
    id?: string
}

/**
 * Search for KCS Interpretation
 */
async function searchKcsInterpretation(query: string) {
    try {
        const params = new URLSearchParams({
            target: 'kcsCgmExpc',
            OC: LAW_OC!,
            type: 'JSON',
            query: query
        })

        const url = `http://www.law.go.kr/DRF/lawSearch.do?${params.toString()}`
        console.log(`[KCS Search] URL: ${url}`)

        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) return null

        const json = await response.json()

        // Check structure
        // Usually { KcsCgmExpcSearch: { kcsCgmExpc: [ ... ] } } or similar
        // Based on logs, it might be wrapped in "KcsCgmExpcSearch" or "Result"

        const root = json.KcsCgmExpcSearch || json.Result
        if (!root) return null

        const list = root.kcsCgmExpc || root.law || [] // Adjust key based on actual response

        if (Array.isArray(list) && list.length > 0) {
            return list[0] // Return first match
        }

        // If single object
        if (list && typeof list === 'object' && !Array.isArray(list)) {
            if (list.법령해석일련번호) return list;
        }

        return null
    } catch (error) {
        console.error(`Search error: ${error}`)
        return null
    }
}

/**
 * Fetch KCS Interpretation Detail
 */
async function fetchKcsInterpretation(id: string) {
    try {
        const params = new URLSearchParams({
            target: 'kcsCgmExpc',
            OC: LAW_OC!,
            type: 'JSON',
            ID: id
        })

        const url = `http://www.law.go.kr/DRF/lawService.do?${params.toString()}`
        console.log(`[KCS Detail] Fetching URL: ${url}`)

        const response = await fetch(url, { cache: 'no-store' })
        if (!response.ok) return null

        return await response.json()
    } catch (error) {
        console.error(`Fetch error: ${error}`)
        return null
    }
}

/**
 * Parse KCS Interpretation JSON
 */
function parseKcsInterpretation(json: any) {
    try {
        // Root key is likely KcsCgmExpcService
        const service = json.KcsCgmExpcService || json.ExpcService
        if (!service) throw new Error('Service node not found')

        const info = service.기본정보 || service.행정규칙기본정보 || service

        // Extract fields
        const id = info.법령해석일련번호 || ''
        const title = info.안건명 || '제목 없음'
        const date = info.해석일자 || ''
        const org = info.해석기관명 || ''
        const questionOrg = info.질의기관명 || ''

        const question = service.질의요지 || ''
        const answer = service.회답 || ''
        const reason = service.이유 || ''
        const relatedLaw = service.관련법령 || ''

        return {
            id,
            title,
            date,
            org,
            questionOrg,
            question,
            answer,
            reason,
            relatedLaw
        }
    } catch (error: any) {
        throw new Error(`Parse failed: ${error.message}`)
    }
}

/**
 * Generate Markdown
 */
function generateMarkdown(parsed: any): string {
    let md = `# ${parsed.title}\n\n`
    md += `**일련번호**: ${parsed.id}\n`
    md += `**해석일자**: ${parsed.date}\n`
    md += `**해석기관**: ${parsed.org}\n`
    if (parsed.questionOrg) md += `**질의기관**: ${parsed.questionOrg}\n`
    md += `\n---\n\n`

    if (parsed.question) {
        md += `## 질의 요지\n\n${parsed.question}\n\n`
    }

    if (parsed.answer) {
        md += `## 회답\n\n${parsed.answer}\n\n`
    }

    if (parsed.reason) {
        md += `## 이유\n\n${parsed.reason}\n\n`
    }

    if (parsed.relatedLaw) {
        md += `## 관련 법령\n\n${parsed.relatedLaw}\n\n`
    }

    return md
}

export async function POST(request: NextRequest) {
    try {
        const body: DownloadRequest = await request.json()
        const { query, id } = body

        if (!query && !id) {
            return NextResponse.json(
                { success: false, error: 'query 또는 id가 필요합니다' },
                { status: 400 }
            )
        }

        if (!LAW_OC) {
            return NextResponse.json(
                { success: false, error: 'LAW_OC 환경변수가 설정되지 않았습니다' },
                { status: 500 }
            )
        }

        let targetId = id
        let searchResult = null

        // 1. Search if query provided
        if (query && !targetId) {
            console.log(`[KCS Download] Searching for: ${query}`)
            searchResult = await searchKcsInterpretation(query)

            if (!searchResult) {
                return NextResponse.json({
                    success: false,
                    notFound: true,
                    message: `'${query}'에 대한 검색 결과가 없습니다`
                })
            }

            targetId = searchResult.법령해석일련번호
            console.log(`[KCS Download] Found ID: ${targetId} (${searchResult.안건명})`)
        }

        // 2. Fetch Detail
        if (!targetId) {
            return NextResponse.json({ success: false, error: 'ID를 찾을 수 없습니다' }, { status: 404 })
        }

        const json = await fetchKcsInterpretation(targetId)
        if (!json) {
            return NextResponse.json({
                success: false,
                notFound: true,
                message: `ID ${targetId} 정보를 가져올 수 없습니다`
            })
        }

        // 3. Parse
        const parsed = parseKcsInterpretation(json)

        // 4. Save
        const sanitizedTitle = parsed.title.replace(/[<>:"/\\|?*]/g, '_')
        const fileName = `${sanitizedTitle}.md`
        const dirPath = path.join(process.cwd(), 'data', 'parsed-kcs-interpretations')

        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true })
        }

        const filePath = path.join(dirPath, fileName)
        const markdown = generateMarkdown(parsed)

        fs.writeFileSync(filePath, markdown, 'utf8')
        console.log(`[KCS Download] ✅ Saved: ${filePath}`)

        return NextResponse.json({
            success: true,
            title: parsed.title,
            id: parsed.id,
            path: filePath
        })

    } catch (error: any) {
        console.error('[KCS Download] Error:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Internal Server Error' },
            { status: 500 }
        )
    }
}
