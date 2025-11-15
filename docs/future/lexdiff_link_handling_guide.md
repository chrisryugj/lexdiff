# 국가법령 DRF HTML 링크 처리 및 내부 라우팅 구현 가이드 (v0 실현형)

이 문서는 **국가법령정보 DRF API로 받은 HTML 본문 내 링크를 내부 시스템에 안전하게 통합하는 설계 및 코드 가이드**입니다.
v0 수준(React + TypeScript + DRF API)에서 바로 적용 가능한 형태로 작성되었습니다.

---

## 1️⃣ 기본 원리

1. DRF에서 `type=HTML`로 호출하면 `<a>` 태그를 포함한 원문이 그대로 전달됨.
2. `DOMPurify`로 보안 필터링 후, 외부 링크를 내부 라우트(`/law/:id?jo=...`)로 변환.
3. `attachLinkDelegation()`을 통해 SPA 라우터(Next.js, React Router 등) 내부 네비게이션 처리.

---

## 2️⃣ 권장 API 사용 방식

| 구분 | API 예시 | 비고 |
|------|-----------|------|
| 본문조회 | `/DRF/lawService.do?target=eflaw&type=HTML&ID=001556` | 조문 링크 포함 |
| 신·구비교 | `/DRF/lawService.do?target=oldAndNew&type=HTML&ID=001556&MST=276067&efYd=20251001` | 비교표/링크 유지 |

- XML(`type=XML`)은 링크 정보가 손실되므로, **HTML과 병행 사용** 권장.

---

## 3️⃣ Sanitizer 설정 예시

\`\`\`ts
import DOMPurify from "dompurify";

const allowed = {
  ALLOWED_TAGS: ["a","p","div","span","table","thead","tbody","tr","th","td","ul","ol","li","br","b","i","em","strong","sup","sub","hr"],
  ALLOWED_ATTR: ["href","title","target","rel","id","class","data-law-id","data-jo","data-efyd"]
};

export function sanitize(html: string) {
  return DOMPurify.sanitize(html, allowed);
}
\`\`\`

- `style` 속성 제거 (기관 보안 기준)
- `<a>`의 `href`, `target`, `rel`만 허용

---

## 4️⃣ 링크 재작성 (외부 → 내부 경로)

\`\`\`ts
function rewriteLinks(container: HTMLElement) {
  container.querySelectorAll<HTMLAnchorElement>("a[href]").forEach(a => {
    const href = a.getAttribute("href") || "";
    const url = new URL(href, "https://www.law.go.kr");

    // 국가법령 DRF 링크 → 내부 경로 변환
    if (url.pathname.includes("/DRF/lawService.do")) {
      const id = url.searchParams.get("ID") || "";
      const jo = url.searchParams.get("JO") || "";
      const efYd = url.searchParams.get("efYd") || "";

      const internal = new URL(location.origin);
      internal.pathname = `/law/${id}`;
      if (jo) internal.searchParams.set("jo", jo);
      if (efYd) internal.searchParams.set("efYd", efYd);

      a.href = internal.toString();
      a.setAttribute("target", "_self");
      a.setAttribute("rel", "noopener");
    } else {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  });
}
\`\`\`

---

## 5️⃣ 클릭 이벤트 인터셉트 (SPA 내부 이동)

\`\`\`ts
function attachLinkDelegation(container: HTMLElement, navigate: (path: string) => void) {
  container.addEventListener("click", (e) => {
    const a = (e.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!a) return;
    const url = new URL(a.href);
    if (url.origin === location.origin && url.pathname.startsWith("/law/")) {
      e.preventDefault();
      navigate(url.pathname + url.search);
    }
  });
}
\`\`\`

---

## 6️⃣ XML 기반 자동 링크 생성 (linkification)

\`\`\`ts
function linkifyPlainText(htmlEscaped: string, currentLawId: string) {
  return htmlEscaped.replace(
    /제\s*(\d+)\s*조/g,
    (m, num) => `<a href="/law/${currentLawId}?jo=${String(num).padStart(4,"0")}00" class="jo-link">${m}</a>`
  );
}
\`\`\`

- 패턴 인식 기반으로 "제38조" 등 조문명 자동 링크화
- 캐시된 `lawName → lawId` 매핑 사용 시 타 법령 참조도 지원

---

## 7️⃣ 통합 렌더 파이프라인

\`\`\`ts
async function renderLawHtml(container: HTMLElement, apiHtml: string, navigate: (path: string)=>void) {
  const safe = sanitize(apiHtml);
  container.innerHTML = safe;
  rewriteLinks(container);
  attachLinkDelegation(container, navigate);
}
\`\`\`

---

## 8️⃣ UI UX 제안

| 요소 | 설명 |
|------|------|
| 링크 툴팁 | `title="클릭해서 내부에서 열기"` |
| 외부링크 아이콘 | ↗ 표시 |
| `data-efyd` | 시행일자 표시용 배지 |
| 포커스 이동 | `?jo=003800` 시 해당 조문 `scrollIntoView()` |

---

## ✅ 요약

- DRF HTML 그대로 받아 `<a>` 유지 → 내부라우트 재작성으로 SPA 내 이동
- 보안: DOMPurify 화이트리스트 적용
- 링크 변환: `rewriteLinks()` + 델리게이션 조합
- XML 전용: `linkifyPlainText()`로 조문 참조 자동 링크 생성

---

**이 설계는 v0에서도 즉시 적용 가능하며, Gemini 요약·신구비교 모달과 병행 사용에 완벽히 호환됩니다.**
