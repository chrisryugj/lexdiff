/**
 * 중복 조례 문서 일괄 삭제 스크립트
 */
import { GoogleGenAI } from '@google/genai';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// 삭제할 문서 ID 목록 (전체 경로)
const documentsToDelete = [
  'fileSearchStores/251117-e3auc645oezj/documents/d8g5b1oxw7a7-hz1sl61fenmg',
  'fileSearchStores/251117-e3auc645oezj/documents/ccggpbohn79z-zegw3qeak450',
  'fileSearchStores/251117-e3auc645oezj/documents/dxe5o7n3z3vs-pqr631adgt0o',
  'fileSearchStores/251117-e3auc645oezj/documents/vxf35lj8pqg2-bykprsrbg0t6',
  'fileSearchStores/251117-e3auc645oezj/documents/3615kk63rsek-eyydk319mhz5',
  'fileSearchStores/251117-e3auc645oezj/documents/7v9kuyio4q2s-274d393ajiia',
  'fileSearchStores/251117-e3auc645oezj/documents/p8tkh5f5on0p-kcnu3nep2per',
  'fileSearchStores/251117-e3auc645oezj/documents/0p4ihcs13ur3-5g3apu0jxae5',
  'fileSearchStores/251117-e3auc645oezj/documents/yz6gvlyt5x4l-s90jmyk9il03',
  'fileSearchStores/251117-e3auc645oezj/documents/ikbnqt4wchn1-b0cjv11uwt3c',
  'fileSearchStores/251117-e3auc645oezj/documents/jk91lg134jty-ogalycwozziv',
  'fileSearchStores/251117-e3auc645oezj/documents/t5cs09jgqqi3-8o5eewof2icv',
  'fileSearchStores/251117-e3auc645oezj/documents/qoz4k9onl2cu-us1s4nljcmi2',
  'fileSearchStores/251117-e3auc645oezj/documents/8xo9fduqvsc9-15roui3pmzx0',
  'fileSearchStores/251117-e3auc645oezj/documents/f6weya2zurl7-c2m5afm9ya8d',
  'fileSearchStores/251117-e3auc645oezj/documents/cly73zghm23x-775z93qfs7pz',
  'fileSearchStores/251117-e3auc645oezj/documents/93qczmhnfiug-ti30td9yssdk',
  'fileSearchStores/251117-e3auc645oezj/documents/ygtyrlna7nrm-5c8nk5y2x8y4',
  'fileSearchStores/251117-e3auc645oezj/documents/3t8ijwyuehjk-c83r43xmnjil',
  'fileSearchStores/251117-e3auc645oezj/documents/q9j69ta8afmb-uodinin4dzb1',
  'fileSearchStores/251117-e3auc645oezj/documents/lbruxqazto5x-ilevgqq2jxq9',
  'fileSearchStores/251117-e3auc645oezj/documents/6pcxpr7e4nv3-a42yvipjiimt',
  'fileSearchStores/251117-e3auc645oezj/documents/3qqjducxpazz-nhhb2675tmf7',
  'fileSearchStores/251117-e3auc645oezj/documents/n00u8j8u7245-gcgt3kk8vpyu',
  'fileSearchStores/251117-e3auc645oezj/documents/im2m2iinweqk-6b9ws3goqbhb',
  'fileSearchStores/251117-e3auc645oezj/documents/rhnmojhjnv13-01se57i8aicn',
  'fileSearchStores/251117-e3auc645oezj/documents/s8v72kj1yces-eicrkphag7sq',
  'fileSearchStores/251117-e3auc645oezj/documents/pbz7ukzg323n-3pfh7mlp7gjr',
  'fileSearchStores/251117-e3auc645oezj/documents/17f0kfkwb9vx-zwqkow49k27r',
  'fileSearchStores/251117-e3auc645oezj/documents/oyfxtg5vc97c-dbbarnurknx7',
];

console.log(`🗑️  총 ${documentsToDelete.length}개 문서 삭제 시작...\n`);

let successCount = 0;
let failCount = 0;

for (const docName of documentsToDelete) {
  const docId = docName.split('/').pop();
  try {
    await ai.fileSearchStores.documents.delete({
      name: docName,
      config: { force: true },
    });
    console.log(`✅ [${successCount + 1}/${documentsToDelete.length}] 삭제 성공: ${docId}`);
    successCount++;
  } catch (error) {
    console.error(`❌ [${failCount + 1}] 삭제 실패: ${docId}`);
    console.error(`   오류: ${error.message}`);
    failCount++;
  }

  // API rate limit 방지를 위한 딜레이
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log('\n📊 삭제 결과:');
console.log(`  ✅ 성공: ${successCount}개`);
console.log(`  ❌ 실패: ${failCount}개`);
console.log(`  📝 총합: ${documentsToDelete.length}개`);

if (failCount === 0) {
  console.log('\n🎉 모든 문서가 성공적으로 삭제되었습니다!');
} else {
  console.log('\n⚠️  일부 문서 삭제에 실패했습니다. 위 오류 메시지를 확인하세요.');
  process.exit(1);
}
