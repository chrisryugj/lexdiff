---
name: defense-in-depth
description: Use when invalid data causes failures deep in execution, requiring validation at multiple system layers - validates at every layer data passes through to make bugs structurally impossible
---

# Defense-in-Depth Validation

## Overview

When you fix a bug caused by invalid data, adding validation at one place feels sufficient. But that single check can be bypassed by different code paths, refactoring, or mocks.

**Core principle:** Validate at EVERY layer data passes through. Make the bug structurally impossible.

## Why Multiple Layers

Single validation: "We fixed the bug"
Multiple layers: "We made the bug impossible"

Different layers catch different cases:
- Entry validation catches most bugs
- Business logic catches edge cases
- Environment guards prevent context-specific dangers
- Debug logging helps when other layers fail

## The Four Layers

### Layer 1: Entry Point Validation
**Purpose:** Reject obviously invalid input at API boundary

```typescript
// LexDiff example: API route validation
export async function GET(request: NextRequest) {
  const lawName = request.nextUrl.searchParams.get('lawName')

  if (!lawName || lawName.trim() === '') {
    return NextResponse.json(
      { error: 'lawName parameter required' },
      { status: 400 }
    )
  }

  // ... proceed
}
```

### Layer 2: Business Logic Validation
**Purpose:** Ensure data makes sense for this operation

```typescript
// LexDiff example: Parser validation
function extractArticleText(lawData: any): string {
  if (!lawData?.법령) {
    console.warn('[extractArticleText] No 법령 in data')
    return ''
  }

  if (!lawData.법령.조문?.조문단위) {
    console.warn('[extractArticleText] No 조문 structure')
    return ''
  }

  // ... proceed
}
```

### Layer 3: Environment Guards
**Purpose:** Prevent dangerous operations in specific contexts

```typescript
// LexDiff example: SSE buffer guard
async function processSSEStream(reader: ReadableStreamDefaultReader) {
  let buffer = ''

  // Guard: Process remaining buffer after stream ends
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      // ... process chunks
    }
  } finally {
    // CRITICAL: Always process remaining buffer
    if (buffer.trim()) {
      processRemainingBuffer(buffer)
    }
  }
}
```

### Layer 4: Debug Instrumentation
**Purpose:** Capture context for forensics

```typescript
// LexDiff example: API response logging
async function fetchLawData(lawName: string) {
  const response = await fetch(url)
  const data = await response.json()

  if (process.env.NODE_ENV === 'development') {
    console.log('[fetchLawData]', {
      lawName,
      hasData: !!data,
      keys: Object.keys(data || {}),
      status: response.status,
    })
  }

  return data
}
```

## Applying the Pattern

When you find a bug:

1. **Trace the data flow** - Where does bad value originate? Where used?
2. **Map all checkpoints** - List every point data passes through
3. **Add validation at each layer** - Entry, business, environment, debug
4. **Test each layer** - Try to bypass layer 1, verify layer 2 catches it

## LexDiff Example: SSE Buffer Handling

Bug: AI answer text cut off at end of SSE stream

**Data flow:**
1. API sends SSE events
2. Client reads chunks into buffer
3. Buffer processed when newline found
4. **Remaining buffer after stream ends → LOST**

**Four layers added:**
- Layer 1: API validates response structure before sending
- Layer 2: Buffer processor validates each parsed chunk
- Layer 3: `finally` block processes remaining buffer (the fix!)
- Layer 4: Debug logging shows buffer state at each step

**Result:** Answer text never cut off, all edge cases handled

## LexDiff Example: Modal History

Bug: Back button in modal causes infinite loop

**Data flow:**
1. User clicks law reference link in modal
2. New modal opens, history pushed
3. User clicks back → infinite loop

**Four layers added:**
- Layer 1: Validate modalHistory array before push
- Layer 2: Check for duplicate history entries
- Layer 3: Guard against empty history on back
- Layer 4: Log history state changes in development

## Key Insight

All four layers were necessary. During testing, each layer caught bugs the others missed:
- Different code paths bypassed entry validation
- Mocks bypassed business logic checks
- Edge cases on different platforms needed environment guards
- Debug logging identified structural misuse

**Don't stop at one validation point.** Add checks at every layer.

## Quick Reference

| Layer | Purpose | Example |
|-------|---------|---------|
| **1. Entry** | Reject invalid input | API parameter validation |
| **2. Business** | Ensure data makes sense | Structure validation |
| **3. Environment** | Context-specific guards | finally blocks, cleanup |
| **4. Debug** | Capture forensics | Development logging |
