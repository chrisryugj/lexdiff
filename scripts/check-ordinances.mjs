const response = await fetch('http://localhost:3000/api/admin/list-store-documents')
const data = await response.json()

const ordinances = data.documents.filter(doc => {
  const metadata = doc.customMetadata || []
  const fileName = metadata.find(m => m.key === 'file_name')?.stringValue
  const districtName = metadata.find(m => m.key === 'district_name')?.stringValue
  return fileName && districtName
})

console.log('Total docs:', data.documents.length)
console.log('Ordinances with file_name + district_name:', ordinances.length)
console.log('\nSample ordinance metadata:', JSON.stringify(ordinances[0]?.customMetadata, null, 2))
console.log('\nSample non-ordinance metadata:', JSON.stringify(
  data.documents.find(d => !d.customMetadata?.find(x => x.key === 'file_name'))?.customMetadata,
  null,
  2
))
