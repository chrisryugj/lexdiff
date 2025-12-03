---
name: writing-plans
description: Use when design is complete and you need detailed implementation tasks for engineers with zero codebase context - creates comprehensive implementation plans with exact file paths, complete code examples, and verification steps assuming engineer has minimal domain knowledge
---

# Writing Plans

## Overview

Write comprehensive implementation plans assuming the engineer has zero context for our codebase and questionable taste. Document everything they need to know: which files to touch for each task, code, testing, docs they might need to check, how to test it. Give them the whole plan as bite-sized tasks. DRY. YAGNI. TDD. Frequent commits.

Assume they are a skilled developer, but know almost nothing about our toolset or problem domain. Assume they don't know good test design very well.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to:** `docs/plans/YYYY-MM-DD-<feature-name>.md`

## Bite-Sized Task Granularity

**Each step is one action (2-5 minutes):**
- "Write the failing test" - step
- "Run it to make sure it fails" - step
- "Implement the minimal code to make the test pass" - step
- "Run the tests and make sure they pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

---
```

## Task Structure

```markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.ts`
- Modify: `exact/path/to/existing.ts:123-145`
- Test: `__tests__/exact/path/to/test.ts`

**Step 1: Write the failing test**

\`\`\`typescript
describe('specific behavior', () => {
  it('does expected thing', () => {
    const result = function(input)
    expect(result).toBe(expected)
  })
})
\`\`\`

**Step 2: Run test to verify it fails**

Run: `npm test __tests__/path/test.ts`
Expected: FAIL with "function not defined"

**Step 3: Write minimal implementation**

\`\`\`typescript
export function myFunction(input: string): string {
  return expected
}
\`\`\`

**Step 4: Run test to verify it passes**

Run: `npm test __tests__/path/test.ts`
Expected: PASS

**Step 5: Commit**

\`\`\`bash
git add __tests__/path/test.ts lib/path/file.ts
git commit -m "feat: add specific feature"
\`\`\`
```

## LexDiff-Specific Patterns

### API Route Task Structure
```markdown
### Task N: Add [API Route Name] endpoint

**Files:**
- Create: `app/api/[route-name]/route.ts`
- Test: Manual testing via browser/curl

**Step 1: Create route file with validation**

\`\`\`typescript
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const param = request.nextUrl.searchParams.get('param')

  if (!param?.trim()) {
    return NextResponse.json(
      { error: 'param required' },
      { status: 400 }
    )
  }

  // ... implementation
}
\`\`\`

**Step 2: Verify manually**

Run: `npm run dev`
Test: `http://localhost:3000/api/[route-name]?param=value`
Expected: Valid JSON response

**Step 3: Commit**
```

### Component Task Structure
```markdown
### Task N: Create [Component Name]

**Files:**
- Create: `components/[component-name].tsx`
- Modify: `components/parent.tsx` (to use new component)

**Step 1: Create component with props interface**

\`\`\`typescript
interface ComponentProps {
  lawName: string
  onSelect: (item: LawItem) => void
}

export function ComponentName({ lawName, onSelect }: ComponentProps) {
  return (
    <div>
      {/* implementation */}
    </div>
  )
}
\`\`\`

**Step 2: Integrate in parent**

**Step 3: Verify visually**

Run: `npm run dev`
Test: Navigate to page, verify component renders
Expected: Component visible with correct data

**Step 4: Commit**
```

## Remember
- Exact file paths always
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- DRY, YAGNI, TDD, frequent commits

## Execution Handoff

After saving the plan, offer execution choice:

**"Plan complete and saved to `docs/plans/<filename>.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?"**

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Stay in this session
- Fresh subagent per task + code review

**If Parallel Session chosen:**
- Guide them to open new session in worktree
- **REQUIRED SUB-SKILL:** New session uses superpowers:executing-plans
