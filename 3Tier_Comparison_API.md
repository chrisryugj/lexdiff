# 3단비교 본문 조회 API 가이드

## 기본 정보
- **요청 URL**: `http://www.law.go.kr/DRF/lawService.do?target=thdCmp`
- **참고**: 체계도 등 부가서비스는 법령서비스 신청 시 추가신청 없이 이용 가능

---

## 요청 변수 (Request Parameters)

| 변수 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `OC` | string | ✅ | 사용자 이메일 ID (예: g4c@korea.kr → OC=g4c) |
| `target` | string | ✅ | 서비스 대상 (고정값: `thdCmp`) |
| `type` | char | ✅ | 출력 형태: `HTML` / `XML` / `JSON` |
| `knd` | int | ✅ | 3단비교 종류<br>• 인용조문: `1`<br>• 위임조문: `2` |
| `ID` | char | ⚠️ | 법령 ID (ID 또는 MST 중 하나는 필수) |
| `MST` | char | ⚠️ | 법령 마스터 번호 (법령테이블의 lsi_seq 값) |
| `LM` | string | ❌ | 법령명 (입력 시 해당 법령 링크) |
| `LD` | int | ❌ | 법령 공포일자 |
| `LN` | int | ❌ | 법령 공포번호 |

---

## 샘플 URL

### 1. 3단비교 HTML 상세조회
```
http://www.law.go.kr/DRF/lawService.do?OC=test&target=thdCmp&ID=001372&MST=162662&type=HTML
http://www.law.go.kr/DRF/lawService.do?OC=test&target=thdCmp&ID=001570&type=HTML
```

### 2. 인용조문 3단비교 XML 상세조회
```
http://www.law.go.kr/DRF/lawService.do?OC=test&target=thdCmp&MST=236231&knd=1&type=XML
```

### 3. 위임조문 3단비교 XML 상세조회
```
http://www.law.go.kr/DRF/lawService.do?OC=test&target=thdCmp&MST=222549&knd=2&type=XML
```

### 4. 위임조문 3단비교 JSON 상세조회
```
http://www.law.go.kr/DRF/lawService.do?OC=test&target=thdCmp&MST=222549&knd=2&type=JSON
```

---

## 인용조문 출력 결과 필드 (Response Fields)

| 필드 | 타입 | 설명 |
|------|------|------|
| **기본정보** | string | 인용 삼단비교 기본정보 |
| 법령ID | int | 법령 ID |
| 시행령ID | int | 시행령 ID |
| 시행규칙ID | int | 시행규칙 ID |
| 법령명 | string | 법령 명칭 |
| 시행령명 | string | 법령시행령 명칭 |
| 시행규칙명 | string | 시행규칙 명칭 |
| 법령요약정보 | string | 법령 요약정보 |
| 시행령요약정보 | string | 시행령 요약정보 |
| 시행규칙요약정보 | string | 시행규칙 요약정보 |
| 삼단비교기준 | string | 삼단비교 기준 |
| 삼단비교존재여부 | int | 존재하지 않으면 `N` 조회 |
| 시행일자 | int | 시행일자 |
| **관련삼단비교목록** | string | 관련 삼단비교 목록 |
| 목록명 | string | 목록명 |
| 삼단비교목록상세링크 | string | 인용조문 삼단비교 목록 상세링크 |
| **인용조문삼단비교** | string | 인용조문 삼단비교 |
| **법률조문** | string | 법률조문 |
| 조번호 | int | 조번호 |
| 조가지번호 | int | 조가지번호 |
| 조제목 | string | 조제목 |
| 조내용 | string | 조내용 |
| **시행령조문목록** | string | 시행령조문목록 |
| 시행령조문 | string | 하위 시행령조문 |
| **시행규칙조문목록** | string | 시행규칙조문목록 |
| 시행규칙조문 | string | 하위 시행규칙조문 |
| **위임행정규칙목록** | string | 위임행정규칙목록 |
| 위임행정규칙 | string | 위임행정규칙 |
| 위임행정규칙명 | string | 위임행정규칙명 |
| 위임행정규칙일련번호 | int | 위임행정규칙일련번호 |
| 위임행정규칙조번호 | int | 위임행정규칙조번호 |
| 위임행정규칙조가지번호 | int | 위임행정규칙조가지번호 |

---

## 위임조문 출력 결과 필드 (Response Fields)

| 필드 | 타입 | 설명 |
|------|------|------|
| **기본정보** | string | 위임 삼단비교 기본정보 |
| 법령ID | int | 법령 ID |
| 법령일련번호 | int | 법령일련번호 |
| 공포일자 | int | 공포일자 |
| 공포번호 | int | 공포번호 |
| 법종구분 | string | 법종 구분 |
| 법령명 | string | 법령 명칭 |
| 시행일자 | int | 시행일자 |
| 제개정구분 | string | 제개정구분 |
| 삼단비교존재여부 | int | 존재하지 않으면 `N` 조회 |
| 기준법법령명 | string | 기준법 법령명 |
| **기준법령목록** | string | 기준 법령 목록 |
| 기준법법령명 | string | 기준법 법령명 |
| 법종구분 | string | 법종 구분 |
| 공포번호 | int | 공포번호 |
| 공포일자 | int | 공포일자 |
| 제개정구분 | string | 제개정구분 |
| 위임3비교상세링크 | string | 위임조문 3비교 목록 상세링크 |
| **위임조문삼단비교** | string | 위임조문 삼단비교 |
| **법률조문** | string | 법률조문 |
| 조번호 | int | 조번호 |
| 조가지번호 | int | 조가지번호 |
| 조제목 | string | 조제목 |
| 조내용 | string | 조내용 |
| 시행령조문 | string | 하위 시행령조문 |
| **시행규칙조문목록** | string | 시행규칙조문목록 |
| 시행규칙조문 | string | 하위 시행규칙조문 |

---

## 참고사항
- **ID**와 **MST** 중 최소 하나는 반드시 입력해야 합니다
- **knd** 값에 따라 인용조문(1) 또는 위임조문(2)을 선택할 수 있습니다
- 응답 형식은 HTML, XML, JSON 중 선택 가능합니다
