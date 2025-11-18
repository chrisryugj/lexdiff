/**
 * File Search Store 문서 목록 조회 스크립트
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
console.log(`🔍 문서 목록 조회 중...\n`);

try {
  const documents = [];

  try {
    const pager = await ai.fileSearchStores.documents.list({
      fileSearchStoreName: STORE_ID,
      config: { pageSize: 20 }, // max 20 per page
    });

    let page = pager.page;

    while (page) {
      for (const doc of page) {
        documents.push({
          name: doc.name,
          displayName: doc.displayName || 'Unnamed',
          createTime: doc.createTime,
          updateTime: doc.updateTime,
        });
      }

      if (!pager.hasNextPage()) break;
      page = await pager.nextPage();
    }
  } catch (listError) {
    // Store is empty or no documents
    console.log('ℹ️  스토어에 문서가 없거나 접근할 수 없습니다.');
  }

  console.log(`📊 총 문서 개수: ${documents.length}개\n`);

  if (documents.length > 0) {
    console.log('📄 문서 목록:');
    documents.forEach((doc, index) => {
      const docId = doc.name.split('/').pop();
      console.log(`  ${index + 1}. ${doc.displayName} (${docId})`);
    });
  } else {
    console.log('✨ 스토어가 비어있습니다.');
  }

} catch (error) {
  console.error('❌ 조회 실패:', error.message);
  process.exit(1);
}
