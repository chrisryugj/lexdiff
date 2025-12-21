const word = '조례'
const lastChar = word.charAt(word.length - 1)
const code = lastChar.charCodeAt(0)
const hasFinalConsonant = (code - 0xAC00) % 28 !== 0
console.log('글자:', lastChar)
console.log('유니코드:', code.toString(16))
console.log('받침 여부:', hasFinalConsonant)
console.log('조사:', hasFinalConsonant ? '이란' : '란')
console.log('예상:', '란')
