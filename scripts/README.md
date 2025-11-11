# RAG Vector Search - Embedding DB Construction Scripts

이 디렉토리에는 RAG 벡터 검색 시스템을 위한 임베딩 DB 구축 스크립트가 있습니다.

## 📁 Scripts

### `build-article-embeddings.mjs`

우선순위 법령 30개 + 광진구 조례 30개의 모든 조문을 Voyage AI 3 Lite로 임베딩하여 Turso DB에 저장합니다.

**사전 요구사항:**
- ✅ 개발 서버 실행 중 (`npm run dev`)
- ✅ 환경 변수 설정:
  - `VOYAGE_API_KEY`: Voyage AI API 키
  - `TURSO_DATABASE_URL`: Turso DB URL
  - `TURSO_AUTH_TOKEN`: Turso 인증 토큰
  - `LAW_OC`: law.go.kr API 키

## 🚀 Usage

### 1. 전체 임베딩 구축 (법령 30개 + 조례 30개)

```bash
npm run build-embeddings
```

**예상 소요시간:** 약 30-60분
**예상 비용:** ~$0.03 (법령) + ~$0.015 (조례) = **$0.045**

### 2. 법령만 임베딩

```bash
npm run build-embeddings:laws
```

### 3. 조례만 임베딩

```bash
npm run build-embeddings:ordinances
```

### 4. 테스트 실행 (Dry Run)

```bash
npm run build-embeddings:test
```

처음 2개 법령만 처리하며, DB에 저장하지 않고 비용만 계산합니다.

### 5. 특정 법령만 처리

```bash
node scripts/build-article-embeddings.mjs --law "관세법"
```

### 6. 개수 제한

```bash
node scripts/build-article-embeddings.mjs --limit 5
```

처음 5개 법령/조례만 처리합니다.

## 📊 Output Example

```
╔════════════════════════════════════════════════════════════════╗
║         RAG Vector Search - Embedding DB Construction         ║
╚════════════════════════════════════════════════════════════════╝

📊 Target:
   Laws: 30
   Ordinances: 30
   Total: 60

────────────────────────────────────────────────────────────────

🏛️  PROCESSING LAWS

🔍 Searching for law: 관세법
✓ Found law: 관세법 (ID: 003162)
📄 Processing 320 articles...
  ⏳ Progress: 10/320 articles
  ⏳ Progress: 20/320 articles
  ...
✅ Completed: 관세법 (320 articles)
   Tokens: 45,230, Cost: $0.0023

...

═══════════════════════════════════════════════════════════════
📊 FINAL STATISTICS
═══════════════════════════════════════════════════════════════
Laws/Ordinances Processed: 60
Total Articles:            5,420
Embeddings Generated:      5,420
Cached Embeddings:         0
Total Tokens:              672,850
Total Cost:                $0.0336
Errors:                    0
Elapsed Time:              45.32 minutes
═══════════════════════════════════════════════════════════════

✅ Embedding DB construction completed successfully!
```

## 🗄️ Database Tables

임베딩은 다음 테이블에 저장됩니다:

### `law_article_embeddings`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `law_id` | TEXT | 법령 ID (lawId 또는 ordinSeq) |
| `law_name` | TEXT | 법령 전체 이름 |
| `article_jo` | TEXT | 조 번호 (6자리, 예: 003800) |
| `article_content` | TEXT | 조문 전체 내용 |
| `content_embedding` | F32_BLOB(512) | Voyage 3 Lite 임베딩 (512차원) |
| `keywords` | TEXT | 추출된 키워드 (선택) |

**인덱스:**
- `libsql_vector_idx(content_embedding)` - 벡터 검색용
- `UNIQUE(law_id, article_jo)` - 중복 방지

### `embedding_cache`

API 호출 비용 절감을 위한 임베딩 캐시:

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `text_hash` | TEXT | SHA-256 해시 (캐시 키) |
| `original_text` | TEXT | 원본 텍스트 |
| `embedding` | F32_BLOB(512) | 생성된 임베딩 |
| `hit_count` | INTEGER | 캐시 히트 횟수 |

## 🔧 Troubleshooting

### Error: "VOYAGE_API_KEY not configured"

`.env.local` 파일에 Voyage AI API 키를 추가하세요:

```bash
VOYAGE_API_KEY=pa-xxx...
```

### Error: "Law search failed: 404"

개발 서버가 실행 중인지 확인하세요:

```bash
npm run dev
```

### Error: "fetch is not defined"

Node.js 버전을 확인하세요. Node.js 18 이상이 필요합니다:

```bash
node --version  # Should be v18.0.0 or higher
```

### 임베딩을 재생성하고 싶을 때

기존 임베딩은 `ON CONFLICT` 처리로 자동 업데이트됩니다. 완전히 새로 시작하려면:

```sql
DELETE FROM law_article_embeddings;
DELETE FROM embedding_cache;
```

## 📈 Cost Estimation

Voyage AI 3 Lite 요금: **$0.05 per 1M tokens**

| 항목 | 조문 수 | 평균 토큰 | 총 토큰 | 비용 |
|------|---------|----------|---------|------|
| 법령 30개 | ~4,500 | ~150 | ~675,000 | ~$0.034 |
| 조례 30개 | ~900 | ~150 | ~135,000 | ~$0.007 |
| **합계** | **~5,400** | **~150** | **~810,000** | **~$0.041** |

**실제 비용은 조문 길이에 따라 달라질 수 있습니다.**

## 🔄 Re-running

같은 법령을 다시 실행하면:
1. **임베딩 캐시 활용**: 동일한 조문은 API 호출 없이 캐시에서 가져옴
2. **DB 자동 업데이트**: 기존 레코드가 있으면 `UPDATE`, 없으면 `INSERT`
3. **비용 절감**: 캐시 히트 시 토큰 비용 0

## 📚 Related Documentation

- [RAG_VECTOR_IMPLEMENTATION_PLAN.md](../docs/RAG_VECTOR_IMPLEMENTATION_PLAN.md) - 구현 계획
- [RAG_VECTOR_DETAILED_GUIDE.md](../docs/RAG_VECTOR_DETAILED_GUIDE.md) - 상세 가이드
- [PRIORITY_LAWS_LIST.md](../docs/PRIORITY_LAWS_LIST.md) - 우선순위 법령 목록
- [GWANGJIN_ACTUAL_DATA.md](../docs/GWANGJIN_ACTUAL_DATA.md) - 광진구 조례 목록
