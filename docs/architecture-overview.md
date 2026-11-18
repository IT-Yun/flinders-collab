# 시스템 아키텍처 개요

> Flinders University Team Collaboration App의 전체 시스템 구조, 데이터 흐름, 보안 체인을 설명하는 문서입니다.

---

## 1. 전체 시스템 아키텍처

아래 다이어그램은 클라이언트, 서버, Supabase, 모바일 간의 연결 관계를 보여줍니다.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        사용자 (브라우저 / 모바일)                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
              ┌────────────────┴────────────────┐
              ▼                                 ▼
┌──────────────────────────┐      ┌──────────────────────────┐
│   Web Client (PWA)       │      │   Mobile (Capacitor)     │
│   React 18 + Vite        │      │   iOS / Android          │
│   TailwindCSS + shadcn   │      │   Capacitor Bridge       │
│   React Router v6        │      │   (동일 React 코드 공유)    │
│   Socket.IO Client       │      │   Socket.IO Client       │
└────────────┬─────────────┘      └────────────┬─────────────┘
             │                                  │
             │  HTTPS (REST API)                │  HTTPS (REST API)
             │  WSS  (Socket.IO)                │  WSS  (Socket.IO)
             │                                  │
             └────────────┬─────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Express.js Server (Node.js)                      │
│                                                                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐              │
│  │  Middleware  │  │  REST Routes │  │  Socket.IO    │              │
│  │  - helmet    │  │  /api/auth   │  │  - chatHandler│              │
│  │  - cors      │  │  /api/rooms  │  │  - location   │              │
│  │  - auth      │  │  /api/events │  │    Handler    │              │
│  │  - compress  │  │  /api/files  │  │               │              │
│  │  - monitor   │  │  /api/board  │  │  JWT 인증      │              │
│  │  - morgan    │  │  /api/tasks  │  │  미들웨어       │              │
│  └─────────────┘  │  /api/admin  │  └───────────────┘              │
│                   │  /api/push   │                                  │
│                   └──────────────┘                                  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  Background Jobs                                         │      │
│  │  - monitor (health check, 메모리, 에러율)                   │      │
│  │  - maintenance (야간 DB 정리)                              │      │
│  │  - eventCrawler (Flinders 이벤트 크롤링, 24시간 주기)        │      │
│  │  - deadlineReminders (마감 알림, 1시간 주기)                 │      │
│  │  - keep-alive ping (Render free tier 슬립 방지, 14분 주기)  │      │
│  └──────────────────────────────────────────────────────────┘      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               │  Supabase JS Client (service_role_key)
                               │  PostgREST API
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Supabase (클라우드)                           │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐      │
│  │  PostgreSQL   │  │  Auth        │  │  Storage              │      │
│  │  - 10+ 테이블  │  │  - JWT 발급  │  │  - room-files 버킷    │      │
│  │  - RLS 정책   │  │  - PKCE 흐름 │  │  - signed URL 생성    │      │
│  │  - FK 관계    │  │  - 비밀번호   │  │  - 파일 업로드/다운로드  │      │
│  │  - 인덱스     │  │    리셋       │  │                      │      │
│  └──────────────┘  └──────────────┘  └──────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘

배포: Render.com (싱가포르 리전, Node.js Web Service)
```

---

## 2. 요청 흐름: 로그인부터 채팅 메시지 전송까지

사용자가 앱을 열고 로그인한 뒤, 채팅 메시지를 보내기까지의 전체 흐름입니다.

### 2-1. 로그인 흐름

```
사용자                    Client                     Server                    Supabase
  │                        │                          │                          │
  │  이메일/비밀번호 입력    │                          │                          │
  │───────────────────────>│                          │                          │
  │                        │  POST /api/auth/login    │                          │
  │                        │─────────────────────────>│                          │
  │                        │                          │  supabase.auth           │
  │                        │                          │  .signInWithPassword()   │
  │                        │                          │─────────────────────────>│
  │                        │                          │                          │
  │                        │                          │  { user, session }       │
  │                        │                          │<─────────────────────────│
  │                        │                          │                          │
  │                        │  { access_token, user }  │                          │
  │                        │<─────────────────────────│                          │
  │                        │                          │                          │
  │                        │  localStorage에 세션 저장  │                          │
  │                        │  (access_token,          │                          │
  │                        │   refresh_token,         │                          │
  │                        │   expires_at)            │                          │
  │                        │                          │                          │
  │  대시보드로 이동         │                          │                          │
  │<───────────────────────│                          │                          │
```

### 2-2. Socket.IO 연결 및 채팅

```
사용자                    Client                     Server                    Supabase
  │                        │                          │                          │
  │                        │  socket.connect()        │                          │
  │                        │  auth: { token }         │                          │
  │                        │─────────────────────────>│                          │
  │                        │                          │  io.use() 미들웨어:      │
  │                        │                          │  supabaseAdmin.auth      │
  │                        │                          │  .getUser(token)         │
  │                        │                          │─────────────────────────>│
  │                        │                          │  { user } 검증 성공       │
  │                        │                          │<─────────────────────────│
  │                        │                          │                          │
  │                        │  연결 수립 (WSS)          │                          │
  │                        │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│                          │
  │                        │                          │                          │
  │  방 입장               │  emit('chat:join',       │                          │
  │─────────────────────>  │   { roomId })            │                          │
  │                        │─────────────────────────>│                          │
  │                        │                          │  room_members 테이블에서  │
  │                        │                          │  멤버십 확인              │
  │                        │                          │─────────────────────────>│
  │                        │                          │  ✓ 멤버 확인             │
  │                        │                          │<─────────────────────────│
  │                        │                          │  socket.join(room:XX)    │
  │                        │                          │                          │
  │  메시지 입력            │  emit('chat:message',    │                          │
  │─────────────────────>  │   { roomId, content })   │                          │
  │                        │─────────────────────────>│                          │
  │                        │                          │  saveMessage() →         │
  │                        │                          │  messages 테이블에 INSERT │
  │                        │                          │─────────────────────────>│
  │                        │                          │                          │
  │                        │                          │  io.to(room:XX)          │
  │                        │  on('chat:message')      │  .emit('chat:message')   │
  │  화면에 메시지 표시      │<─────────────────────────│                          │
  │<───────────────────────│                          │                          │
  │                        │                          │  notifyRoom() →          │
  │                        │                          │  오프라인 멤버에게         │
  │                        │                          │  푸시 알림 전송            │
```

---

## 3. 인증 흐름 (보안 체인)

전체 인증 파이프라인은 다음과 같습니다:

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Supabase │────>│   JWT 토큰   │────>│   Server     │────>│   RLS 정책   │
│   Auth   │     │   (Bearer)   │     │  Middleware   │     │  (PostgRES)  │
└──────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

### 단계별 설명

1. **Supabase Auth (인증 제공자)**
   - 사용자가 이메일/비밀번호로 로그인하면 Supabase Auth가 JWT를 발급합니다.
   - PKCE (Proof Key for Code Exchange) 흐름을 사용하여 비밀번호 리셋을 처리합니다.
   - `access_token`과 `refresh_token`이 클라이언트의 localStorage에 저장됩니다.

2. **JWT 토큰 전달**
   - 모든 API 요청은 `Authorization: Bearer <access_token>` 헤더를 포함합니다.
   - Socket.IO 연결 시 `handshake.auth.token`으로 토큰을 전달합니다.

3. **Server Middleware (서버 인증 미들웨어)**
   - `authenticate` 미들웨어가 모든 보호된 라우트에서 실행됩니다.
   - `supabaseAdmin.auth.getUser(token)`으로 토큰을 검증합니다.
   - 30초 TTL의 인메모리 캐시로 반복 검증을 최적화합니다.
   - `requireRoomMember` 미들웨어가 방 접근 권한을 추가로 확인합니다.
   - `requireRoomAdmin` 미들웨어가 관리자 권한을 요구하는 라우트를 보호합니다.

4. **RLS 정책 (Row Level Security)**
   - 모든 테이블에 RLS가 활성화되어 있습니다.
   - `auth.uid()`를 사용하여 사용자별 데이터 접근을 제어합니다.
   - 예: `messages` 테이블은 같은 방의 멤버만 SELECT 가능합니다.
   - 예: `files` 테이블은 업로더 본인만 DELETE 가능합니다.

### 세션 갱신 흐름

```
Client                          Server                    Supabase
  │                               │                          │
  │  (access_token 만료 감지)      │                          │
  │  POST /api/auth/refresh       │                          │
  │  { refresh_token }            │                          │
  │──────────────────────────────>│                          │
  │                               │  supabase.auth           │
  │                               │  .refreshSession()       │
  │                               │─────────────────────────>│
  │                               │  새 access_token 발급     │
  │                               │<─────────────────────────│
  │  { new_access_token }         │                          │
  │<──────────────────────────────│                          │
  │  localStorage 업데이트         │                          │
```

---

## 4. 실시간 통신 흐름 (Socket.IO)

### 4-1. 연결 수립

```
┌────────────────────────────────────────────────────────────┐
│  Socket.IO 연결 수명주기                                     │
│                                                            │
│  1. useSocket() 훅이 session.access_token 변경 감지          │
│  2. socket.auth = { token } 설정                            │
│  3. socket.connect() 호출                                   │
│  4. 서버 io.use() 미들웨어에서 JWT 검증                       │
│  5. 검증 성공 → connection 이벤트 발생                        │
│  6. chatHandler, locationHandler 등록                        │
│  7. 연결 해제 시 → location_sessions 자동 정리                │
└────────────────────────────────────────────────────────────┘
```

### 4-2. 채팅 이벤트 흐름

| 이벤트 | 방향 | 데이터 | 설명 |
|--------|------|--------|------|
| `chat:join` | Client → Server | `{ roomId }` | 채팅방 입장 (room_members 검증) |
| `chat:leave` | Client → Server | `{ roomId }` | 채팅방 퇴장 |
| `chat:message` | Client → Server | `{ roomId, content, message_type? }` | 메시지 전송 |
| `chat:message` | Server → Room | `{ message object }` | 방 전체에 메시지 브로드캐스트 |
| `chat:typing` | Client → Server | `{ roomId, isTyping }` | 타이핑 표시기 |
| `chat:typing` | Server → Room(-sender) | `{ userId, isTyping }` | 다른 멤버에게 타이핑 알림 |
| `chat:error` | Server → Client | `{ error }` | 에러 메시지 |

### 4-3. 위치 공유 이벤트 흐름

| 이벤트 | 방향 | 데이터 | 설명 |
|--------|------|--------|------|
| `location:join` | Client → Server | `{ eventId }` | 이벤트 위치 채널 입장 |
| `location:leave` | Client → Server | `{ eventId }` | 위치 채널 퇴장 |
| `location:update` | Client → Server | `{ eventId, latitude, longitude, status }` | 위치 업데이트 전송 |
| `location:update` | Server → Channel | `{ userId, latitude, longitude, status, updated_at }` | 위치 브로드캐스트 |
| `location:stop` | Client → Server | `{ eventId }` | 위치 공유 중지 |
| `location:stopped` | Server → Channel | `{ userId }` | 공유 중지 알림 |
| `location:error` | Server → Client | `{ error }` | 에러 메시지 |

---

## 5. 파일 업로드 흐름

```
사용자                    Client                     Server                    Supabase
  │                        │                          │                          │
  │  파일 선택              │                          │                          │
  │───────────────────────>│                          │                          │
  │                        │  POST /api/rooms/:roomId │                          │
  │                        │  /files                  │                          │
  │                        │  (multipart/form-data)   │                          │
  │                        │  Authorization: Bearer   │                          │
  │                        │─────────────────────────>│                          │
  │                        │                          │                          │
  │                        │                          │  1. authenticate()       │
  │                        │                          │     JWT 검증             │
  │                        │                          │                          │
  │                        │                          │  2. requireRoomMember()  │
  │                        │                          │     방 멤버십 확인        │
  │                        │                          │                          │
  │                        │                          │  3. multer (memoryStorage│
  │                        │                          │     파일을 메모리 버퍼로   │
  │                        │                          │     수신 (최대 크기 제한)  │
  │                        │                          │                          │
  │                        │                          │  4. supabaseAdmin        │
  │                        │                          │     .storage             │
  │                        │                          │     .from('room-files')  │
  │                        │                          │     .upload(path, buffer)│
  │                        │                          │─────────────────────────>│
  │                        │                          │                          │
  │                        │                          │     Storage에 파일 저장   │
  │                        │                          │<─────────────────────────│
  │                        │                          │                          │
  │                        │                          │  5. files 테이블에        │
  │                        │                          │     메타데이터 INSERT     │
  │                        │                          │     (file_name, file_url,│
  │                        │                          │      file_type,          │
  │                        │                          │      file_size, room_id) │
  │                        │                          │─────────────────────────>│
  │                        │                          │                          │
  │                        │  { file metadata }       │                          │
  │                        │<─────────────────────────│                          │
  │  업로드 완료            │                          │                          │
  │<───────────────────────│                          │                          │
```

### 파일 다운로드 흐름

```
Client  ──GET /api/files/:fileId/download──>  Server  ──createSignedUrl()──>  Supabase Storage
Client  <──{ signedUrl }──────────────────  Server  <──{ signedUrl }────────  Supabase Storage
Client  ──GET signedUrl (직접 다운로드)──────────────────────────────────────>  Supabase Storage
```

---

## 6. 위치 공유 흐름

위치 공유는 이벤트(일정) 단위로 활성화되며, Geolocation API와 Socket.IO를 결합합니다.

```
┌──────────────────────────────────────────────────────────────────────┐
│  위치 공유 전체 흐름                                                   │
│                                                                      │
│  1. 이벤트 생성 시 enable_location_sharing = true 설정                 │
│                                                                      │
│  2. Client: Geolocation API로 현재 위치 획득                           │
│     navigator.geolocation.watchPosition()                            │
│                                                                      │
│  3. Client → Server: emit('location:join', { eventId })              │
│     → 서버에서 events + room_members 테이블로 접근 권한 확인              │
│     → socket.join('event-location:{eventId}')                        │
│                                                                      │
│  4. Client → Server: emit('location:update', {                       │
│       eventId, latitude, longitude, status                           │
│     })                                                               │
│     → 서버에서 접근 권한 재확인                                          │
│     → io.to('event-location:{eventId}').emit('location:update', ...) │
│                                                                      │
│  5. Server → Supabase: location_sessions 테이블에 UPSERT              │
│     (event_id + user_id UNIQUE 제약으로 중복 방지)                      │
│                                                                      │
│  6. 위치 상태값: sharing → on_the_way → arrived (또는 late)             │
│                                                                      │
│  7. 연결 해제 시: disconnect 이벤트에서                                  │
│     location_sessions.status → 'stopped' 자동 업데이트                 │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 7. 디렉토리 구조

### 7-1. 클라이언트 (`client/src/`)

```
client/src/
├── App.jsx                  # 라우팅 정의, ProtectedRoute, PublicRoute
├── pages/                   # 페이지 컴포넌트 (lazy loading)
│   ├── LoginPage.jsx        # 로그인 (이메일/비밀번호, 게스트 로그인)
│   ├── SignupPage.jsx       # 회원가입 (Flinders 이메일 검증)
│   ├── ResetPasswordPage.jsx# 비밀번호 리셋 (PKCE 흐름)
│   ├── DashboardPage.jsx    # 대시보드 (방 목록, 일정 요약)
│   ├── RoomPage.jsx         # 방 상세 (채팅, 파일, 일정, 위치, 과제)
│   ├── AdminPage.jsx        # 관리자 페이지 (is_admin 필수)
│   ├── DeadlinesPage.jsx    # 마감일 관리
│   ├── BoardPage.jsx        # 자유 게시판 (게시글, 댓글, 참여)
│   ├── FlindersLifePage.jsx # Flinders 생활 정보
│   └── SettingsPage.jsx     # 사용자 설정 (프로필, 테마)
├── components/              # 재사용 UI 컴포넌트
│   ├── auth/                # 인증 관련 컴포넌트
│   ├── chat/                # 채팅 UI (메시지 목록, 입력창)
│   ├── files/               # 파일 관리 UI
│   ├── location/            # 위치 공유 UI (지도, 마커)
│   ├── room/                # 방 관련 UI (멤버 목록, 초대)
│   ├── schedule/            # 일정 관련 UI
│   ├── settings/            # 설정 UI
│   ├── ui/                  # 기본 UI 컴포넌트 (shadcn/ui)
│   ├── ErrorBoundary.jsx    # 에러 바운더리
│   ├── InteractiveTutorial.jsx # 온보딩 튜토리얼
│   └── ProfileDialog.jsx    # 프로필 다이얼로그
├── hooks/                   # React 커스텀 훅
│   ├── useAuth.js           # 인증 상태 관리 (로그인/로그아웃/세션갱신)
│   └── useSocket.js         # Socket.IO 연결 관리
├── lib/                     # 유틸리티 라이브러리
│   ├── api.js               # API 클라이언트 (fetch wrapper)
│   ├── api-headers.js       # 공통 헤더 설정
│   ├── auth-token.js        # 세션 토큰 관리 (localStorage)
│   ├── socket.js            # Socket.IO 클라이언트 인스턴스
│   ├── supabase.js          # Supabase 클라이언트 (anon key)
│   ├── push.js              # 푸시 알림 구독
│   └── native.js            # Capacitor 네이티브 브릿지
├── services/                # API 서비스 레이어
│   ├── auth.js              # 인증 API 호출
│   ├── rooms.js             # 방 CRUD API
│   ├── chat.js              # 채팅 API
│   ├── events.js            # 일정 API
│   ├── files.js             # 파일 업로드/다운로드 API
│   ├── location.js          # 위치 공유 API
│   ├── tasks.js             # 과제 API
│   ├── board.js             # 게시판 API
│   ├── announcements.js     # 공지사항 API
│   ├── flinders.js          # Flinders 정보 API
│   └── reports.js           # 신고 API
├── store/                   # 상태 관리 (Zustand)
│   ├── authStore.js         # 인증 상태 스토어
│   └── roomOrderStore.js    # 방 정렬 순서 스토어
└── layouts/                 # 레이아웃 컴포넌트
    ├── MainLayout.jsx       # 메인 레이아웃 (사이드바/헤더 공유)
    └── AuthLayout.jsx       # 인증 페이지 레이아웃
```

### 7-2. 서버 (`server/src/`)

```
server/src/
├── index.js                 # Express 앱 진입점, 미들웨어 체인, 서버 시작
├── config.js                # 환경 변수 설정
├── routes/                  # Express 라우트 정의
│   ├── auth.js              # POST /api/auth/login, /signup, /logout, /refresh
│   ├── rooms.js             # CRUD /api/rooms, 초대 코드 참가
│   ├── events.js            # CRUD /api/rooms/:roomId/events
│   ├── files.js             # 파일 업로드/다운로드/삭제
│   ├── messages.js          # 메시지 조회 (채팅 히스토리)
│   ├── location.js          # 위치 세션 조회/업데이트
│   ├── tasks.js             # 과제 CRUD
│   ├── board.js             # 게시판 CRUD
│   ├── announcements.js     # 공지사항
│   ├── reports.js           # 신고 기능
│   ├── admin.js             # 관리자 전용 (사용자 관리)
│   ├── push.js              # 푸시 구독 관리
│   └── flinders.js          # Flinders 이벤트/학사 정보
├── controllers/             # 비즈니스 로직
│   ├── authController.js    # 인증 로직 (Supabase Auth 연동)
│   ├── roomController.js    # 방 생성/참가/관리
│   ├── eventController.js   # 일정 관리
│   ├── fileController.js    # 파일 업로드 → Supabase Storage
│   ├── messageController.js # 메시지 저장/조회
│   ├── locationController.js# 위치 세션 관리
│   ├── taskController.js    # 과제 관리
│   ├── boardController.js   # 게시판 관리
│   ├── announcementController.js # 공지사항 관리
│   ├── pushController.js    # 푸시 알림 발송
│   ├── reportController.js  # 신고 처리
│   └── activityController.js# 활동 기록
├── middleware/              # Express 미들웨어
│   ├── auth.js              # JWT 인증, 방 멤버십 확인, 관리자 권한
│   ├── errorHandler.js      # 에러 핸들러 (404, 500)
│   ├── monitorMiddleware.js # 요청 모니터링 (응답시간, 에러율)
│   └── validate.js          # 입력값 검증 (express-validator)
├── sockets/                 # Socket.IO 핸들러
│   ├── index.js             # Socket.IO 초기화, JWT 인증 미들웨어
│   ├── chatHandler.js       # 채팅 이벤트 (join/leave/message/typing)
│   └── locationHandler.js   # 위치 이벤트 (join/leave/update/stop)
├── services/                # 외부 서비스 연동
│   └── supabase.js          # Supabase Admin 클라이언트 (service_role_key)
└── utils/                   # 유틸리티
    ├── monitor.js           # 서버 헬스체크 (메모리, 에러율)
    ├── maintenance.js       # 야간 DB 정리 스케줄러
    ├── eventCrawler.js      # Flinders 이벤트 크롤러
    ├── deadlineReminders.js # 마감 알림 스케줄러
    ├── migrate.js           # DB 마이그레이션 실행
    └── validators.js        # 공통 유효성 검증 규칙
```

### 7-3. 데이터베이스 마이그레이션 (`supabase/migrations/`)

```
supabase/migrations/
├── 001_initial_schema.sql          # 핵심 테이블, RLS, Storage 버킷
├── 002_file_metadata.sql           # files에 file_description 추가
├── 003_fix_rls_policies.sql        # RLS 정책 수정
├── 003_location_file_hardening.sql # 위치/파일 보안 강화
├── 004_tasks.sql                   # tasks 테이블 (과제 관리)
├── 005_event_category.sql          # events에 카테고리 추가
├── 006_admin_and_reports.sql       # 관리자, 신고 기능
├── 007_schema_fixes.sql            # 스키마 패치
├── 008_board_and_comments.sql      # 게시판, 댓글, 참여 테이블
├── 009_user_profile_normalization.sql # 사용자 프로필 정규화
└── 010_push_subscriptions.sql      # 푸시 알림 구독 테이블
```

---

## 8. DB 테이블 관계도

```
┌──────────────────┐
│      users       │
│──────────────────│
│ PK id            │
│    university_   │
│      email       │
│    student_id    │
│    full_name     │
│    avatar_url    │
│    major         │
│    university    │
│    is_admin      │
│    account_type  │
│    year_level    │
│    semester      │
└────────┬─────────┘
         │
         │ 1:N
         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        room_members (연결 테이블)                     │
│──────────────────────────────────────────────────────────────────────│
│ PK id                                                                │
│ FK room_id  ──────────────────────────────────>  rooms.id            │
│ FK user_id  ──────────────────────────────────>  users.id            │
│    role (owner / admin / member)                                     │
│    joined_at                                                         │
│    UNIQUE(room_id, user_id)                                          │
└──────────────────────────────────────────────────────────────────────┘
         │
         │ N:1
         ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│      rooms       │       │     messages     │       │      files       │
│──────────────────│       │──────────────────│       │──────────────────│
│ PK id            │<──┐   │ PK id            │       │ PK id            │
│    name          │   │   │ FK room_id ──────│───>   │ FK room_id ──────│───>
│    course_name   │   │   │ FK user_id ──────│───>   │ FK uploaded_by ──│───>
│ FK owner_id ─────│─> │   │    content       │       │    file_name     │
│    invite_code   │   │   │    message_type  │       │    file_url      │
│    semester      │   │   │    created_at    │       │    file_type     │
│    description   │   │   └──────────────────┘       │    file_size     │
└────────┬─────────┘   │                              │    category      │
         │             │                              │    file_         │
         │             │                              │      description │
         │ 1:N         │                              └──────────────────┘
         ▼             │
┌──────────────────┐   │   ┌──────────────────┐
│     events       │   │   │      tasks       │
│──────────────────│   │   │──────────────────│
│ PK id            │   │   │ PK id            │
│ FK room_id ──────│───┘   │ FK room_id ──────│───>  rooms.id
│ FK created_by ───│───>   │ FK assigned_to ──│───>  users.id
│    title         │       │ FK assigned_by ──│───>  users.id
│    description   │       │    title         │
│    location_name │       │    description   │
│    start_time    │       │    due_date      │
│    end_time      │       │    status        │
│    enable_       │       │    priority      │
│      location_   │       └──────────────────┘
│      sharing     │
└────────┬─────────┘
         │
         │ 1:N
         ▼
┌──────────────────────┐
│  location_sessions   │
│──────────────────────│
│ PK id                │
│ FK event_id ─────────│───>  events.id
│ FK user_id ──────────│───>  users.id
│    latitude          │
│    longitude         │
│    status            │
│    (sharing /        │
│     on_the_way /     │
│     arrived /        │
│     late / stopped)  │
│    updated_at        │
│    UNIQUE(event_id,  │
│           user_id)   │
└──────────────────────┘


┌──────────────────┐       ┌──────────────────────┐       ┌──────────────────┐
│   board_posts    │       │ board_participations  │       │     comments     │
│──────────────────│       │──────────────────────│       │──────────────────│
│ PK id            │<──────│ FK post_id           │       │ PK id            │
│ FK author_id ────│───>   │ FK user_id ──────────│───>   │    target_type   │
│    title         │       │    status            │       │    target_id ────│───> (다형성 FK)
│    content       │       │    (join / pass)     │       │ FK author_id ────│───>
│    category      │       │    UNIQUE(post_id,   │       │    content       │
│    created_at    │       │           user_id)   │       │    created_at    │
│    updated_at    │       └──────────────────────┘       └──────────────────┘
└──────────────────┘

┌────────────────────────┐
│   push_subscriptions   │
│────────────────────────│
│ PK id                  │
│ FK user_id ────────────│───>  users.id
│    endpoint (UNIQUE)   │
│    subscription (JSONB)│
│    created_at          │
└────────────────────────┘
```

### FK 관계 요약

| 테이블 | 외래 키 | 참조 대상 | ON DELETE |
|--------|---------|-----------|-----------|
| `rooms` | `owner_id` | `users.id` | — |
| `room_members` | `room_id` | `rooms.id` | CASCADE |
| `room_members` | `user_id` | `users.id` | CASCADE |
| `events` | `room_id` | `rooms.id` | CASCADE |
| `events` | `created_by` | `users.id` | — |
| `messages` | `room_id` | `rooms.id` | CASCADE |
| `messages` | `user_id` | `users.id` | — |
| `files` | `room_id` | `rooms.id` | CASCADE |
| `files` | `uploaded_by` | `users.id` | — |
| `location_sessions` | `event_id` | `events.id` | CASCADE |
| `location_sessions` | `user_id` | `users.id` | — |
| `tasks` | `room_id` | `rooms.id` | CASCADE |
| `tasks` | `assigned_to` | `auth.users.id` | CASCADE |
| `tasks` | `assigned_by` | `auth.users.id` | CASCADE |
| `board_posts` | `author_id` | `auth.users.id` | CASCADE |
| `board_participations` | `post_id` | `board_posts.id` | CASCADE |
| `board_participations` | `user_id` | `auth.users.id` | CASCADE |
| `comments` | `author_id` | `auth.users.id` | CASCADE |
| `push_subscriptions` | `user_id` | `users.id` | CASCADE |

---

## 9. 배포 구조

```
┌──────────────────────────────────────────────────────────┐
│                    Render.com                             │
│                    (싱가포르 리전)                          │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │  Web Service: flinders-collab                      │  │
│  │  Runtime: Node.js                                  │  │
│  │                                                    │  │
│  │  Build: npm install --include=dev && npm run build │  │
│  │         (Vite가 client/dist/ 생성)                  │  │
│  │                                                    │  │
│  │  Start: npm start                                  │  │
│  │         (Express 서버가 API + 정적 파일 서빙)        │  │
│  │                                                    │  │
│  │  Health: /api/health                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  환경 변수:                                               │
│  - SUPABASE_URL, SUPABASE_ANON_KEY                       │
│  - SUPABASE_SERVICE_ROLE_KEY                              │
│  - JWT_SECRET                                             │
│  - CLIENT_URL                                             │
│  - VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY             │
└──────────────────────────────────────────────────────────┘
         │
         │  프로덕션에서:
         │  - Express가 client/dist/를 정적 파일로 서빙
         │  - /assets/* → 1년 캐시 (immutable)
         │  - 나머지 → 1시간 캐시
         │  - 비-API 경로 → SPA fallback (index.html)
         │  - 14분 간격 self-ping으로 슬립 방지
         ▼
┌──────────────────────────────────────────────────────────┐
│                  Supabase (클라우드)                       │
│  PostgreSQL + Auth + Storage + Realtime                   │
└──────────────────────────────────────────────────────────┘
```

---

> 이 문서는 실제 소스 코드를 기반으로 작성되었습니다. 코드 변경 시 다이어그램도 함께 업데이트해주세요.
