# Platform Architecture

기준일: 2026-03-19

## 목표

- 웹, iOS, Android가 같은 핵심 데이터를 공유한다.
- 웹과 앱은 디자인과 인터랙션만 다를 수 있다.
- 기능 로직과 데이터 접근은 최대한 공용으로 유지한다.
- 나중에 웹/앱을 따로 다듬어도 관리 비용이 폭증하지 않게 한다.

## 핵심 원칙

### 1. 데이터는 서버가 진실 원본
- 게시글
- 댓글
- 방
- 채팅
- 일정
- 파일
- 읽음 상태
- 개인 설정 중 기기 간 일치가 필요한 것

이 항목들은 전부 API + DB 기준으로 동작해야 합니다.

### 2. 로컬 저장은 기기 전용 UI 상태만 허용
- 튜토리얼 다시 보지 않기
- 일시적 팝업 닫기
- 청크 reload 복구 플래그
- 브라우저 단위 UX 상태

### 3. UI만 플랫폼별 분기
- 웹: 사이드바, 넓은 레이아웃, 데스크톱 상호작용
- 앱: 하단 탭, 시트, 큰 터치 영역, 모바일 입력 흐름

즉 데이터와 비즈니스 로직은 공유하고, 레이아웃만 달라집니다.

## 권장 레이어 구조

### 공용 레이어
- `client/src/services`
  - API 호출만 담당
- `client/src/lib`
  - 순수 유틸, 포맷터, 비즈니스 헬퍼
- `client/src/hooks`
  - 공용 상태/데이터 훅
- `server/src`
  - 실제 데이터 저장, 권한 체크, API 응답

### 웹 전용 레이어
- 웹용 레이아웃
- 웹용 내비게이션
- 데스크톱 전용 배치

### 앱 전용 레이어
- 모바일 탭바
- 모바일 헤더
- 바텀시트
- 모바일 우선 리스트/입력 흐름

## 현재 프로젝트 기준 권장 분리 방식

### 유지해야 할 것
- `services/*`
- 서버 API 구조
- 인증 방식
- room/board/task/file/event 데이터 모델

### 분리해야 할 것
- `MainLayout`
- 메인 내비게이션
- 모달/다이얼로그 표현 방식
- 파일 업로드 UX
- 게시글 작성 UX
- 방 상세 탭 표현 방식

## 추천 폴더 방향

현재 바로 대규모 이동은 하지 말고, 아래 방향으로 점진 분리합니다.

### 공용
- `client/src/services/*`
- `client/src/hooks/*`
- `client/src/lib/*`
- `client/src/components/common/*`

### 웹
- `client/src/web/layouts/*`
- `client/src/web/navigation/*`
- `client/src/web/pages/*`

### 앱
- `client/src/mobile/layouts/*`
- `client/src/mobile/navigation/*`
- `client/src/mobile/pages/*`

### 페이지 조합
- 공용 데이터 훅으로 데이터를 가져오고
- 웹/모바일 페이지가 각각 다른 프레젠테이션을 담당

## 화면 구성 원칙

### 웹
- 왼쪽 사이드바 유지 가능
- 정보 밀도 높게
- hover 상호작용 허용

### 앱
- 하단 탭 우선
- 한 화면에 한 목적
- 큰 클릭 영역
- 키보드와 safe area 대응
- sticky CTA 최소화

## 상태 분류 원칙

### 서버 저장
- unread / last seen / last visited
- favorites
- quick links
- 사용자 선호 중 기기 간 유지가 필요한 것
- 정렬 순서처럼 계정 단위 설정인 것

### 로컬 저장
- 튜토리얼 dismiss
- 임시 UI 표시 여부
- 복구 플래그

## 이미 반영한 방향

이번 작업에서 아래 항목은 서버 기준으로 전환했습니다.

- board last seen
- room last visited
- room quick links
- flinders interests
- flinders favorites
- room order

즉 현재 분류한 cross-device 핵심 상태는 서버 기준으로 정리된 상태입니다.

## 앞으로의 권장 순서

1. 공용 데이터 훅 분리
2. 웹 전용 레이아웃과 앱 전용 레이아웃 분리
3. 앱에서는 Capacitor로 먼저 실행
4. 이후 모바일 전용 UI를 점진적으로 교체
5. 서버 상태 기반 알림/푸시까지 확장

## 결론

지향점은 명확합니다.

- 같은 데이터
- 같은 기능
- 다른 UI

웹, Android, iOS를 각각 따로 만드는 것이 아니라,
공용 데이터 계층 위에 웹 UI와 앱 UI를 따로 얹는 구조로 가야
나중에 유지보수가 가장 쉽습니다.
