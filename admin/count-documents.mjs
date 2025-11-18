/**
 * File Search Store 문서 개수만 빠르게 카운트
 */
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const STORE_ID = 'fileSearchStores/251117-e3auc645oezj';

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

console.log(`📂 Store: ${STORE_ID}`);
console.log(`🔍 문서 개수 카운트 중...\n`);

const startTime = Date.now();
let totalCount = 0;
let pageCount = 0;

try {
  try {
    const pager = await ai.fileSearchStores.documents.list({
      fileSearchStoreName: STORE_ID,
      config: { pageSize: 100 }, // 최대 페이지 크기로 설정 (API 제한 확인 필요)
    });

    let page = pager.page;

    while (page) {
      pageCount++;
      const pageSize = Array.from(page).length;
      totalCount += pageSize;

      console.log(`  페이지 ${pageCount}: ${pageSize}개 (누적: ${totalCount}개)`);

      if (!pager.hasNextPage()) break;
      page = await pager.nextPage();
    }
  } catch (listError) {
    console.log('ℹ️  스토어에 문서가 없거나 접근할 수 없습니다.');
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`\n📊 총 문서 개수: ${totalCount}개`);
  console.log(`⏱️  소요 시간: ${elapsed}초`);
  console.log(`📄 페이지 수: ${pageCount}페이지`);

} catch (error) {
  console.error('❌ 카운트 실패:', error.message);
  process.exit(1);
}
