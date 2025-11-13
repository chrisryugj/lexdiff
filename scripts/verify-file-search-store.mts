/**
 * File Search Store 검증 스크립트
 * - Store 존재 확인
 * - 문서 개수 확인
 * - 각 문서의 상태 확인
 */

import { GoogleGenAI } from '@google/genai'
import 'dotenv/config'

const STORE_ID = process.env.GEMINI_FILE_SEARCH_STORE_ID
const API_KEY = process.env.GEMINI_API_KEY

if (!API_KEY) {
  console.error('❌ GEMINI_API_KEY가 설정되지 않았습니다.')
  process.exit(1)
}

if (!STORE_ID) {
  console.error('❌ GEMINI_FILE_SEARCH_STORE_ID가 설정되지 않았습니다.')
  process.exit(1)
}

const genAI = new GoogleGenAI({ apiKey: API_KEY })

async function verifyStore() {
  console.log('\n🔍 File Search Store 검증 시작...\n')
  console.log('Store ID:', STORE_ID)

  try {
    // 1. Store 정보 조회
    console.log('\n📦 Store 정보 조회중...')
    const storeInfo = await genAI.fileSearchStores.get({
      name: STORE_ID
    })
    console.log('✅ Store 존재 확인')
    console.log('   Display Name:', storeInfo.displayName)
    console.log('   Create Time:', storeInfo.createTime)

    // 2. Store 내 파일 목록 조회
    console.log('\n📄 Store 내 문서 목록 조회중...')
    const files = await genAI.fileSearchStores.listFiles({
      fileSearchStoreName: STORE_ID
    })

    console.log(`\n✅ 총 ${files.length}개 문서 발견\n`)

    if (files.length === 0) {
      console.error('⚠️  경고: Store에 문서가 하나도 없습니다!')
      console.error('   문서를 업로드해야 RAG가 작동합니다.')
      return
    }

    // 3. 각 파일 상태 확인
    console.log('문서 상태:')
    files.forEach((file: any, idx: number) => {
      console.log(`\n${idx + 1}. ${file.displayName || file.name}`)
      console.log(`   File Name: ${file.name}`)
      console.log(`   State: ${file.state || 'UNKNOWN'}`)
      console.log(`   Create Time: ${file.createTime}`)

      // PROCESSING 상태 체크
      if (file.state === 'PROCESSING') {
        console.log('   ⚠️  아직 인덱싱 중입니다. 완료될 때까지 기다려야 합니다.')
      } else if (file.state === 'ACTIVE') {
        console.log('   ✅ 인덱싱 완료 - RAG 사용 가능')
      } else if (file.state === 'FAILED') {
        console.log('   ❌ 인덱싱 실패')
      }
    })

    // 4. 관세법 파일 확인
    console.log('\n\n🔍 관세법 관련 문서 검색...')
    const gwanseLaw = files.find((f: any) =>
      (f.displayName && f.displayName.includes('관세법')) ||
      (f.name && f.name.includes('관세법'))
    )

    if (gwanseLaw) {
      console.log('✅ 관세법 문서 발견:', gwanseLaw.displayName || gwanseLaw.name)
      console.log('   상태:', gwanseLaw.state)
      if (gwanseLaw.state !== 'ACTIVE') {
        console.log('   ⚠️  아직 인덱싱이 완료되지 않았습니다!')
      }
    } else {
      console.log('❌ 관세법 문서를 찾을 수 없습니다!')
    }

    // 5. 테스트 쿼리 (문서가 ACTIVE 상태일 때만)
    const activeFiles = files.filter((f: any) => f.state === 'ACTIVE')
    if (activeFiles.length > 0) {
      console.log('\n\n🧪 테스트 쿼리 실행중...')
      console.log('질문: "보세구역이 뭐야?"')

      const result = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: '보세구역이 뭐야?',
        tools: [{
          fileSearch: {
            fileSearchStores: [STORE_ID]
          }
        }]
      })

      console.log('\n답변:', result.text?.substring(0, 200) + '...')
      console.log('\n📊 Grounding Metadata:')
      console.log('   Citations:', result.groundingMetadata?.citations?.length || 0)
      console.log('   Chunks:', result.groundingMetadata?.groundingChunks?.length || 0)

      if (!result.groundingMetadata?.citations || result.groundingMetadata.citations.length === 0) {
        console.log('\n❌ Citation이 없습니다! File Search가 작동하지 않았습니다.')
        console.log('\n가능한 원인:')
        console.log('1. tools.fileSearch.fileSearchStores 설정 오류')
        console.log('2. 질문과 문서 내용이 관련성이 없음')
        console.log('3. SDK 버전 문제')
      } else {
        console.log('\n✅ File Search가 정상 작동합니다!')
      }
    } else {
      console.log('\n⚠️  ACTIVE 상태인 문서가 없어 테스트 쿼리를 건너뜁니다.')
    }

  } catch (error: any) {
    console.error('\n❌ 오류 발생:', error.message)
    if (error.message.includes('NOT_FOUND')) {
      console.error('\n💡 Store ID가 잘못되었거나 Store가 삭제되었을 수 있습니다.')
      console.error('   .env.local의 GEMINI_FILE_SEARCH_STORE_ID를 확인하세요.')
    }
  }
}

verifyStore()
