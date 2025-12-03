# 전역 CLAUDE.md 동기화

이 프로젝트의 `.claude/global-claude-md.sync.md` 파일을 사용자의 전역 설정 `~/.claude/CLAUDE.md`와 동기화합니다.

## 작업 수행

1. **현재 프로젝트의 sync 파일 읽기**: `.claude/global-claude-md.sync.md`
2. **전역 설정 파일 읽기**: `~/.claude/CLAUDE.md` (Windows: `C:\Users\{username}\.claude\CLAUDE.md`)
3. **두 파일 비교**하여 차이점 확인
4. **사용자에게 동기화 방향 질문**:
   - `push`: 프로젝트 → 전역 (이 프로젝트의 설정을 전역으로 배포)
   - `pull`: 전역 → 프로젝트 (전역 설정을 이 프로젝트로 가져오기)
   - `diff`: 차이점만 표시 (변경 없음)
5. **선택에 따라 파일 복사**

## 사용 시나리오

### 집에서 회사로 동기화
1. 집 PC에서 전역 설정 수정
2. 이 프로젝트에서 `/sync-global` 실행 → `pull` 선택
3. git commit & push
4. 회사 PC에서 git pull
5. 회사 PC에서 `/sync-global` 실행 → `push` 선택

### 회사에서 집으로 동기화
위와 반대로 진행

## 주의사항
- 동기화 전 반드시 차이점 확인
- 중요한 변경사항이 있으면 백업 권장
- 버전 번호와 날짜 확인
