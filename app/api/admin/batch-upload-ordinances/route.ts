/**
 * Batch Upload Ordinances API
 * Runs in background - survives tab switches
 */

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

// In-memory progress tracking
const uploadJobs = new Map<string, {
  total: number
  current: number
  success: number
  errors: number
  status: 'running' | 'paused' | 'completed' | 'error'
  results: Array<{ fileName: string; districtName?: string; status: 'success' | 'error'; error?: string }>
  logFilePath?: string
}>()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, jobId, files, concurrency = 3 } = body

    // Start new job
    if (action === 'start') {
      const newJobId = `job_${Date.now()}`
      const logFilePath = path.join(process.cwd(), `upload-log-${newJobId}.jsonl`)

      // Create log file with header
      await fs.writeFile(logFilePath, JSON.stringify({
        type: 'start',
        jobId: newJobId,
        timestamp: new Date().toISOString(),
        total: files.length
      }) + '\n')

      uploadJobs.set(newJobId, {
        total: files.length,
        current: 0,
        success: 0,
        errors: 0,
        status: 'running',
        results: [],
        logFilePath
      })

      console.log(`📝 Upload log initialized: ${logFilePath}`)

      // Start upload in background (don't await)
      processUploadBatch(newJobId, files, concurrency).catch(console.error)

      return NextResponse.json({ success: true, jobId: newJobId })
    }

    // Get job status
    if (action === 'status' && jobId) {
      const job = uploadJobs.get(jobId)
      if (!job) {
        return NextResponse.json({ success: false, error: 'Job not found' })
      }

      return NextResponse.json({ success: true, job })
    }

    // Pause job
    if (action === 'pause' && jobId) {
      const job = uploadJobs.get(jobId)
      if (job) {
        job.status = 'paused'
        return NextResponse.json({ success: true })
      }
      return NextResponse.json({ success: false, error: 'Job not found' })
    }

    // Resume job
    if (action === 'resume' && jobId) {
      const job = uploadJobs.get(jobId)
      if (job) {
        job.status = 'running'
        // Continue from where it left off
        const remainingFiles = files.slice(job.current)
        processUploadBatch(jobId, remainingFiles, concurrency).catch(console.error)
        return NextResponse.json({ success: true })
      }
      return NextResponse.json({ success: false, error: 'Job not found' })
    }

    return NextResponse.json({ success: false, error: 'Invalid action' })
  } catch (error: any) {
    console.error('Batch upload API error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

async function processUploadBatch(jobId: string, files: Array<{ fileName: string; districtName: string }>, concurrency: number) {
  const job = uploadJobs.get(jobId)
  if (!job) return

  for (let i = 0; i < files.length; i += concurrency) {
    // Check if paused
    if (job.status === 'paused') {
      console.log(`Job ${jobId} paused at ${job.current}/${job.total}`)
      break
    }

    const chunk = files.slice(i, i + concurrency)

    // Upload chunk in parallel
    const results = await Promise.all(
      chunk.map((file) => uploadSingleOrdinance(file.fileName, file.districtName))
    )

    // Update job progress
    for (const result of results) {
      job.current++
      job.results.push(result)

      if (result.status === 'success') {
        job.success++
      } else {
        job.errors++
      }

      // Append to log file in real-time
      if (job.logFilePath) {
        const logEntry = JSON.stringify({
          type: result.status,
          timestamp: new Date().toISOString(),
          fileName: result.fileName,
          districtName: result.districtName,
          error: result.error,
          progress: `${job.current}/${job.total}`
        }) + '\n'

        await fs.appendFile(job.logFilePath, logEntry).catch(err => {
          console.error('Failed to append to log:', err)
        })
      }
    }

    // Small delay between chunks
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  if (job.status === 'running') {
    job.status = 'completed'
    console.log(`Job ${jobId} completed: ${job.success} success, ${job.errors} errors`)

    // Write completion marker to log file
    if (job.logFilePath) {
      const completionEntry = JSON.stringify({
        type: 'completed',
        timestamp: new Date().toISOString(),
        total: job.total,
        success: job.success,
        errors: job.errors
      }) + '\n'

      await fs.appendFile(job.logFilePath, completionEntry).catch(err => {
        console.error('Failed to write completion marker:', err)
      })

      console.log(`📝 Upload log completed: ${job.logFilePath}`)
    }

    const successCount = job.results.filter(r => r.status === 'success').length
    console.log(`📊 Summary: ${successCount} uploaded, ${job.errors} errors`)
  }
}

async function uploadSingleOrdinance(fileName: string, districtName: string): Promise<{
  fileName: string
  districtName: string
  status: 'success' | 'error'
  error?: string
  documentId?: string
}> {
  try {
    if (!STORE_ID || !API_KEY) {
      throw new Error('Missing environment variables')
    }

    // Read file - try multiple locations
    const parsedOrdinancesDir = path.join(process.cwd(), 'data', 'parsed-ordinances')

    // Try 1: Root-level file first
    let filePath = path.join(parsedOrdinancesDir, fileName)
    let fileExists = await fs.access(filePath).then(() => true).catch(() => false)

    // Try 2: If not found in root, try district folder
    if (!fileExists) {
      filePath = path.join(parsedOrdinancesDir, districtName, fileName)
      fileExists = await fs.access(filePath).then(() => true).catch(() => false)
    }

    if (!fileExists) {
      throw new Error(`파일을 찾을 수 없습니다: ${fileName}`)
    }

    const content = await fs.readFile(filePath, 'utf-8')

    // Extract ordinance name from first line
    const firstLine = content.split('\n')[0]
    const ordinanceName = firstLine.replace(/^#\s*/, '').trim()

    // Upload to Gemini File API
    const blob = new Blob([content], { type: 'text/plain; charset=utf-8' })
    const file = new File([blob], fileName, { type: 'text/plain' })

    const formData = new FormData()
    formData.append('file', file)

    const uploadResponse = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files`, {
      method: 'POST',
      headers: { 'x-goog-api-key': API_KEY },
      body: formData
    })

    if (!uploadResponse.ok) {
      const error = await uploadResponse.text()
      throw new Error(`Upload failed (${uploadResponse.status}): ${error}`)
    }

    const uploadedFile = await uploadResponse.json()
    const fileNameGemini = uploadedFile.file?.name || uploadedFile.name

    if (!fileNameGemini) {
      throw new Error('File upload did not return a file name')
    }

    // Import to File Search Store
    const importUrl = `https://generativelanguage.googleapis.com/v1beta/${STORE_ID}:importFile`

    const importResponse = await fetch(importUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': API_KEY
      },
      body: JSON.stringify({
        fileName: fileNameGemini,
        customMetadata: [
          { key: 'ordinance_name', stringValue: ordinanceName },
          { key: 'district_name', stringValue: districtName },
          { key: 'law_type', stringValue: '조례' },
          { key: 'file_name', stringValue: fileName },
          { key: 'source', stringValue: 'parsed-ordinances' },
          { key: 'uploaded_at', stringValue: new Date().toISOString() }
        ]
      })
    })

    if (!importResponse.ok) {
      const error = await importResponse.text()
      throw new Error(`Import failed (${importResponse.status}): ${error}`)
    }

    const importResult = await importResponse.json()
    const documentId = importResult.document?.name || importResult.name

    return {
      fileName,
      districtName,
      status: 'success',
      documentId
    }
  } catch (error: any) {
    return {
      fileName,
      districtName,
      status: 'error',
      error: error.message
    }
  }
}
