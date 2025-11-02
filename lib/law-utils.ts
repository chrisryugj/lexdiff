const formatSimpleJoCache = new Map<string, string>()

export function formatSimpleJo(jo: string): string {
  if (formatSimpleJoCache.has(jo)) {
    return formatSimpleJoCache.get(jo)!
  }

  let result: string

  if (jo.length === 6) {
    const mainNum = Number.parseInt(jo.substring(0, 4), 10)
    const branchNum = Number.parseInt(jo.substring(4, 6), 10)

    if (branchNum > 0) {
      result = `제${mainNum}조의${branchNum}`
    } else {
      result = `제${mainNum}조`
    }
  } else {
    const match = jo.match(/^제?(\d+)조(?:의(\d+))?/)
    if (match) {
      const mainNum = Number.parseInt(match[1], 10)
      const branchNum = match[2] ? Number.parseInt(match[2], 10) : 0

      if (branchNum > 0) {
        result = `제${mainNum}조의${branchNum}`
      } else {
        result = `제${mainNum}조`
      }
    } else {
      result = jo
    }
  }

  formatSimpleJoCache.set(jo, result)

  return result
}
