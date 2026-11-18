# 기술 스택 종합 가이드

> Flinders Collab 프로젝트에서 사용하는 모든 프레임워크, 라이브러리, API, 도구를 카테고리별로 상세히 정리한 문서입니다.

---

## 1. 프론트엔드 (Frontend)

### React `^18.3.1`
- **역할**: UI를 컴포넌트 단위로 구성하는 핵심 프론트엔드 라이브러리
- **선택 이유**: 선언적 렌더링, 거대한 생태계, Hooks를 통한 상태 관리가 용이하여 대학 협업 앱에 적합
- **사용 위치**: `client/src/` 전체. 모든 페이지와 UI 컴포넌트가 React 함수 컴포넌트로 작성됨
- **비고**: `react-dom ^18.3.1`과 함께 사용하며, Concurrent 기능을 활용할 수 있는 최신 버전 채택

### Vite `^6.0.3`
- **역할**: 프론트엔드 번들러 및 개발 서버
- **선택 이유**: HMR(Hot Module Replacement)이 극도로 빠르고, ESM 기반으로 개발 시작 시간이 거의 즉시임. CRA(Create React App) 대비 빌드 속도가 월등
- **사용 위치**: `client/vite.config.js`에서 설정. `npm run dev`로 개발 서버 실행, `npm run build`로 프로덕션 빌드
- **주요 설정**: `@vitejs/plugin-react ^4.3.4` 플러그인 사용, `@` 경로 alias 설정, `/api` 및 `/socket.io` 프록시 구성, `manualChunks`로 번들 최적화

### Radix UI (여러 패키지)
- **역할**: 접근성(a11y)을 기본 내장한 헤드리스 UI 컴포넌트 라이브러리
- **선택 이유**: WAI-ARIA 패턴을 자동 준수하므로, 접근성을 별도로 구현할 필요 없이 고품질 인터랙션 제공. 스타일이 없는 헤드리스 방식이라 Tailwind CSS와 자유롭게 조합 가능
- **사용 패키지**:
  - `@radix-ui/react-dialog ^1.1.4` — 모달/다이얼로그
  - `@radix-ui/react-alert-dialog ^1.1.4` — 확인/경고 다이얼로그
  - `@radix-ui/react-dropdown-menu ^2.1.4` — 드롭다운 메뉴
  - `@radix-ui/react-tabs ^1.1.2` — 탭 전환 UI
  - `@radix-ui/react-avatar ^1.1.2` — 사용자 아바타
  - `@radix-ui/react-tooltip ^1.1.6` — 툴팁
  - `@radix-ui/react-slot ^1.1.1` — 컴포넌트 합성 유틸리티
- **사용 위치**: `client/src/components/ui/` 내 공통 UI 컴포넌트에서 사용

### Tailwind CSS `^3.4.16`
- **역할**: 유틸리티 퍼스트(Utility-First) CSS 프레임워크
- **선택 이유**: 클래스명으로 스타일을 직접 적용하여 CSS 파일 관리 부담을 줄이고, 디자인 일관성을 유지. 빌드 시 사용하지 않는 스타일이 자동 제거(purge)됨
- **사용 위치**: 프로젝트 전반의 모든 JSX 컴포넌트에서 `className`으로 사용
- **관련 도구**: `postcss ^8.4.49`, `autoprefixer ^10.4.20`과 함께 PostCSS 파이프라인으로 처리

### Zustand `^5.0.1`
- **역할**: 경량 전역 상태 관리 라이브러리
- **선택 이유**: Redux 대비 보일러플레이트가 극히 적고, Provider 래핑 없이 어디서든 store에 접근 가능. 작은 번들 크기로 모바일 성능에도 유리
- **사용 위치**: `client/src/`의 store 파일들에서 인증 상태, 사용자 정보, 실시간 알림 등 앱 전역 상태 관리
- **비고**: 모바일(`mobile/`) 프로젝트에서도 동일하게 `zustand ^5.0.0` 사용하여 상태 관리 패턴 통일

### React Router DOM `^6.28.0`
- **역할**: 클라이언트 사이드 라우팅 라이브러리
- **선택 이유**: React 공식 생태계에서 가장 널리 사용되는 라우터. 중첩 라우트, 레이아웃 라우트, 보호 라우트(protected routes) 패턴을 간결하게 구현 가능
- **사용 위치**: `client/src/` 내 라우팅 설정 및 페이지 간 네비게이션 전체

### date-fns `^4.1.0`
- **역할**: 날짜/시간 유틸리티 라이브러리
- **선택 이유**: Moment.js와 달리 트리 셰이킹이 가능하여 필요한 함수만 번들에 포함됨. 불변(immutable) 방식으로 날짜를 처리하여 사이드 이펙트 방지
- **사용 위치**: 마감일(Deadlines) 표시, 일정(Schedule) 포맷팅, 채팅 타임스탬프 등 날짜 관련 로직 전반
- **비고**: Vite 설정에서 `vendor-date`로 별도 청크 분리하여 캐싱 효율 극대화

### react-day-picker `^9.4.4`
- **역할**: 달력(Date Picker) UI 컴포넌트
- **선택 이유**: 가볍고 커스터마이징이 용이하며, date-fns와 자연스럽게 통합됨
- **사용 위치**: 일정 선택, 마감일 설정 등 날짜 입력이 필요한 폼에서 사용

### Leaflet `^1.9.4` + react-leaflet `^4.2.1`
- **역할**: 인터랙티브 지도 라이브러리 및 React 바인딩
- **선택 이유**: 오픈소스이며 Google Maps API 대비 무료. 타일 기반 지도 렌더링이 빠르고 플러그인 생태계가 풍부
- **사용 위치**: 캠퍼스 지도, 팀원 위치 표시, 미팅 장소 선택 등 위치 기반 기능

### QRCode.react `^4.2.0`
- **역할**: QR 코드 생성 React 컴포넌트
- **선택 이유**: SVG/Canvas 기반 QR 코드를 React 컴포넌트로 간단히 생성. 외부 API 호출 없이 클라이언트에서 즉시 렌더링
- **사용 위치**: 출석 체크, 팀 초대 링크, 이벤트 참가 등 QR 코드가 필요한 기능

### Lucide React `^0.460.0`
- **역할**: 아이콘 라이브러리
- **선택 이유**: Feather Icons의 fork로, 트리 셰이킹 지원이 뛰어나 사용하는 아이콘만 번들에 포함. 일관된 디자인 언어와 풍부한 아이콘 세트
- **사용 위치**: 내비게이션 바, 버튼, 카드 등 프로젝트 전체의 아이콘 표시

### Socket.IO Client `^4.8.1`
- **역할**: 실시간 양방향 통신을 위한 WebSocket 클라이언트
- **선택 이유**: 자동 재연결, 폴백 전송, 네임스페이스/룸 기능을 내장. 서버의 Socket.IO와 완벽히 호환
- **사용 위치**: 실시간 채팅, 알림, 팀원 온라인 상태 표시 등 실시간 기능
- **비고**: Vite 개발 서버에서 `/socket.io` 경로를 백엔드(`localhost:3001`)로 프록시 설정

### class-variance-authority (CVA) `^0.7.1`
- **역할**: 컴포넌트 variant 스타일 관리 유틸리티
- **선택 이유**: Tailwind CSS와 함께 사용하여 버튼 크기/색상 등 variant를 타입 안전하게 정의. 조건부 클래스 조합을 깔끔하게 처리
- **사용 위치**: `client/src/components/ui/` 내 Button, Badge 등 재사용 가능한 UI 컴포넌트의 variant 정의

### clsx `^2.1.1`
- **역할**: 조건부 CSS 클래스명 결합 유틸리티
- **선택 이유**: 번들 크기가 극히 작으면서도(228B), 조건부 클래스 적용 로직을 간결하게 표현
- **사용 위치**: 거의 모든 컴포넌트에서 동적 className 구성에 사용

### tailwind-merge `^2.6.0`
- **역할**: Tailwind CSS 클래스 충돌 해결 유틸리티
- **선택 이유**: `p-2`와 `p-4`가 동시에 적용될 때 후자만 남기는 등, Tailwind 클래스 간 우선순위를 올바르게 처리. 컴포넌트 재사용 시 스타일 오버라이드에 필수적
- **사용 위치**: CVA, clsx와 함께 `cn()` 헬퍼 함수로 조합하여 프로젝트 전반에서 사용

---

## 2. 백엔드 (Backend)

### Node.js + Express `^4.18.2`
- **역할**: 백엔드 웹 서버 프레임워크
- **선택 이유**: JavaScript 풀스택 개발이 가능하여 프론트엔드 팀과 언어 장벽이 없음. 미들웨어 패턴으로 보안, 로깅, 검증 등을 체계적으로 구성
- **사용 위치**: `server/src/index.js`에서 서버 초기화. `server/src/routes/`에서 API 라우트 정의
- **비고**: RESTful API를 제공하며, Supabase PostgREST와 함께 데이터 접근 계층을 구성

### Socket.IO (Server) `^4.7.2`
- **역할**: 실시간 양방향 통신을 위한 WebSocket 서버
- **선택 이유**: HTTP 서버와 동일 포트에서 운영 가능하며, 네임스페이스/룸 기반의 메시지 브로드캐스팅이 간편
- **사용 위치**: `server/src/` 내 실시간 이벤트 처리. 채팅 메시지 전송, 팀 알림, 온라인 상태 동기화

### Helmet `^7.1.0`
- **역할**: HTTP 보안 헤더 설정 미들웨어
- **선택 이유**: CSP(Content Security Policy), X-Frame-Options, HSTS 등 보안 헤더를 한 줄로 설정. OWASP 권장사항을 기본 적용
- **사용 위치**: `server/src/index.js`에서 Express 미들웨어로 적용

### CORS `^2.8.5`
- **역할**: Cross-Origin Resource Sharing 설정 미들웨어
- **선택 이유**: 프론트엔드(Vite 개발 서버, 배포된 클라이언트)와 백엔드가 다른 오리진에서 실행되므로 교차 출처 요청 허용 필수
- **사용 위치**: `server/src/index.js`에서 `CLIENT_URL` 환경변수 기반으로 허용 오리진 설정

### compression `^1.8.1`
- **역할**: HTTP 응답 gzip/brotli 압축 미들웨어
- **선택 이유**: API 응답 크기를 줄여 네트워크 전송 시간 단축. 모바일 환경에서 특히 효과적
- **사용 위치**: `server/src/index.js`에서 전역 미들웨어로 적용

### Morgan `^1.10.0`
- **역할**: HTTP 요청 로깅 미들웨어
- **선택 이유**: 요청 메서드, URL, 상태 코드, 응답 시간을 자동 기록하여 디버깅과 모니터링에 활용
- **사용 위치**: `server/src/index.js`에서 개발/운영 환경별 로그 포맷 적용

### express-rate-limit `^8.3.1`
- **역할**: API 요청 속도 제한(Rate Limiting) 미들웨어
- **선택 이유**: DDoS 공격 및 브루트포스 시도를 방어. IP 기반으로 일정 시간 내 요청 횟수를 제한
- **사용 위치**: 인증 API, 민감한 엔드포인트에 적용하여 남용 방지

### express-validator `^7.0.1`
- **역할**: 요청 데이터 검증 및 살균(sanitization) 미들웨어
- **선택 이유**: Express 라우트 핸들러에서 체이닝 방식으로 입력 검증 규칙을 선언적으로 정의. SQL Injection, XSS 등을 입력 단계에서 차단
- **사용 위치**: `server/src/routes/` 내 API 라우트의 요청 파라미터 검증

### Multer `^1.4.5-lts.1`
- **역할**: 파일 업로드 처리 미들웨어 (`multipart/form-data`)
- **선택 이유**: Express와 완벽 호환되며, 메모리/디스크 스토리지, 파일 크기 제한, MIME 타입 필터 등을 간편하게 설정
- **사용 위치**: 프로필 이미지, 팀 자료 등 파일 업로드 API에서 사용. Supabase Storage와 연동

### pg (node-postgres) `^8.20.0`
- **역할**: PostgreSQL 네이티브 클라이언트
- **선택 이유**: Supabase의 PostgREST를 거치지 않고 직접 SQL 쿼리가 필요한 경우를 위한 저수준 접근. 트랜잭션, 복잡한 조인 등에 활용
- **사용 위치**: `server/src/` 내 데이터베이스 직접 접근이 필요한 로직

### uuid `^9.0.0`
- **역할**: UUID(Universally Unique Identifier) 생성 라이브러리
- **선택 이유**: 데이터베이스 레코드, 세션, 파일명 등에 충돌 없는 고유 식별자 생성
- **사용 위치**: 서버 내 새 리소스 생성 시 ID 할당

### web-push `^3.6.7`
- **역할**: Web Push 알림 서버 라이브러리
- **선택 이유**: VAPID 프로토콜 기반으로 브라우저 푸시 알림을 서버에서 전송. 서비스 워커와 연동하여 앱이 닫혀 있어도 알림 전달
- **사용 위치**: 마감일 알림, 새 채팅 메시지, 팀 초대 등 푸시 알림 전송

### dotenv `^16.3.1`
- **역할**: `.env` 파일의 환경변수를 `process.env`로 로드하는 유틸리티
- **선택 이유**: 데이터베이스 URL, API 키 등 민감한 설정값을 코드와 분리하여 관리. 12-Factor App 원칙 준수
- **사용 위치**: `server/src/index.js`에서 서버 시작 시 `.env` 파일 로드

---

## 3. 데이터베이스 / 인증 / 스토리지 (Supabase)

### Supabase `^2.47.0` (client) / `^2.39.0` (server)
- **역할**: PostgreSQL 기반 BaaS(Backend as a Service). 데이터베이스, 인증, 스토리지, 실시간 구독을 하나의 플랫폼에서 제공
- **선택 이유**: Firebase의 오픈소스 대안으로, PostgreSQL의 강력한 관계형 쿼리와 RLS(Row Level Security)를 활용 가능. 무료 티어가 대학 프로젝트에 충분

#### PostgreSQL (Supabase 호스팅)
- **역할**: 프로젝트의 주 데이터베이스
- **사용 위치**: 사용자 프로필, 팀, 일정, 마감일, 채팅 메시지 등 모든 영구 데이터 저장
- **주요 기능**: RLS 정책으로 행 단위 접근 제어, Foreign Key 관계로 데이터 무결성 보장

#### Supabase Auth (PKCE Flow)
- **역할**: 사용자 인증 및 세션 관리
- **사용 위치**: 로그인, 회원가입, 비밀번호 재설정, 세션 토큰 관리
- **주요 기능**: PKCE(Proof Key for Code Exchange) 흐름 적용으로 code_verifier 기반의 안전한 인증. 이메일/비밀번호 인증 지원
- **비고**: `SUPABASE_SERVICE_ROLE_KEY`는 서버 측에서만 사용하여 RLS를 우회하는 관리 작업 수행

#### Supabase Storage
- **역할**: 파일(이미지, 문서 등) 저장소
- **사용 위치**: 프로필 사진, 팀 공유 파일 등 바이너리 데이터 저장 및 제공
- **주요 기능**: 버킷 기반 관리, RLS 정책으로 접근 제어, 공개/비공개 URL 생성

#### Row Level Security (RLS)
- **역할**: PostgreSQL 행 단위 접근 제어 정책
- **선택 이유**: 클라이언트에서 직접 DB에 쿼리하더라도 인증된 사용자의 데이터만 접근 가능하도록 보장. API 서버 없이도 보안 유지 가능
- **사용 위치**: Supabase 대시보드에서 테이블별 정책 설정. 팀 멤버만 팀 데이터 조회, 본인 프로필만 수정 등

---

## 4. 모바일 (Mobile)

### Capacitor `^8.2.0` (iOS/Android)
- **역할**: 웹 앱을 네이티브 iOS/Android 앱으로 패키징하는 크로스 플랫폼 브릿지
- **선택 이유**: 기존 React 웹 코드를 거의 수정 없이 네이티브 앱으로 변환. Cordova의 후속으로 최신 네이티브 API를 안정적으로 지원
- **사용 위치**: `client/capacitor.config.json`에서 설정. `client/package.json`의 `ios:sync`, `android:sync` 스크립트로 빌드
- **앱 설정**: App ID `au.edu.flinders.collab`, 웹 디렉토리 `dist`, Android HTTPS 스킴 적용
- **사용 플러그인**:
  - `@capacitor/app ^8.0.0` — 앱 생명주기 관리 (백그라운드/포그라운드 전환)
  - `@capacitor/clipboard ^8.0.1` — 클립보드 읽기/쓰기
  - `@capacitor/geolocation ^8.1.0` — GPS 위치 정보 접근
  - `@capacitor/haptics ^8.0.0` — 햅틱(진동) 피드백
  - `@capacitor/ios ^8.2.0` / `@capacitor/android ^8.2.0` — 플랫폼 런타임
  - `@capacitor/keyboard ^8.0.0` — 소프트 키보드 제어 (resize: body 설정)
  - `@capacitor/splash-screen ^8.0.0` — 스플래시 화면 (2초 표시, 브랜드 컬러 #3366CC)
  - `@capacitor/status-bar ^8.0.0` — 상태 바 스타일 및 색상 제어

### React Native (Expo) `~55.0.0`
- **역할**: 네이티브 모바일 앱 프레임워크 (별도 모바일 전용 앱)
- **선택 이유**: Capacitor 웹뷰 방식과 별도로, 네이티브 성능이 필요한 기능을 위한 전용 모바일 앱. Expo로 빌드/배포 파이프라인 단순화
- **사용 위치**: `mobile/` 디렉토리 전체. `mobile/package.json`에서 의존성 관리
- **주요 의존성**:
  - `react-native 0.79.2` — React Native 코어
  - `expo ~55.0.0` — Expo SDK (빌드, OTA 업데이트, 네이티브 모듈 관리)
  - `expo-status-bar ~2.2.0` — 상태 바 제어
  - `@react-navigation/native ^7.0.0` — React Navigation 코어
  - `@react-navigation/native-stack ^7.0.0` — 스택 네비게이션
  - `@react-navigation/bottom-tabs ^7.0.0` — 하단 탭 네비게이션
  - `react-native-screens ^4.0.0` — 네이티브 화면 최적화
  - `react-native-safe-area-context ^5.0.0` — 노치/홈 인디케이터 안전 영역 처리
  - `@supabase/supabase-js ^2.45.0` — Supabase 클라이언트 (웹과 동일 백엔드 연동)
  - `zustand ^5.0.0` — 전역 상태 관리 (웹과 동일 패턴)
  - `@react-native-async-storage/async-storage ^2.0.0` — 로컬 영구 저장소 (토큰, 설정 등)

---

## 5. 배포 (Deployment)

### Render (`render.yaml`)
- **역할**: 클라우드 호스팅 플랫폼으로, 서버 배포 및 운영을 담당
- **선택 이유**: Git push만으로 자동 배포가 가능하며, 무료/저가 플랜이 대학 프로젝트에 적합. `render.yaml`로 IaC(Infrastructure as Code) 설정
- **사용 위치**: 프로젝트 루트의 `render.yaml`
- **주요 설정**:
  - **서비스 타입**: `web` (Node.js 런타임)
  - **리전**: `singapore` (아시아-태평양 지역 최적화)
  - **빌드 명령**: `npm install --include=dev && npm run build` — 의존성 설치 후 Vite 프로덕션 빌드
  - **시작 명령**: `npm start` — Express 서버 실행
  - **헬스 체크**: `/api/health` 엔드포인트로 서버 상태 모니터링
  - **환경변수**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `CLIENT_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — 모두 Render 대시보드에서 안전하게 관리

### Vite 프로덕션 빌드
- **역할**: 프론트엔드 에셋을 최적화된 정적 파일로 번들링
- **주요 최적화**:
  - **Manual Chunks**: Supabase(`vendor-supabase`), Socket.IO(`vendor-socket`), date-fns(`vendor-date`), Radix UI(`vendor-radix`)를 별도 청크로 분리하여 브라우저 캐시 효율 극대화
  - **Tree Shaking**: 사용하지 않는 코드 자동 제거
  - **코드 분할**: 라우트 단위 동적 import로 초기 로드 최소화
- **출력 디렉토리**: `client/dist/` — Capacitor 및 Render 배포 시 이 디렉토리를 서빙

---

## 6. 개발 도구 (Development Tools)

### nodemon `^3.0.2`
- **역할**: Node.js 개발 서버 자동 재시작 도구
- **선택 이유**: 서버 코드 변경 시 수동으로 재시작할 필요 없이 파일 변경을 감지하여 자동 재실행
- **사용 위치**: `server/package.json`의 `dev` 스크립트: `nodemon src/index.js`
- **비고**: devDependencies로 설치되어 운영 환경에서는 포함되지 않음

### Vite 개발 서버
- **역할**: 프론트엔드 개발 시 HMR 기반 빠른 피드백 제공
- **주요 기능**:
  - ESM 기반 즉시 서버 시작 (번들링 없이 모듈 직접 서빙)
  - 파일 수정 시 밀리초 단위 HMR (페이지 새로고침 불필요)
  - React Fast Refresh로 컴포넌트 상태 유지하며 실시간 반영
- **사용 위치**: `client/package.json`의 `dev` 스크립트: `vite`

### 프록시 설정 (Vite → Express)
- **역할**: 개발 환경에서 프론트엔드 개발 서버가 백엔드 API 요청을 프록시
- **설정**:
  - `/api` → `http://localhost:3001` (REST API 프록시)
  - `/socket.io` → `http://localhost:3001` (WebSocket 프록시, `ws: true` 설정)
- **선택 이유**: CORS 문제 없이 프론트엔드와 백엔드를 동시에 개발. 프로덕션 환경과 동일한 URL 경로 사용 가능

### Capacitor CLI `^8.2.0`
- **역할**: Capacitor 프로젝트 관리 CLI 도구
- **주요 명령**: `cap sync` (웹 빌드 → 네이티브 프로젝트 동기화), `cap open` (Xcode/Android Studio 실행)
- **사용 위치**: `client/package.json`의 `ios:sync`, `android:sync`, `mobile:build` 등 스크립트

### Babel `^7.25.0`
- **역할**: JavaScript/JSX 트랜스파일러 (React Native/Expo 전용)
- **사용 위치**: `mobile/babel.config.js`에서 Expo 프리셋 설정. React Native 코드를 네이티브 번들로 변환
- **비고**: 웹 프론트엔드는 Vite의 내장 esbuild를 사용하므로 Babel 불필요

---

## 7. 환경변수 설정 (`.env.example`)

| 변수명 | 설명 | 사용 위치 |
|--------|------|-----------|
| `PORT` | 서버 포트 (기본값: `3001`) | Express 서버 |
| `NODE_ENV` | 실행 환경 (`development` / `production`) | 서버 전역 |
| `SUPABASE_URL` | Supabase 프로젝트 URL | 서버, 클라이언트 |
| `SUPABASE_ANON_KEY` | Supabase 익명(공개) API 키 | 클라이언트 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 서비스 롤 키 (RLS 우회) | 서버만 |
| `JWT_SECRET` | JWT 토큰 서명 비밀 키 | 서버 인증 |
| `CLIENT_URL` | 클라이언트 오리진 URL (CORS 허용) | 서버 CORS 설정 |
| `VITE_SUPABASE_URL` | 클라이언트용 Supabase URL (`VITE_` 접두사) | Vite 환경변수 |
| `VITE_SUPABASE_ANON_KEY` | 클라이언트용 Supabase 공개 키 | Vite 환경변수 |

> **보안 참고**: `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하는 관리 키이므로 절대 클라이언트에 노출해서는 안 됨. `VITE_` 접두사가 붙은 변수만 클라이언트 번들에 포함됨.

---

## 8. 기술 스택 요약 다이어그램

```
┌─────────────────────────────────────────────────────────┐
│                      클라이언트                           │
│  React 18 + Vite 6 + Tailwind CSS + Radix UI            │
│  Zustand (상태) + React Router (라우팅)                   │
│  Socket.IO Client (실시간) + Leaflet (지도)               │
│  QRCode.react + Lucide Icons + date-fns                  │
├─────────────────────────────────────────────────────────┤
│                     네이티브 앱                           │
│  Capacitor 8 (iOS/Android 웹뷰 래핑)                     │
│  React Native + Expo 55 (별도 네이티브 앱)                │
├─────────────────────────────────────────────────────────┤
│                      백엔드 서버                          │
│  Express 4 + Node.js                                     │
│  Socket.IO (실시간) + Helmet (보안) + CORS                │
│  Morgan (로깅) + compression + rate-limit                 │
│  express-validator (검증) + Multer (파일 업로드)           │
│  web-push (푸시 알림) + pg (PostgreSQL 직접 접근)          │
├─────────────────────────────────────────────────────────┤
│                   Supabase (BaaS)                        │
│  PostgreSQL + RLS 정책                                   │
│  Auth (PKCE) + Storage + PostgREST                       │
├─────────────────────────────────────────────────────────┤
│                      배포 인프라                          │
│  Render (Singapore) + Vite Build (Manual Chunks)         │
└─────────────────────────────────────────────────────────┘
```

---

> **문서 최종 업데이트**: 2026-03-24 | **작성 기준**: `client/package.json`, `server/package.json`, `mobile/package.json`, `render.yaml`, `vite.config.js`, `.env.example`
