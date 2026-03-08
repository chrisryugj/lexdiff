import { vi } from 'vitest'
import '@testing-library/jest-dom'

// Mock debugLogger to prevent console spam during tests
vi.mock('./lib/debug-logger', () => ({
  debugLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}))

// Mock search-normalizer for law-parser tests
vi.mock('./lib/search-normalizer', () => ({
  normalizeLawSearchText: (text: string) => text.trim(),
  normalizeSearchQuery: (query: string) => query.trim(),
  resolveLawAlias: (name: string) => ({
    canonical: name,
    matchedAlias: null,
  }),
  expandSearchSynonyms: () => ({ expanded: [] }),
}))

// Mock ResizeObserver (jsdom에 없음)
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Global test utilities
globalThis.DOMParser = class DOMParser {
  parseFromString(str: string, type: string): Document {
    const { JSDOM } = require('jsdom')
    return new JSDOM(str, { contentType: type }).window.document
  }
} as unknown as typeof DOMParser
