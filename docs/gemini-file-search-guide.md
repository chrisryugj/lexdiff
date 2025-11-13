
# Gemini File Search / File Search Store API 가이드

> **목적**  
> - Gemini File Search를 이용해 **법령·조례 등 문서 RAG**를 안정적으로 구현할 수 있도록,  
> - 공식 문서 구조에 맞춰 **엔드투엔드 흐름 + 실전 코드 패턴 + 디버깅 포인트**를 한 번에 정리한 가이드.

---

## 1. 전체 개념 구조

### 1.1 File Search란?

- Gemini API에 내장된 **완전 관리형 RAG 시스템**  
- 하는 일:
  - 파일을 **청크 단위로 분할**
  - `gemini-embedding-001` 등으로 **임베딩 생성**
  - **벡터 인덱스에 저장**
  - `generate_content` 호출 시 자동으로 **관련 청크 검색 + 주입 + 인용(citation)** citeturn5search0turn6view0
- 직접 벡터DB를 만들 필요 없이, **“파일만 넣고 질문만 던지면 되는 구조”**를 제공

### 1.2 Files API vs File Search Store

| 개념 | Files API | File Search Store |
|------|-----------|-------------------|
| 용도 | 원본 파일 저장 + 업로드/다운로드 | RAG용 임베딩·청크 저장소 |
| 보관 기간 | 기본적으로 48시간 후 삭제 | 삭제할 때까지 **영구 보관** citeturn6view0 |
| RAG 사용 | 임베딩·검색 직접 구현 필요 | File Search가 자동 처리 |

- 일반적인 패턴:
  - **간단한 RAG** → `upload_to_file_search_store`로 바로 스토어에 업로드
  - Files API를 이미 쓰고 있다면 → `files.import_file` + `file_search_stores.import_file` 조합

### 1.3 지원 모델

- File Search tool은 현재 **Gemini 2.5 계열 모델**에서 사용 가능 (예: `gemini-2.5-flash`, `gemini-2.5-pro`). citeturn5search11

---

## 2. 핵심 오브젝트 & 용어

| 용어 | 설명 |
|------|------|
| **FileSearchStore** | 문서 임베딩을 보관하는 컨테이너. 여러 개를 만들어 **도메인별(관세법, 관세법령, FTA 등)**로 조직화 가능. citeturn6view0 |
| **Document / File** | 스토어에 인덱싱된 각 파일 단위(법령 PDF, HWP → PDF 변환본, TXT 등). |
| **Operation** | `upload_to_file_search_store`, `import_file` 호출 시 반환되는 비동기 작업. `done == True`가 되어야 인덱싱 완료. citeturn6view0 |
| **FileSearch Tool** | `generate_content` 호출 시 `tools`에 넣는 설정. 어떤 스토어를 검색할지, `topK`, `metadata_filter` 등을 지정. citeturn6view0turn6view1 |
| **Grounding Metadata** | 응답이 실제로 File Search 결과를 썼는지, 어떤 청크에서 가져왔는지 나타내는 메타데이터. (`hasCitations`, `chunksCount` 등) |

---

## 3. 엔드투엔드 흐름 (요약)

1. **클라이언트 생성**  
   - Python: `client = genai.Client(api_key=...)`
2. **File Search Store 생성**  
   - `client.file_search_stores.create(config={'display_name': '관세-법령-스토어'})`
3. **파일 업로드 + 인덱싱**  
   - `upload_to_file_search_store` 또는 `import_file` 사용  
   - 반환된 `operation`이 `done == True`가 될 때까지 `client.operations.get`으로 폴링
4. **질의 시 File Search Tool 연결**  
   - `FileSearch(file_search_store_names=[store.name])`  
   - `GenerateContentConfig(tools=[Tool(file_search=...)])`
5. **응답 + 인용 정보 확인**  
   - `response.text` → 답변  
   - `response.candidates[0].grounding_metadata` → 어떤 문서/청크에서 근거를 가져왔는지 확인

---

## 4. Python SDK 기반 사용법

> SDK: `google-genai` (Google Gen AI SDK) citeturn5search22turn5search23

### 4.1 설치 & 기본 세팅

```bash
pip install google-genai
```

```python
from google import genai
from google.genai import types

client = genai.Client(api_key="YOUR_GEMINI_API_KEY")
```

---

### 4.2 File Search Store 생성

```python
file_search_store = client.file_search_stores.create(
    config={"display_name": "관세-법령-스토어"}
)

print(file_search_store.name)
# 예: "fileSearchStores/kwansee-law-123456"
```

- **주의:** 실제 API에서 사용하는 것은 `display_name`이 아니라 `name`입니다.  
  → `file_search_store.name` 값이 **`fileSearchStores/...` 형태**여야 합니다. citeturn6view0

---

### 4.3 파일 업로드 + 인덱싱 (권장: 직접 업로드)

```python
import time

operation = client.file_search_stores.upload_to_file_search_store(
    file="gwanselaw.pdf",                 # 파일 경로
    file_search_store_name=file_search_store.name,
    config={
        "display_name": "관세법_현행_20250101",  # 인용에 표시될 이름
        # 선택: 커스텀 메타데이터
        "custom_metadata": [
            {"key": "법령명", "string_value": "관세법"},
            {"key": "버전", "string_value": "현행"},
            {"key": "시행일", "string_value": "2025-01-01"},
        ],
    },
)

# 인덱싱 완료 대기
while not operation.done:
    time.sleep(5)
    operation = client.operations.get(operation.name)
```

- 이 단계에서:
  - 파일이 청크로 나뉘고
  - 임베딩이 생성되어
  - `file_search_store`에 영구 저장됩니다. citeturn6view0turn5search25

---

### 4.4 Files API를 이미 쓰는 경우 (선택)

1. Files API로 파일 업로드 (`client.files.upload(...)`)
2. `file_search_stores.import_file(...)`로 스토어에 가져오기

```python
sample_file = client.files.upload(
    file="gwanselaw.pdf",
    config={"display_name": "관세법_원본파일"},
)

operation = client.file_search_stores.import_file(
    file_search_store_name=file_search_store.name,
    file_name=sample_file.name,
    custom_metadata=[
        {"key": "법령명", "string_value": "관세법"},
        {"key": "버전", "string_value": "현행"},
    ],
)

while not operation.done:
    time.sleep(5)
    operation = client.operations.get(operation.name)
```

---

### 4.5 File Search를 붙인 `generate_content` 호출

```python
file_search_tool = types.Tool(
    file_search=types.FileSearch(
        file_search_store_names=[file_search_store.name],
        # 선택 옵션:
        # top_k=10,
        # metadata_filter="법령명 = '관세법' AND 버전 = '현행'",
    )
)

response = client.models.generate_content(
    model="gemini-2.5-flash",  # 또는 gemini-2.5-pro
    contents="관세법 제38조 제1항의 제목과 핵심 내용을 요약해줘.",
    config=types.GenerateContentConfig(
        tools=[file_search_tool]
    ),
)

print("답변:")
print(response.text)

print("\nGrounding metadata:")
print(response.candidates[0].grounding_metadata)
```

- `file_search_store_names`에 반드시 **`fileSearchStores/...` 전체 name**을 넣어야 합니다. citeturn6view0turn5search21
- `metadata_filter` 구문은 [AIP-160] 스타일 쿼리(`field = value AND ...`)를 따릅니다. citeturn6view0

---

### 4.6 메타데이터 필터 예시 (법령 RAG 전용)

```python
file_search_tool = types.Tool(
    file_search=types.FileSearch(
        file_search_store_names=[file_search_store.name],
        metadata_filter=(
            "법령명 = '관세법' "
            "AND 버전 = '현행' "
            "AND 시행일 <= '2025-11-13'"
        ),
        # top_k=8,
    )
)
```

- 여러 버전의 관세법/시행령/시행규칙을 한 스토어에 넣고,
  - `법령명`, `버전`(현행/구법), `시행일`, `개정일` 등을 메타데이터로 두면  
  - **“특정 시점 기준 현행 규정만 검색”** 같은 필터링이 가능

---

### 4.7 스토어/문서 관리 (list / get / delete)

```python
# 스토어 전체 목록
for store in client.file_search_stores.list():
    print(store.name, store.display_name)

# 특정 스토어 조회
store = client.file_search_stores.get(name=file_search_store.name)

# 스토어 삭제 (안의 문서까지 강제 삭제)
client.file_search_stores.delete(
    name=file_search_store.name,
    config={"force": True},
)
```

- 문서(파일) 단위 관리: 공식 문서의 **File Search Documents API** 섹션 참고. citeturn6view0  

---

## 5. REST API 기반 사용법 (요약)

### 5.1 스토어 생성

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/fileSearchStores?key=${GEMINI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "displayName": "관세-법령-스토어" }'
```

- 응답 JSON의 `name` 필드를 추출  
  - 예: `"fileSearchStores/kwansee-law-123456"` citeturn6view0  

### 5.2 파일 업로드 + 인덱싱 (`uploadToFileSearchStore`)

REST는 **Resumable Upload** 2단계 절차를 사용합니다. citeturn6view0

1. 업로드 세션 시작 (`uploadToFileSearchStore` 엔드포인트 호출)  
2. `X-Goog-Upload-Url`로 실제 파일 바이트 전송

> 공식 문서 예시의 shell 스크립트를 그대로 활용하는 것이 가장 안전합니다.

### 5.3 File Search를 붙인 `generateContent` 요청

```jsonc
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=YOUR_KEY
Content-Type: application/json

{
  "contents": [
    {
      "parts": [
        { "text": "관세법 제38조 제1항의 핵심 내용을 요약해줘." }
      ]
    }
  ],
  "tools": [
    {
      "file_search": {
        "file_search_store_names": [
          "fileSearchStores/kwansee-law-123456"
        ],
        "top_k": 8,
        "metadata_filter": "법령명 = '관세법' AND 버전 = '현행'"
      }
    }
  ]
}
```

---

## 6. Grounding Metadata & 인용

### 6.1 Grounding Metadata 필드 예시

`response.candidates[0].grounding_metadata` 안에는 대략 이런 정보가 들어갑니다 (구조 예시):

```jsonc
{
  "groundingChunks": [
    {
      "id": "chunk-1",
      "source": {
        "file": {
          "displayName": "관세법_현행_20250101",
          "name": "files/123..."
        }
      },
      "text": "관세법 제38조 제1항 ...",
      "startIndex": 123,
      "endIndex": 456
    }
  ],
  "groundingSupports": [...],
  "webSearchQueries": [...]
}
```

대표적인 진단 지표:

- `hasCitations: true/false`
- `chunksCount: 0 또는 양수`
- `groundingChunks` 배열의 길이

---

### 6.2 질문에서 보신 로그 해석

```json
[File Search] Grounding Metadata: {
  "hasCitations": false,
  "hasGroundingChunks": false,
  "citationsCount": 0,
  "chunksCount": 0
}
```

→ 의미:

- 이번 응답에서 **File Search가 전혀 사용되지 않았다**
  - 검색된 청크 0개
  - 따라서 인용도 0개

**가능한 원인:**

1. 스토어에 아직 문서가 인덱싱되지 않았거나 (operation 미완료)
2. `tools.file_search.file_search_store_names`가 비어 있거나 잘못된 값
3. File Search를 지원하지 않는 모델 사용 (2.5가 아닌 모델)
4. 실제로 검색 결과가 0개(topK는 요청했지만, 관련 청크가 하나도 없다고 판단한 경우)

---

## 7. Chunking & 고급 설정

File Search는 기본적으로 **자동 청킹 전략**을 적용하지만, 일부 파라미터를 통해 조정할 수 있습니다. citeturn6view0turn5search1

- 대표 개념 (문서 기준 정리):
  - **chunkSizeToken**: 청크 길이(토큰 수) 상한
  - **chunkOverlapToken**: 청크 간 겹치는 영역 길이
  - **maxEmbeddingRequestsPerMinute**: 인덱싱 속도 제한 등

> 대부분의 경우 기본 설정으로도 충분하지만,  
> **법령처럼 조문 구조가 뚜렷한 문서**는:
> - 조문 단위(제1조, 제2조…)로 나누어 미리 정제된 텍스트를 업로드하면  
> - 검색 품질이 더 좋아질 수 있습니다.

---

## 8. 법령 RAG 구축 시 추천 메타데이터 스키마

File Search 자체에는 스키마 강제가 없으므로, **메타데이터 키를 설계하는 쪽이 중요**합니다.

예시 스키마(관세법 도메인):

| key | type | 예시 |
|-----|------|------|
| `법령명` | string | `"관세법"` |
| `법종류` | string | `"법률"`, `"대통령령"`, `"총리령·부령"`, `"훈령"`, `"고시"` 등 |
| `버전` | string | `"현행"`, `"구법"`, `"개정전"` |
| `시행일` | string | `"2025-01-01"` |
| `개정일` | string | `"2024-12-15"` |
| `조문번호` | string | `"제38조제1항"` (조문 단위 파일인 경우) |
| `소관부서` | string | `"관세청"` 등 |

활용 예시:

- “**2024-01-01 기준 현행 관세법만** 대상으로 검색”
  - `metadata_filter="법령명 = '관세법' AND 시행일 <= '2024-01-01' AND 버전 = '현행'"`

- “**관세청장이 정하는 고시**만 검색”
  - `metadata_filter="법종류 = '고시' AND 소관부서 = '관세청'"`

---

## 9. 흔한 오류 & 디버깅 체크리스트

### 9.1 스토어에는 파일이 있는데, `chunksCount: 0`이 나올 때

1. **Operation 완료 여부 확인**
   - `while not operation.done: ...` 루프 없이 바로 질의하면, 인덱싱이 아직 안 끝났을 수 있습니다. citeturn6view0turn5search25
2. **스토어 이름 잘못 사용**
   - `display_name`이 아니라, 응답의 `name`(예: `fileSearchStores/...`)를 `file_search_store_names`에 넣어야 합니다.
3. **File Search Tool 누락**
   - `tools=[...]`에 아예 File Search를 안 넣은 경우
4. **지원 모델이 아님**
   - `gemini-1.5-pro` 같은 이전 모델에서는 File Search가 작동하지 않습니다. (2.5 계열 사용 필요)
5. **스토어 안에 실제 문서가 없는 경우**
   - `client.file_search_stores.documents.list(parent=store.name)` 등으로 실제 문서 존재 여부 확인

---

## 10. 참고 자료

- 공식 문서: **File Search | Gemini API** citeturn6view0  
- 공식 튜토리얼: **Building a Podcast Knowledge Base with the Gemini File Search Tool** citeturn6view1  
- 개요 & 가격/아키텍처 분석 아티클들:
  - Google 공식 블로그: *Introducing the File Search Tool in Gemini API* citeturn5search0  
  - 기술 딥다이브 예시: *A Technical Deep Dive into Gemini's File Search Tool* (Python 예제 포함) citeturn5search25  
- SDK 개요: **Google Gen AI SDK** 문서 citeturn5search22turn5search23  

---

이 문서는 그대로 `gemini-file-search-guide.md`로 저장해서  
- Claude / GPT / NotebookLM 등에 “지침”으로 먹이고,  
- 관세법·FTA·행정규칙 RAG 구축 시 **File Search 사용 패턴의 기준 문서**로 활용하시면 됩니다.
