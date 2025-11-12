# LexDiff Admin - Gemini File Search 관리 UI

Google Gemini File Search API를 위한 웹 기반 관리 인터페이스입니다.

## 📋 목차

- [개요](#개요)
- [주요 기능](#주요-기능)
- [설치 및 실행](#설치-및-실행)
- [환경 변수 설정](#환경-변수-설정)
- [사용 방법](#사용-방법)
- [API 엔드포인트](#api-엔드포인트)
- [프로젝트 구조](#프로젝트-구조)
- [기술 스택](#기술-스택)
- [참고 문서](#참고-문서)

---

## 개요

LexDiff Admin은 Google Gemini File Search API를 관리하기 위한 독립 실행형 Next.js 웹 애플리케이션입니다. 메인 LexDiff 애플리케이션과 별개로 실행되며, File Search Store 및 업로드된 파일을 쉽게 관리할 수 있는 직관적인 UI를 제공합니다.

**주요 용도**:
- File Search Store 생성/삭제/조회
- 파일 업로드/삭제/조회
- 저장소 통계 모니터링
- 메타데이터 기반 파일 관리
- 만료 임박 파일 추적

---

## 주요 기능

### 1. Dashboard
- 실시간 저장소 통계 (파일 수, 용량 사용률, 만료 예정 파일)
- 빠른 액션 링크
- 시스템 상태 한눈에 보기

### 2. File Search Stores 관리
- ✅ 모든 Store 목록 조회 (최대 10개)
- ✅ 새 Store 생성
- ✅ Store 삭제 (일반/강제)
- ✅ Store 상세 정보 조회

### 3. Files 관리
- ✅ 업로드된 모든 파일 목록 조회
- ✅ 파일 상세 정보 (크기, MIME type, 만료 시간, 상태)
- ✅ 파일 개별/일괄 삭제
- ✅ 만료 임박 파일 하이라이트
- ✅ 필터링 및 정렬

### 4. File Upload
- ✅ Drag & Drop 파일 업로드
- ✅ 다중 파일 선택
- ✅ Store 선택 (자동 인덱싱)
- ✅ 메타데이터 입력 (법령명, 조문번호 등)
- ✅ 업로드 진행률 표시
- ✅ 실패 시 재시도 기능

### 5. 통계 및 모니터링
- ✅ 총 파일 수
- ✅ 저장소 사용량 (GB, %)
- ✅ 24시간 내 만료 파일 수
- ✅ 실시간 새로고침

---

## 설치 및 실행

### 1. 의존성 설치

```bash
cd /admin
npm install
# or
pnpm install
```

### 2. 환경 변수 설정

`.env.local` 파일 생성:

```bash
cp .env.local.example .env.local
```

`.env.local` 파일 편집:

```env
GEMINI_API_KEY=your_actual_gemini_api_key_here
```

**API Key 발급**: https://aistudio.google.com/apikey

### 3. 개발 서버 실행

```bash
npm run dev
```

서버가 http://localhost:3001 에서 실행됩니다.

### 4. 프로덕션 빌드

```bash
npm run build
npm start
```

---

## 환경 변수 설정

| 변수명 | 필수 | 설명 | 예시 |
|--------|------|------|------|
| `GEMINI_API_KEY` | ✅ | Google Gemini API Key | `AIzaSy...` |

### API Key 보안 주의사항

⚠️ **중요**: API Key는 절대 클라이언트에 노출되지 않습니다.
- 모든 Gemini API 호출은 서버 사이드 (`/api/*` routes)에서만 수행됩니다.
- 환경 변수는 빌드 시 서버 환경에만 포함됩니다.
- `.gitignore`에 `.env*.local`이 포함되어 있습니다.

---

## 사용 방법

### 1. File Search Store 생성

1. **Stores** 페이지로 이동
2. **+ New Store** 버튼 클릭
3. Display Name 입력 (예: `lexdiff-law-store`)
4. **Create** 버튼 클릭

**제한사항**: 프로젝트당 최대 10개 Store

### 2. 파일 업로드

#### 방법 A: Drag & Drop

1. **Upload** 페이지로 이동
2. Target Store 선택 (선택사항)
3. 메타데이터 입력 (선택사항)
   - Law Name: 관세법
   - Article Number: 38
   - Law Type: law
   - Effective Date: 2024-01-01
4. 파일을 Drop Zone에 드래그
5. **Upload All** 버튼 클릭

#### 방법 B: Browse Files

1. **Browse Files** 버튼 클릭
2. 파일 선택 (다중 선택 가능)
3. **Upload All** 버튼 클릭

**지원 파일 형식**:
- 문서: PDF, TXT, HTML, CSS, MARKDOWN, CSV, XML, RTF
- 코드: JavaScript, Python, Java, C++, Go, Rust, etc.
- 이미지: PNG, JPEG, WEBP, HEIC, HEIF
- 오디오: WAV, MP3, AIFF, AAC, OGG, FLAC
- 비디오: MP4, MPEG, MOV, AVI, FLV, MPG, WEBM, WMV, 3GPP

**제한사항**:
- 최대 파일 크기: 2GB
- 프로젝트당 총 저장 용량: 20GB
- 파일 보존 기간: 48시간 (자동 삭제)

### 3. 파일 관리

#### 파일 조회

1. **Files** 페이지로 이동
2. 모든 업로드된 파일 목록 확인
3. 각 파일의 상세 정보 확인:
   - Name, Size, MIME Type
   - Expiration Time (남은 시간)
   - State (ACTIVE, PROCESSING, FAILED)

#### 파일 삭제

**개별 삭제**:
1. 삭제할 파일의 **Delete** 버튼 클릭
2. 확인 다이얼로그에서 확인

**일괄 삭제**:
1. 삭제할 파일들 체크박스 선택
2. **Delete Selected (N)** 버튼 클릭
3. 확인 다이얼로그에서 확인

### 4. Store 삭제

1. **Stores** 페이지로 이동
2. 삭제할 Store의 **Delete** 버튼 클릭
3. 확인 다이얼로그에서 확인

**강제 삭제**:
- Store에 파일이 있는 경우, 일반 삭제 시도 시 에러 발생
- 에러 발생 시 "Force delete?" 다이얼로그 표시
- 강제 삭제 시 Store 내 모든 파일도 함께 삭제됨

---

## API 엔드포인트

### File Search Stores

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stores` | 모든 Store 목록 조회 |
| `POST` | `/api/stores` | 새 Store 생성 |
| `GET` | `/api/stores/[id]` | Store 상세 정보 조회 |
| `DELETE` | `/api/stores/[id]?force=true` | Store 삭제 (강제 옵션) |

### Files

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/files` | 모든 파일 목록 조회 |
| `GET` | `/api/files/[id]` | 파일 상세 정보 조회 |
| `DELETE` | `/api/files/[id]` | 파일 삭제 |

### Upload

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/upload` | 파일 업로드 (multipart/form-data) |

**Request Body** (FormData):
- `file`: File (required)
- `displayName`: string (optional)
- `storeName`: string (optional) - "fileSearchStores/abc123xyz"
- `metadata`: JSON string (optional) - `{"law_name": "관세법", "article": "38"}`

### Statistics

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/stats` | 저장소 통계 조회 |

---

## 프로젝트 구조

```
/admin
├── app/
│   ├── layout.tsx              # 전역 레이아웃
│   ├── page.tsx                # Dashboard
│   ├── globals.css             # 전역 스타일
│   ├── stores/
│   │   └── page.tsx            # Stores 관리 페이지
│   ├── files/
│   │   └── page.tsx            # Files 관리 페이지
│   ├── upload/
│   │   └── page.tsx            # 파일 업로드 페이지
│   └── api/
│       ├── stores/
│       │   ├── route.ts        # Store 목록/생성 API
│       │   └── [id]/
│       │       └── route.ts    # Store 조회/삭제 API
│       ├── files/
│       │   ├── route.ts        # 파일 목록 API
│       │   └── [id]/
│       │       └── route.ts    # 파일 조회/삭제 API
│       ├── upload/
│       │   └── route.ts        # 파일 업로드 API
│       └── stats/
│           └── route.ts        # 통계 API
├── components/
│   ├── stats-card.tsx          # 통계 카드 컴포넌트
│   ├── store-list.tsx          # Store 목록 컴포넌트
│   ├── file-list.tsx           # 파일 목록 컴포넌트
│   └── file-upload-form.tsx    # 파일 업로드 폼
├── lib/
│   ├── types.ts                # TypeScript 타입 정의
│   └── gemini-admin.ts         # Gemini Admin API wrapper
├── package.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local.example
├── .gitignore
└── README.md
```

---

## 기술 스택

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **API**: Google Gemini API (`@google/genai` v1.29.0)
- **Runtime**: Node.js 20+

---

## 참고 문서

### 내부 문서

- **완벽한 API 가이드**: `/docs/GEMINI_FILE_SEARCH_GUIDE.md`
  - Gemini File Search API 사용 방법
  - RAG 답변 생성 전략
  - 환각 방지 및 정확도 향상
  - 비용 및 제한사항
  - 트러블슈팅

### 외부 문서

- [Gemini File Search 공식 문서](https://ai.google.dev/gemini-api/docs/file-search)
- [Files API 레퍼런스](https://ai.google.dev/gemini-api/docs/files)
- [File Search Stores API](https://ai.google.dev/api/file-search/file-search-stores)
- [Google Gen AI SDK (Node.js)](https://github.com/googleapis/js-genai)

---

## 트러블슈팅

### 1. API Key 오류

**증상**: `GEMINI_API_KEY is required`

**해결**:
```bash
# .env.local 파일 확인
cat .env.local

# API Key가 없으면 추가
echo "GEMINI_API_KEY=your_key_here" > .env.local

# 서버 재시작
npm run dev
```

### 2. 파일 업로드 실패

**증상**: `Upload failed: File too large`

**해결**:
- 파일 크기는 2GB 이하여야 합니다.
- 총 저장 용량은 20GB를 초과할 수 없습니다.

### 3. Store 삭제 실패

**증상**: `Cannot delete store: Store contains files`

**해결**:
- Store에 파일이 있는 경우 일반 삭제가 불가능합니다.
- 강제 삭제(`?force=true`)를 사용하거나, 먼저 파일을 모두 삭제하세요.

### 4. 포트 충돌

**증상**: `Port 3001 is already in use`

**해결**:
```bash
# 다른 포트 사용
PORT=3002 npm run dev

# 또는 package.json의 dev 스크립트 수정
# "dev": "next dev --port 3002"
```

---

## FAQ

### Q1: 메인 앱과 Admin UI를 동시에 실행할 수 있나요?

**A**: 네. 메인 앱은 포트 3000, Admin UI는 포트 3001에서 실행됩니다.

```bash
# Terminal 1: 메인 앱
cd /home/user/lexdiff
npm run dev

# Terminal 2: Admin UI
cd /home/user/lexdiff/admin
npm run dev
```

### Q2: 파일이 48시간 후 자동 삭제되나요?

**A**: 네. Gemini File API는 업로드 후 48시간이 지나면 파일을 자동으로 삭제합니다. 중요한 파일은 만료 전에 재업로드해야 합니다.

### Q3: Store는 몇 개까지 만들 수 있나요?

**A**: 프로젝트당 최대 10개입니다.

### Q4: 파일이 어느 Store에 속하는지 어떻게 알 수 있나요?

**A**: 현재 API는 파일의 Store 소속 정보를 직접 제공하지 않습니다. 메타데이터에 Store 정보를 포함하여 업로드하는 것을 권장합니다.

### Q5: 프로덕션 환경에 배포할 수 있나요?

**A**: 네. 하지만 API Key 보안에 주의하세요:
- 환경 변수는 서버 환경에서만 설정
- HTTPS 사용 필수
- 인증/권한 시스템 추가 권장 (현재 미구현)

---

## 라이선스

이 프로젝트는 LexDiff의 일부이며, 메인 프로젝트와 동일한 라이선스를 따릅니다.

---

## 문의

이슈 또는 질문이 있으시면 프로젝트 관리자에게 문의하세요.

---

**Last Updated**: 2025-11-12
**Version**: 1.0.0
