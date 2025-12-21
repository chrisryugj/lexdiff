function getPostposition(word) {
  if (!word) return '이란'
  const lastChar = word.charAt(word.length - 1)
  const code = lastChar.charCodeAt(0)
  if (code < 0xAC00 || code > 0xD7A3) return '이란'
  const hasFinalConsonant = (code - 0xAC00) % 28 !== 0
  return hasFinalConsonant ? '이란' : '란'
}

console.log('광진구 북무조례:', getPostposition('광진구 북무조례'))
console.log('조례:', getPostposition('조례'))
