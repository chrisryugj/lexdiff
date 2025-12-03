---
name: root-cause-tracing
description: Use when errors occur deep in execution and you need to trace back to find the original trigger - systematically traces bugs backward through call stack, adding instrumentation when needed, to identify source of invalid data or incorrect behavior
---

# Root Cause Tracing

## Overview

Bugs often manifest deep in the call stack (git init in wrong directory, file created in wrong location, database opened with wrong path). Your instinct is to fix where the error appears, but that's treating a symptom.

**Core principle:** Trace backward through the call chain until you find the original trigger, then fix at the source.

## When to Use

**Use when:**
- Error happens deep in execution (not at entry point)
- Stack trace shows long call chain
- Unclear where invalid data originated
- Need to find which test/code triggers the problem

## The Tracing Process

### 1. Observe the Symptom
```
Error: API response parsing failed in extractArticleText()
```

### 2. Find Immediate Cause
**What code directly causes this?**
```typescript
const articles = lawData?.법령?.조문?.조문단위
// articles is undefined!
```

### 3. Ask: What Called This?
```typescript
extractArticleText(lawData)
  → called by generateLawHtml()
  → called by LawViewer.tsx
  → called by API response handler
```

### 4. Keep Tracing Up
**What value was passed?**
- `lawData.법령` exists but `lawData.법령.조문` is undefined
- API returned different structure than expected
- That's the source!

### 5. Find Original Trigger
**Where did unexpected structure come from?**
```typescript
// API route returns raw response without validation
const data = await response.json()
return data  // No structure validation!
```

## Adding Stack Traces

When you can't trace manually, add instrumentation:

```typescript
// Before the problematic operation
function extractArticleText(lawData: any) {
  const stack = new Error().stack;
  console.error('[RootCause] extractArticleText called:', {
    hasLaw: !!lawData?.법령,
    hasJomun: !!lawData?.법령?.조문,
    keys: Object.keys(lawData?.법령 || {}),
    stack,
  });

  // ... rest of function
}
```

**Critical:** Use `console.error()` in tests (not logger - may not show)

**Analyze stack traces:**
- Look for test file names
- Find the line number triggering the call
- Identify the pattern (same test? same parameter?)

## Real Example: JSON Parsing Error in LexDiff

**Symptom:** `extractArticleText()` returns empty result

**Trace chain:**
1. `extractArticleText()` receives lawData with unexpected structure
2. `generateLawHtml()` called with API response directly
3. API route returns `data.법령` but component expects `data`
4. Wrapper field inconsistency between API routes

**Root cause:** Different API routes use different wrapper structures

**Fix:** Normalize API response structure at API route level

**Also added defense-in-depth:**
- Layer 1: API route validates response structure
- Layer 2: extractArticleText() logs unexpected input
- Layer 3: Component shows clear error when data missing
- Layer 4: Debug logging at each transformation step

## Key Principle

**NEVER fix just where the error appears.** Trace back to find the original trigger.

## Stack Trace Tips

**In tests:** Use `console.error()` not logger - logger may be suppressed
**Before operation:** Log before the dangerous operation, not after it fails
**Include context:** Directory, cwd, environment variables, timestamps
**Capture stack:** `new Error().stack` shows complete call chain

## Defense-in-Depth After Tracing

After finding root cause, add validation at EVERY layer:

```typescript
// Layer 1: Entry Point
function fetchLaw(lawName: string) {
  if (!lawName?.trim()) {
    throw new Error('lawName required')
  }
}

// Layer 2: API Response
const data = await response.json()
if (!data?.법령?.기본정보) {
  throw new Error('Invalid API response structure')
}

// Layer 3: Data Transformation
function extractArticleText(lawData: any) {
  if (!lawData?.법령?.조문) {
    console.warn('No 조문 in lawData, returning empty')
    return ''
  }
}

// Layer 4: UI Component
if (!htmlContent) {
  return <ErrorDisplay message="법령 내용을 불러올 수 없습니다" />
}
```

## Real-World Impact

From debugging session:
- Found root cause through 5-level trace
- Fixed at source (API response normalization)
- Added 4 layers of defense
- Zero parsing errors in production
