import { NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

export async function GET() {
    try {
        const logPath = path.join(process.cwd(), 'data', 'uploaded-laws-log.json')

        try {
            await fs.access(logPath)
        } catch {
            // File doesn't exist, return empty list
            return NextResponse.json({ success: true, files: [] })
        }

        const content = await fs.readFile(logPath, 'utf-8')
        const files = JSON.parse(content)

        return NextResponse.json({ success: true, files })
    } catch (error) {
        console.error('Failed to get upload history:', error)
        return NextResponse.json({ success: false, error: 'Failed to get upload history' }, { status: 500 })
    }
}
