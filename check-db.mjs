import { db } from './lib/db.js'

const result = await db.execute('SELECT name FROM sqlite_master WHERE type="table"')
console.log('Tables:')
console.log(result.rows.map(x => x.name).join('\n'))

console.log('\n\nChecking for embeddings...')
const embResult = await db.execute('SELECT name FROM sqlite_master WHERE type="table" AND name LIKE "%embedding%"')
console.log('Embedding tables:', embResult.rows.length === 0 ? 'NONE' : embResult.rows.map(x => x.name).join(', '))
