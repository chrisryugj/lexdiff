/**
 * Custom hook for checking local MD files against downloaded status
 * Used across Parse, Enforcement, and Ordinance tabs
 */

import { useState, useEffect, useCallback } from 'react'

interface LocalMDFile {
  fileName: string
  filePath: string
  lawName?: string
  lawId?: string
  fileSize: number
  lastModified: string
}

interface UseLocalMDCheckOptions {
  apiEndpoint: string // e.g., '/api/admin/list-parsed'
  fileType: 'law' | 'decree' | 'rule' | 'ordinance'
}

export function useLocalMDCheck({ apiEndpoint, fileType }: UseLocalMDCheckOptions) {
  const [localFiles, setLocalFiles] = useState<LocalMDFile[]>([])
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const checkLocalFiles = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(apiEndpoint)
      const data = await response.json()

      if (data.success) {
        const files = data.laws || data.files || []
        setLocalFiles(files)

        // Extract IDs of downloaded files
        const ids = new Set<string>()
        files.forEach((file: any) => {
          if (file.lawId) {
            ids.add(file.lawId)
          }
        })
        setDownloadedIds(ids)

        console.log(`✅ [${fileType}] Loaded ${files.length} local MD files`)
      }
    } catch (error) {
      console.error(`❌ Failed to check local ${fileType} files:`, error)
    } finally {
      setLoading(false)
    }
  }, [apiEndpoint, fileType])

  // Auto-check on mount
  useEffect(() => {
    checkLocalFiles()
  }, [checkLocalFiles])

  const isDownloaded = useCallback((lawId: string) => {
    return downloadedIds.has(lawId)
  }, [downloadedIds])

  return {
    localFiles,
    downloadedIds,
    loading,
    checkLocalFiles,
    isDownloaded
  }
}
