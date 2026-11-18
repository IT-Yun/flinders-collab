# Client Storage Classification

기준일: 2026-03-19  
대상 범위: `client/src`의 `localStorage`, `sessionStorage`, 전역 window 상태 사용처

## 분류 기준

- `로컬 유지`
  - 해당 브라우저/기기에서만 달라도 문제 없는 UI 편의 상태
- `서버 이전 필요`
  - 웹/iOS/Android/다른 브라우저에서 동일해야 하는 사용자 상태
- `하이브리드 권장`
  - 즉시 반응은 로컬 캐시로 유지하되, 진실 원본은 서버에 둬야 하는 상태

## 최종 분류

### 1. `flinders_session`
- 위치:
  - `client/src/lib/auth-token.js`
  - `client/src/hooks/useAuth.js`
  - `client/src/App.jsx`
- 현재 의미:
  - access token, 만료 시각, 사용자 프로필 일부를 브라우저에 저장
- 판정: `로컬 유지`
- 이유:
  - 로그인 세션 토큰은 기본적으로 클라이언트 저장이 필요합니다.
  - 이건 “동기화할 사용자 데이터”가 아니라 인증 상태 캐시입니다.
  - 서버가 이미 진실 원본이고, 클라이언트는 토큰을 보관만 합니다.
- 주의:
  - 보안 측면에서는 장기적으로 HttpOnly cookie 기반 세션이 더 강합니다.
  - 하지만 “앱/웹 데이터 동기화” 관점에서 서버 이전 대상은 아닙니다.

### 2. `tutorial-completed`
- 위치:
  - `client/src/components/InteractiveTutorial.jsx`
  - `client/src/pages/DashboardPage.jsx`
- 현재 의미:
  - 전역 인터랙티브 튜토리얼을 다시 띄우지 않도록 하는 영구 억제 플래그
- 판정: `로컬 유지`
- 이유:
  - 튜토리얼은 기기별 UX 선호에 가깝습니다.
  - 웹에서 안 보고, 앱에서는 다시 보고 싶을 수 있습니다.
  - 모든 기기에서 무조건 동일할 필요가 없습니다.
- 예외:
  - 제품 정책상 “계정당 딱 한 번만” 보여야 한다면 서버 이전 대상이 됩니다.

### 3. `tutorial-dismissed-session`
- 위치:
  - `client/src/components/InteractiveTutorial.jsx`
  - `client/src/pages/DashboardPage.jsx`
- 현재 의미:
  - 현재 세션에서만 튜토리얼 프롬프트를 닫아 두는 임시 상태
- 판정: `로컬 유지`
- 이유:
  - 세션 단위 임시 억제는 전형적인 sessionStorage 용도입니다.
  - 다른 기기와 동기화할 이유가 없습니다.

### 4. `tutorial-room-id`
- 위치:
  - `client/src/components/InteractiveTutorial.jsx`
- 현재 의미:
  - 튜토리얼 실행 중 생성한 임시 방의 ID를 저장해서 크래시 후 정리
- 판정: `로컬 유지`
- 이유:
  - 사용자의 영속 선호나 데이터가 아니라 복구용 임시 포인터입니다.
  - 서버 동기화 대상이 아닙니다.
- 별도 메모:
  - 현재 구현은 삭제 실패 시 로컬 키를 제거해 버려 재정리 근거가 사라집니다.
  - 저장 위치보다 “정리 로직”이 문제입니다.

### 5. `onboarding-tours`
- 위치:
  - `client/src/components/OnboardingTour.jsx`
- 현재 의미:
  - 페이지별 온보딩 투어를 “다시 보지 않기” 처리한 기록
- 판정: `로컬 유지`
- 이유:
  - 페이지별 안내 투어는 브라우저/기기 UX 선호에 속합니다.
  - 앱과 웹에서 각자 다르게 보여도 큰 문제 없습니다.

### 6. `chunk_reload`
- 위치:
  - `client/src/App.jsx`
- 현재 의미:
  - 배포 후 청크 해시 mismatch 발생 시 무한 새로고침을 막는 1회 복구 플래그
- 판정: `로컬 유지`
- 이유:
  - 순수 기술적 복구용 임시 상태입니다.
  - 서버 이전 대상이 아닙니다.

### 7. `room-order:{userId}`
- 위치:
  - `client/src/lib/room-order.js`
  - `client/src/pages/DashboardPage.jsx`
  - `client/src/layouts/MainLayout.jsx`
- 현재 의미:
  - 대시보드/사이드바에서 사용자가 원하는 방 정렬 순서
- 판정: `서버 이전 필요`
- 이유:
  - 이건 단순 UI 임시 상태가 아니라 “사용자 개인 설정”입니다.
  - 웹과 iPhone에서 방 순서가 다르면 사용성이 나빠집니다.
  - 로그인 사용자 기준으로 모든 기기에서 같아야 자연스럽습니다.
- 권장:
  - `user_preferences` 또는 profile 설정 컬럼에 ordered room ids 저장

### 8. `room-last-visited:{userId}:{roomId}`
- 위치:
  - `client/src/lib/room-activity.js`
  - `client/src/layouts/MainLayout.jsx`
  - `client/src/pages/RoomPage.jsx`
- 현재 의미:
  - 특정 방을 마지막으로 본 시각
  - 최근 활동 unread 계산에 사용
- 판정: `서버 이전 필요`
- 이유:
  - unread/새 활동 숫자는 앱과 웹에서 일치해야 합니다.
  - 지금처럼 기기별로 다르면 iPhone에선 읽었는데 웹에는 계속 숫자가 남고, 반대도 생깁니다.
  - 이 데이터는 이미 UI 편의가 아니라 사용자 읽음 상태입니다.
- 권장:
  - user-room 단위 `last_visited_at` 또는 `last_read_activity_at` 서버 저장

### 9. `board-last-seen:{userId}`
- 위치:
  - `client/src/lib/board-notifications.js`
  - `client/src/layouts/MainLayout.jsx`
  - `client/src/pages/BoardPage.jsx`
- 현재 의미:
  - Free Board 마지막 확인 시각
  - 보드 unread 배지/토스트 계산에 사용
- 판정: `서버 이전 필요`
- 이유:
  - 알림/읽음은 대표적인 cross-device 상태입니다.
  - 앱에서 읽은 뒤 웹에도 읽음이 반영되어야 합니다.
  - 현재는 기기별 unread가 달라져 “인스타식 알림” 요구와 정면 충돌합니다.
- 권장:
  - user 단위 `board_last_seen_at` 서버 저장

### 10. `quick-links:{roomId}`
- 위치:
  - `client/src/components/room/QuickLinks.jsx`
  - `client/src/pages/RoomPage.jsx`
- 현재 의미:
  - 방별 Quick Links 목록
- 판정: `서버 이전 필요`
- 이유:
  - 이름과 배치상 “개인 브라우저 메모”가 아니라 방 기능으로 보입니다.
  - 같은 방에 들어와도 다른 사용자/다른 기기에서 링크가 안 보이면 기능 기대와 어긋납니다.
  - 특히 iOS 앱에서 추가한 링크가 웹에 안 보이면 사용자 입장에서 버그로 인식됩니다.
- 결론:
  - 이 항목은 로컬 유지가 아니라 거의 확실히 서버 저장이 맞습니다.
- 권장:
  - room-level quick links 테이블/API 추가
  - 필요한 경우 작성자, 정렬 순서, room_id 포함

### 11. `flinders-interests`
- 위치:
  - `client/src/pages/FlindersLifePage.jsx`
- 현재 의미:
  - Flinders Life 이벤트 추천용 관심사 선택값
- 판정: `서버 이전 필요`
- 이유:
  - 이 값은 추천 결과를 바꾸는 사용자 선호 데이터입니다.
  - 웹과 앱에서 같은 추천 경험을 주려면 계정 단위 동기화가 맞습니다.
  - 로컬에만 두면 iPhone에서 관심사 고른 내용이 웹에 반영되지 않습니다.
- 권장:
  - user preference/profile 설정에 interests 배열 저장

### 12. `flinders-favorites`
- 위치:
  - `client/src/pages/FlindersLifePage.jsx`
- 현재 의미:
  - 사용자가 찜한 Flinders Life 이벤트 ID 목록
- 판정: `서버 이전 필요`
- 이유:
  - favorites/bookmarks는 대표적인 계정 기반 영속 데이터입니다.
  - 기기 간 동기화되지 않으면 저장 기능 가치가 크게 떨어집니다.
- 권장:
  - `user_favorite_events` 형태의 서버 저장

## 전역 window 상태

### 13. `window.__interactiveTutorialState`
- 위치:
  - `client/src/components/InteractiveTutorial.jsx`
  - `client/src/components/OnboardingTour.jsx`
  - `client/src/pages/BoardPage.jsx`
- 현재 의미:
  - 현재 페이지 내부에서 튜토리얼 active/prompt/idle 상태를 전달하는 런타임 메모리 값
- 판정: `로컬 유지`
- 이유:
  - 저장이 아니라 현재 탭 내부 컴포넌트 간 조정용 상태입니다.
  - 서버 이전 대상이 아닙니다.

### 14. `window.__activeOnboardingTourId`
- 위치:
  - `client/src/components/OnboardingTour.jsx`
- 현재 의미:
  - 한 번에 하나의 온보딩 투어만 뜨도록 제어하는 런타임 전역 값
- 판정: `로컬 유지`
- 이유:
  - 저장 대상이 아니라 현재 페이지 제어용 상태입니다.

## 우선순위

### 가장 먼저 서버로 옮겨야 할 것
1. `board-last-seen:{userId}`
2. `room-last-visited:{userId}:{roomId}`
3. `quick-links:{roomId}`
4. `flinders-favorites`
5. `flinders-interests`
6. `room-order:{userId}`

## 구현 상태

### 서버 기준으로 이미 전환 완료
- `board-last-seen:{userId}`
- `room-last-visited:{userId}:{roomId}`
- `quick-links:{roomId}`
- `flinders-interests`
- `flinders-favorites`
- `room-order:{userId}`

## 요약 결론

### 로컬 유지가 맞는 것
- `flinders_session`
- `tutorial-completed`
- `tutorial-dismissed-session`
- `tutorial-room-id`
- `onboarding-tours`
- `chunk_reload`
- `window.__interactiveTutorialState`
- `window.__activeOnboardingTourId`

### 서버 이전이 맞는 것
- `room-order:{userId}`
- `room-last-visited:{userId}:{roomId}`
- `board-last-seen:{userId}`
- `quick-links:{roomId}`
- `flinders-interests`
- `flinders-favorites`

## 판단 메모
- 이번 분류에서 핵심 기준은 “기기 간 동일해야 하는가”였습니다.
- UI 노출 억제, 복구 플래그, 세션 보관은 로컬 유지가 맞습니다.
- unread, 읽음, 즐겨찾기, 개인화 선호, 방 기능 데이터는 서버 저장이 맞습니다.
