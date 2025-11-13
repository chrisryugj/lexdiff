const API_KEY = 'ryuseungin';

async function test() {
  console.log('Testing eflaw endpoint...\n');
  
  // Test with ID=001556
  const url = `https://www.law.go.kr/DRF/lawService.do?target=eflaw&OC=${API_KEY}&type=JSON&ID=001556`;
  const res = await fetch(url);
  const data = await res.json();
  
  console.log('EFLAW with ID=001556:');
  console.log('법령명:', data.법령?.기본정보?.법령명_한글 || 'Not found');
  console.log('법령ID:', data.법령?.기본정보?.법령ID || 'Not found');
}

test();
