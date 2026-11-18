# 학습 로드맵 — Flinders 팀 협업 앱

> 이 문서는 프로젝트를 이해하고 확장하기 위해 반드시 알아야 할 핵심 지식과 학습 순서를 정리합니다.
> 각 주제는 **레벨 1 (필수)**, **레벨 2 (중요)**, **레벨 3 (심화)** 로 구분됩니다.

---

## 목차

1. [보안 필수 지식](#1-보안-필수-지식)
2. [데이터베이스 필수 지식](#2-데이터베이스-필수-지식)
3. [실시간 시스템](#3-실시간-시스템)
4. [프론트엔드 필수 지식](#4-프론트엔드-필수-지식)
5. [모바일 개발](#5-모바일-개발)
6. [배포 / DevOps](#6-배포--devops)
7. [API 설계](#7-api-설계)

---

## 1. 보안 필수 지식

이 프로젝트는 대학교 학생 데이터를 다루기 때문에 보안이 최우선입니다.
서버 코드(`server/src/middleware/auth.js`)와 DB 스키마(`supabase/migrations/001_initial_schema.sql`)를 함께 읽으면서 학습하세요.

### 1.1 JWT 인증 — 레벨 1 (필수)

**왜 알아야 하는지:**
이 앱의 모든 API 요청은 `Authorization: Bearer <token>` 헤더로 보호됩니다. `server/src/middleware/auth.js`의 `authenticate` 미들웨어가 Supabase에서 발급한 JWT를 검증하고, 검증 결과를 인메모리 캐시(30초 TTL)에 저장하여 반복 검증을 피합니다.

**핵심 개념:**
- JWT (JSON Web Token)의 구조: Header.Payload.Signature
- Bearer 토큰 방식의 인증 흐름
- 토큰 만료(expiry)와 갱신(refresh) 전략
- 토큰 캐싱으로 성능 최적화 (이 프로젝트에서는 `Map` + TTL 패턴 사용)

**프로젝트 적용 사례:**
- `auth.js` — `authenticate()`: 모든 보호 라우트에 적용
- `auth.js` — `requireRoomMember()`: 방(room) 소속 여부를 추가 검증 (45초 캐시)
- `auth.js` — `requireRoomAdmin()`: 관리자/소유자 권한 검증

**추천 학습 리소스:**
- [JWT.io](https://jwt.io/) — JWT 디버거 및 개념 설명
- [Supabase Auth 공식 문서](https://supabase.com/docs/guides/auth)
- MDN: HTTP 인증 — Bearer 토큰

---

### 1.2 PKCE Flow — 레벨 2 (중요)

**왜 알아야 하는지:**
이 앱은 브라우저 기반 SPA이므로 OAuth 인증 시 클라이언트 시크릿을 안전하게 보관할 수 없습니다. PKCE (Proof Key for Code Exchange) 흐름을 사용하여 Authorization Code 탈취 공격을 방지합니다. 비밀번호 재설정 기능에서도 PKCE가 활용됩니다.

**핵심 개념:**
- Authorization Code Flow vs Implicit Flow
- `code_verifier`와 `code_challenge` 생성 원리 (SHA-256)
- SPA에서 PKCE가 필수인 이유
- Supabase의 `flowType: 'pkce'` 설정

**프로젝트 적용 사례:**
- 비밀번호 재설정 흐름 (최근 커밋 `674555b` 참고)
- Supabase 클라이언트 초기화 시 PKCE 설정

**추천 학습 리소스:**
- [OAuth 2.0 for Browser-Based Apps (RFC 8252)](https://datatracker.ietf.org/doc/html/rfc8252)
- [Supabase PKCE Flow 문서](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

---

### 1.3 RLS (Row Level Security) — 레벨 1 (필수)

**왜 알아야 하는지:**
Supabase는 PostgreSQL 위에서 동작하며, RLS는 데이터베이스 레벨에서 "누가 어떤 행(row)에 접근할 수 있는지"를 제어합니다. `001_initial_schema.sql`에 정의된 정책이 모든 테이블의 접근을 통제하며, 이를 잘못 설정하면 데이터 유출이 발생합니다.

**핵심 개념:**
- `ENABLE ROW LEVEL SECURITY` 적용 방법
- `CREATE POLICY` 문법: `FOR SELECT/INSERT/UPDATE/DELETE`
- `USING` (읽기 조건) vs `WITH CHECK` (쓰기 조건)
- `auth.uid()` — Supabase가 JWT에서 추출한 사용자 ID
- 서브쿼리를 활용한 복잡한 접근 제어 (예: 같은 방 멤버만 조회 가능)

**프로젝트 적용 사례:**
- `users` 테이블: 자기 프로필만 수정 가능, 같은 방 멤버만 조회 가능
- `rooms` 테이블: 소유자만 수정/삭제 가능, 멤버만 조회 가능
- `messages` 테이블: 자신의 메시지만 삽입 가능, 방 멤버만 조회 가능
- `location_sessions` 테이블: 이벤트 → 방 → 멤버 관계를 따라가는 중첩 정책

**추천 학습 리소스:**
- [Supabase RLS 가이드](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL RLS 공식 문서](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

### 1.4 Helmet CSP — 레벨 2 (중요)

**왜 알아야 하는지:**
`server/src/index.js`에서 Helmet 미들웨어가 CSP(Content Security Policy) 헤더를 설정합니다. 이 설정이 없으면 XSS(Cross-Site Scripting) 공격에 취약해집니다.

**핵심 개념:**
- CSP 디렉티브: `connect-src`, `img-src`, `script-src`, `default-src`
- Helmet의 `contentSecurityPolicy` 옵션 구조
- 외부 서비스(Supabase) 도메인을 허용 목록에 추가하는 방법

**프로젝트 적용 사례:**
```js
// server/src/index.js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'connect-src': ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co'],
      'img-src': ["'self'", 'data:', 'blob:', 'https://*.supabase.co'],
    },
  },
}));
```

**추천 학습 리소스:**
- [Helmet.js 공식 문서](https://helmetjs.github.io/)
- MDN: Content Security Policy (CSP)

---

### 1.5 CORS — 레벨 2 (중요)

**왜 알아야 하는지:**
클라이언트(Vite dev server 또는 프로덕션 URL)와 API 서버가 다른 도메인에서 실행되므로 CORS 설정이 필수입니다.

**핵심 개념:**
- Same-Origin Policy와 Cross-Origin Resource Sharing 차이
- `Access-Control-Allow-Origin`, `Access-Control-Allow-Credentials` 헤더
- Preflight 요청 (OPTIONS)
- `credentials: true` 옵션의 의미

**프로젝트 적용 사례:**
```js
// server/src/index.js
app.use(cors({
  origin: config.clientUrl, // 환경변수로 관리
  credentials: true,
}));
```

**추천 학습 리소스:**
- MDN: Cross-Origin Resource Sharing (CORS)
- Express cors 패키지 문서

---

### 1.6 Rate Limiting — 레벨 2 (중요)

**왜 알아야 하는지:**
API 남용과 브루트포스 공격을 방지하기 위해 요청 속도를 제한합니다. Render에서 배포할 때 `trust proxy` 설정이 필요한 이유도 이와 연관됩니다.

**핵심 개념:**
- 슬라이딩 윈도우 vs 고정 윈도우 알고리즘
- IP 기반 제한 vs 사용자 기반 제한
- `trust proxy` 설정 (리버스 프록시 뒤에서 실제 클라이언트 IP 확인)
- 429 Too Many Requests 응답 처리

**프로젝트 적용 사례:**
- `app.set('trust proxy', 1)` — Render 리버스 프록시 환경에서 실제 IP 획득

**추천 학습 리소스:**
- [express-rate-limit 공식 문서](https://github.com/express-rate-limit/express-rate-limit)
- OWASP: Rate Limiting

---

### 1.7 Input Validation (express-validator) — 레벨 1 (필수)

**왜 알아야 하는지:**
모든 사용자 입력은 신뢰할 수 없습니다. `server/src/middleware/validate.js`가 express-validator의 검증 결과를 확인하고, `server/src/utils/validators.js`에서 각 라우트별 검증 규칙을 정의합니다.

**핵심 개념:**
- 체이닝 API: `body('field').isString().trim().notEmpty()`
- `validationResult(req)` — 검증 결과 확인
- 미들웨어 순서: 검증 규칙 → `validate` 미들웨어 → 컨트롤러
- Sanitization (입력 정화): `trim()`, `escape()`, `normalizeEmail()`

**프로젝트 적용 사례:**
```js
// server/src/middleware/validate.js
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}
```

**추천 학습 리소스:**
- [express-validator 공식 문서](https://express-validator.github.io/)
- OWASP: Input Validation Cheat Sheet

---

### 1.8 파일 업로드 보안 (Multer) — 레벨 2 (중요)

**왜 알아야 하는지:**
파일 업로드는 서버 자원 고갈, 악성 파일 실행 등 다양한 보안 위험이 있습니다. `server/src/controllers/fileController.js`에서 Multer를 사용하여 파일 업로드를 처리합니다.

**핵심 개념:**
- Multer의 `memoryStorage` vs `diskStorage`
- 파일 크기 제한 (`limits.fileSize`)
- MIME 타입 검증과 확장자 화이트리스트
- Supabase Storage에 안전하게 업로드하는 패턴

**프로젝트 적용 사례:**
- `fileController.js` — 업로드된 파일을 Supabase Storage `room-files` 버킷에 저장
- `001_initial_schema.sql` — Storage bucket RLS 정책으로 다운로드/삭제 권한 제어

**추천 학습 리소스:**
- [Multer 공식 문서](https://github.com/expressjs/multer)
- [Supabase Storage 가이드](https://supabase.com/docs/guides/storage)
- OWASP: File Upload Cheat Sheet

---

## 2. 데이터베이스 필수 지식

이 프로젝트의 데이터 레이어를 이해하려면 Supabase가 PostgreSQL 위에서 어떻게 동작하는지 알아야 합니다.
`supabase/migrations/` 디렉토리의 SQL 파일들을 순서대로 읽으면서 학습하세요.

### 2.1 PostgreSQL 기본 — 레벨 1 (필수)

**왜 알아야 하는지:**
Supabase의 핵심은 PostgreSQL입니다. 테이블 설계, 데이터 타입, 제약 조건을 이해해야 스키마를 수정하거나 쿼리를 최적화할 수 있습니다.

**핵심 개념:**
- 데이터 타입: `UUID`, `TEXT`, `TIMESTAMPTZ`, `BOOLEAN`, `INTEGER`, `DOUBLE PRECISION`
- 제약 조건: `PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `CHECK`, `REFERENCES`
- `DEFAULT` 값: `uuid_generate_v4()`, `now()`
- Extension: `uuid-ossp`

**프로젝트 적용 사례:**
```sql
-- 이메일 도메인 검증을 CHECK 제약으로 구현
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    university_email TEXT UNIQUE NOT NULL
        CHECK (university_email LIKE '%@flinders.edu.au'),
    -- ...
);
```

**추천 학습 리소스:**
- [PostgreSQL 공식 튜토리얼](https://www.postgresql.org/docs/current/tutorial.html)
- [Supabase Database 가이드](https://supabase.com/docs/guides/database)

---

### 2.2 Supabase 대시보드 사용법 — 레벨 1 (필수)

**왜 알아야 하는지:**
Supabase 대시보드에서 테이블 조회, SQL 실행, 인증 설정, 스토리지 관리를 모두 수행할 수 있습니다. 개발 및 디버깅에 필수 도구입니다.

**핵심 개념:**
- Table Editor: 데이터 CRUD 및 스키마 확인
- SQL Editor: 마이그레이션 직접 실행 및 디버깅
- Authentication 탭: 사용자 관리, 이메일 템플릿 설정
- Storage 탭: 버킷 관리, 파일 확인
- API 탭: PostgREST 엔드포인트 확인, API 키 관리

**추천 학습 리소스:**
- [Supabase Dashboard 가이드](https://supabase.com/docs/guides/platform)

---

### 2.3 마이그레이션 관리 — 레벨 1 (필수)

**왜 알아야 하는지:**
이 프로젝트는 `supabase/migrations/` 디렉토리에 번호가 매겨진 SQL 파일로 스키마를 관리합니다 (001~010). 새 기능을 추가할 때 마이그레이션 파일을 만들어야 합니다.

**핵심 개념:**
- 순차적 마이그레이션: 번호 순서대로 실행
- 멱등성(Idempotency): `IF NOT EXISTS`, `IF EXISTS` 사용
- 롤백 전략: `ALTER TABLE DROP COLUMN`, `DROP TABLE IF EXISTS`
- Supabase CLI를 활용한 마이그레이션 관리

**프로젝트 적용 사례:**
```
001_initial_schema.sql        — 핵심 테이블 (users, rooms, messages, events 등)
002_file_metadata.sql         — 파일 메타데이터 추가
003_fix_rls_policies.sql      — RLS 정책 수정
004_tasks.sql                 — 태스크 기능 추가
005_event_category.sql        — 이벤트 카테고리
006_admin_and_reports.sql     — 관리자 및 리포트 기능
007_schema_fixes.sql          — 스키마 수정 사항
008_board_and_comments.sql    — 게시판 및 댓글
009_user_profile_normalization.sql — 사용자 프로필 정규화
010_push_subscriptions.sql    — 푸시 알림 구독
```

**추천 학습 리소스:**
- [Supabase Migrations 가이드](https://supabase.com/docs/guides/cli/managing-environments)

---

### 2.4 FK / CASCADE 관계 — 레벨 1 (필수)

**왜 알아야 하는지:**
Foreign Key와 CASCADE 규칙이 데이터 무결성을 보장합니다. 이 프로젝트에서는 방(room)이 삭제되면 관련 멤버, 이벤트, 메시지, 파일이 모두 자동 삭제됩니다.

**핵심 개념:**
- `REFERENCES table(column)` — FK 관계 설정
- `ON DELETE CASCADE` — 부모 삭제 시 자식 자동 삭제
- `ON DELETE SET NULL` — 부모 삭제 시 FK를 NULL로 설정
- PostgREST에서 FK 관계를 활용한 JOIN 쿼리

**프로젝트 적용 사례:**
```sql
-- 방 삭제 시 멤버, 이벤트, 메시지, 파일 모두 자동 삭제
room_id UUID REFERENCES rooms(id) ON DELETE CASCADE
-- 사용자 삭제 시 멤버십도 자동 삭제
user_id UUID REFERENCES users(id) ON DELETE CASCADE
```

> ⚠️ **주의사항:** PostgREST를 통해 FK 관계가 올바르게 작동하는지 반드시 검증하세요.

**추천 학습 리소스:**
- PostgreSQL: Foreign Keys
- [Supabase Joins & Relations](https://supabase.com/docs/guides/database/joins-and-nesting)

---

### 2.5 인덱스 설계 — 레벨 2 (중요)

**왜 알아야 하는지:**
인덱스는 쿼리 성능의 핵심입니다. 이 프로젝트의 `001_initial_schema.sql`에서 자주 조회되는 컬럼에 인덱스가 설정되어 있습니다.

**핵심 개념:**
- B-tree 인덱스 (PostgreSQL 기본)
- 복합 인덱스 (composite index): 여러 컬럼 조합
- 인덱스 순서와 `DESC` 키워드
- `EXPLAIN ANALYZE`로 쿼리 플랜 확인

**프로젝트 적용 사례:**
```sql
-- 메시지 조회 최적화: 방 ID + 최신순 정렬
CREATE INDEX idx_messages_room_created ON messages(room_id, created_at DESC);
-- 파일 조회 최적화
CREATE INDEX idx_files_room_created ON files(room_id, created_at DESC);
-- 이벤트 조회 최적화: 방 ID + 시작 시간
CREATE INDEX idx_events_room_start ON events(room_id, start_time);
```

**추천 학습 리소스:**
- [Use The Index, Luke!](https://use-the-index-luke.com/) — 인덱스 설계 전문 가이드
- PostgreSQL: Indexes

---

### 2.6 RLS 정책 작성법 — 레벨 2 (중요)

**왜 알아야 하는지:**
새 테이블을 추가하거나 기존 접근 제어를 수정할 때 RLS 정책을 올바르게 작성해야 합니다. 정책이 누락되면 데이터에 접근이 불가능하고, 과도하게 열리면 보안 위험이 됩니다.

**핵심 개념:**
- `FOR SELECT/INSERT/UPDATE/DELETE` 별도 정책 필요
- `USING` 절: 기존 행에 대한 조건 (SELECT, UPDATE, DELETE)
- `WITH CHECK` 절: 새 행에 대한 조건 (INSERT, UPDATE)
- 서브쿼리로 "같은 방 멤버"를 확인하는 패턴
- JOIN을 활용한 다단계 관계 확인 (이벤트 → 방 → 멤버)

**프로젝트 적용 사례:**
```sql
-- 위치 세션: 이벤트 → 방 → 멤버 관계를 따라가는 정책
CREATE POLICY "location_sessions_select_event_members" ON location_sessions
    FOR SELECT USING (
        event_id IN (
            SELECT e.id FROM events e
            JOIN room_members rm ON rm.room_id = e.room_id
            WHERE rm.user_id = auth.uid()
        )
    );
```

**추천 학습 리소스:**
- [Supabase RLS 가이드](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL: CREATE POLICY](https://www.postgresql.org/docs/current/sql-createpolicy.html)

---

## 3. 실시간 시스템

이 프로젝트의 채팅과 위치 공유는 WebSocket을 통한 실시간 통신으로 구현됩니다.
`server/src/sockets/` 디렉토리의 파일들을 읽으면서 학습하세요.

### 3.1 WebSocket 개념 — 레벨 1 (필수)

**왜 알아야 하는지:**
HTTP는 요청-응답 모델이라 실시간 통신에 부적합합니다. WebSocket은 양방향 전이중(full-duplex) 연결을 제공하여 채팅, 위치 공유 같은 실시간 기능을 가능하게 합니다.

**핵심 개념:**
- HTTP vs WebSocket 프로토콜 차이
- WebSocket 핸드셰이크 과정 (HTTP Upgrade)
- 연결 상태: CONNECTING → OPEN → CLOSING → CLOSED
- 이벤트 기반 통신: `emit`, `on`

**추천 학습 리소스:**
- MDN: WebSocket API
- [WebSocket 프로토콜 (RFC 6455)](https://datatracker.ietf.org/doc/html/rfc6455)

---

### 3.2 Socket.IO Rooms & Events — 레벨 1 (필수)

**왜 알아야 하는지:**
이 프로젝트는 Socket.IO를 사용하여 방(room) 기반 실시간 통신을 구현합니다. `server/src/sockets/chatHandler.js`와 `locationHandler.js`가 핵심 구현입니다.

**핵심 개념:**
- `socket.join(room)` / `socket.leave(room)` — 방 참여/퇴장
- `io.to(room).emit(event, data)` — 방 전체에 브로드캐스트
- `socket.to(room).emit(event, data)` — 발신자 제외 브로드캐스트
- `socket.emit(event, data)` — 특정 소켓에만 전송
- 네임스페이스와 이벤트 네이밍 컨벤션 (`chat:join`, `chat:message`, `location:update`)

**프로젝트 적용 사례:**
```js
// chatHandler.js — 방 참여 및 메시지 전송
socket.on('chat:join', async ({ roomId }) => {
  socket.join(`room:${roomId}`);
});

socket.on('chat:message', async ({ roomId, content }) => {
  const message = await saveMessage({ room_id: roomId, user_id: userId, content });
  io.to(`room:${roomId}`).emit('chat:message', message);
});
```

**추천 학습 리소스:**
- [Socket.IO 공식 문서](https://socket.io/docs/v4/)
- [Socket.IO Rooms](https://socket.io/docs/v4/rooms/)

---

### 3.3 위치 공유 구현 패턴 — 레벨 2 (중요)

**왜 알아야 하는지:**
위치 공유는 이벤트 기반으로 동작하며, 접근 제어가 복잡합니다 (이벤트 → 방 → 멤버 관계, + `enable_location_sharing` 플래그 확인).

**핵심 개념:**
- 위치 데이터 구조: `{ latitude, longitude, status, updated_at }`
- 위치 상태: `sharing`, `on_the_way`, `arrived`, `late`, `stopped`
- 이벤트 채널: `event-location:${eventId}`
- 접근 제어: `verifyEventAccess()` — 이벤트 존재 + 위치공유 활성화 + 멤버십 확인

**프로젝트 적용 사례:**
```js
// locationHandler.js — 위치 업데이트 브로드캐스트
socket.on('location:update', async ({ eventId, latitude, longitude, status }) => {
  const event = await verifyEventAccess(eventId, userId);
  if (!event) return socket.emit('location:error', { ... });
  io.to(`event-location:${eventId}`).emit('location:update', {
    userId, latitude, longitude, status, updated_at: new Date().toISOString(),
  });
});
```

**추천 학습 리소스:**
- [Geolocation API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API)
- Socket.IO: Real-time Location Sharing 패턴

---

### 3.4 Socket 인증 및 멤버십 캐싱 — 레벨 3 (심화)

**왜 알아야 하는지:**
WebSocket 연결에도 인증이 필요합니다. 또한 메시지마다 DB 조회를 하면 성능 문제가 발생하므로 멤버십 캐싱 전략이 중요합니다.

**핵심 개념:**
- Socket.IO 미들웨어에서 토큰 검증
- `socket.userId` — 인증된 사용자 ID를 소켓에 바인딩
- `Map` 기반 인메모리 캐시 (60초 TTL)
- `setInterval` + `.unref()`를 활용한 캐시 정리

**프로젝트 적용 사례:**
```js
// chatHandler.js — 멤버십 캐시
const membershipCache = new Map();
const MEMBERSHIP_CACHE_TTL = 60_000;

async function isRoomMember(roomId, userId) {
  const cached = membershipCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < MEMBERSHIP_CACHE_TTL) return cached.result;
  // ... DB 조회 후 캐시 저장
}
```

**추천 학습 리소스:**
- [Socket.IO Middleware](https://socket.io/docs/v4/middlewares/)
- Node.js: 메모리 캐싱 전략

---

## 4. 프론트엔드 필수 지식

클라이언트는 React + Vite로 구축되었습니다. `client/src/` 디렉토리를 탐색하면서 학습하세요.

### 4.1 React Hooks — 레벨 1 (필수)

**왜 알아야 하는지:**
이 프로젝트의 모든 컴포넌트가 함수형 컴포넌트 + Hooks 패턴을 사용합니다. `client/src/hooks/` 디렉토리에 커스텀 훅이 있습니다.

**핵심 개념:**
- `useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`
- 커스텀 훅 패턴 (`useAuth`, `useSocket`)
- Hooks 규칙: 최상위에서만 호출, 조건문 안에서 호출 금지
- 의존성 배열(dependency array)과 리렌더링 최적화

**프로젝트 적용 사례:**
- `useAuth.js` — 인증 상태 관리 훅
- `useSocket.js` — Socket.IO 연결 관리 훅

**추천 학습 리소스:**
- [React 공식 문서: Hooks](https://react.dev/reference/react/hooks)
- [React 한국어 문서](https://ko.react.dev/)

---

### 4.2 Zustand 상태관리 — 레벨 1 (필수)

**왜 알아야 하는지:**
전역 상태 관리에 Zustand를 사용합니다. Redux보다 간결하며 보일러플레이트가 적습니다. `client/src/store/` 디렉토리에 스토어가 정의되어 있습니다.

**핵심 개념:**
- `create()` — 스토어 생성
- 선택자(selector) 패턴으로 불필요한 리렌더링 방지
- 미들웨어: `persist` (localStorage 저장), `devtools`
- 비동기 액션 (async actions)

**프로젝트 적용 사례:**
- `authStore.js` — 인증 상태 (user, session, login/logout)
- `roomOrderStore.js` — 방 정렬 순서 관리

**추천 학습 리소스:**
- [Zustand 공식 문서](https://github.com/pmndrs/zustand)
- [Zustand vs Redux 비교](https://docs.pmnd.rs/zustand/getting-started/comparison)

---

### 4.3 React Router v6 — 레벨 1 (필수)

**왜 알아야 하는지:**
SPA 라우팅을 React Router v6로 처리합니다. 페이지 컴포넌트가 `client/src/pages/`에 있고, 레이아웃이 `client/src/layouts/`에 있습니다.

**핵심 개념:**
- `<BrowserRouter>`, `<Routes>`, `<Route>`
- 중첩 라우트(nested routes)와 `<Outlet>`
- `useNavigate`, `useParams`, `useSearchParams`
- 보호된 라우트(protected routes) 패턴
- Lazy loading: `React.lazy` + `Suspense`

**프로젝트 적용 사례:**
- 페이지 목록: Dashboard, Room, Board, Deadlines, Settings, Admin, Login, Signup, ResetPassword, FlindersLife

**추천 학습 리소스:**
- [React Router v6 공식 문서](https://reactrouter.com/)

---

### 4.4 Radix UI 접근성 컴포넌트 — 레벨 2 (중요)

**왜 알아야 하는지:**
UI 컴포넌트(Dialog, Tabs, Dropdown, Avatar, Tooltip 등)는 Radix UI primitives 위에 구축되어 있습니다. 접근성(a11y)이 기본 내장되어 있어 키보드 네비게이션, 스크린 리더를 지원합니다.

**핵심 개념:**
- Radix UI의 "headless" 철학: 기능은 제공, 스타일은 자유
- Compound Component 패턴: `Dialog.Root`, `Dialog.Trigger`, `Dialog.Content`
- 포커스 트래핑(focus trapping)과 WAI-ARIA 속성
- `client/src/components/ui/` — 프로젝트에서 래핑한 UI 컴포넌트

**프로젝트 적용 사례:**
- `dialog.jsx`, `tabs.jsx`, `dropdown-menu.jsx`, `avatar.jsx`, `tooltip.jsx`, `sheet.jsx`, `alert-dialog.jsx`

**추천 학습 리소스:**
- [Radix UI 공식 문서](https://www.radix-ui.com/docs/primitives)
- [shadcn/ui](https://ui.shadcn.com/) — Radix + Tailwind 기반 컴포넌트 (이 프로젝트의 UI 패턴과 유사)

---

### 4.5 Tailwind CSS Utility-First — 레벨 1 (필수)

**왜 알아야 하는지:**
모든 스타일이 Tailwind CSS 유틸리티 클래스로 작성됩니다. 별도의 CSS 파일 없이 JSX 안에서 스타일을 적용합니다.

**핵심 개념:**
- 유틸리티 클래스: `flex`, `p-4`, `text-sm`, `bg-white`, `rounded-lg`
- 반응형 디자인: `sm:`, `md:`, `lg:` 접두사
- 다크 모드: `dark:` 접두사
- `cn()` 유틸리티 — `clsx` + `tailwind-merge`로 조건부 클래스 결합
- `index.css` — 전역 Tailwind 설정 (`@tailwind base/components/utilities`)

**추천 학습 리소스:**
- [Tailwind CSS 공식 문서](https://tailwindcss.com/docs)
- [Tailwind CSS Cheat Sheet](https://nerdcave.com/tailwind-cheat-sheet)

---

### 4.6 Vite HMR — 레벨 2 (중요)

**왜 알아야 하는지:**
Vite는 개발 서버의 핫 모듈 교체(HMR)를 제공합니다. `vite.config.js`에서 프록시 설정, 빌드 최적화(manual chunks), 경로 별칭(@)을 확인할 수 있습니다.

**핵심 개념:**
- Vite의 ESM 기반 개발 서버 (번들링 없이 빠른 시작)
- HMR(Hot Module Replacement): 파일 수정 시 페이지 새로고침 없이 반영
- Proxy 설정: `/api` → `localhost:3001`, `/socket.io` → WebSocket 프록시
- 빌드 시 Manual Chunks: vendor 라이브러리 분리로 캐싱 최적화
- 경로 별칭: `@` → `./src`

**프로젝트 적용 사례:**
```js
// vite.config.js
manualChunks: {
  'vendor-supabase': ['@supabase/supabase-js'],
  'vendor-socket': ['socket.io-client'],
  'vendor-date': ['date-fns'],
  'vendor-radix': ['@radix-ui/react-dialog', ...],
}
```

**추천 학습 리소스:**
- [Vite 공식 문서](https://vitejs.dev/)
- [Vite: HMR 작동 원리](https://vitejs.dev/guide/features.html#hot-module-replacement)

---

## 5. 모바일 개발

이 앱은 Capacitor를 사용하여 웹 앱을 iOS/Android 네이티브 앱으로 배포합니다.

### 5.1 Capacitor Bridge 개념 — 레벨 2 (중요)

**왜 알아야 하는지:**
Capacitor는 웹 코드를 네이티브 WebView 안에서 실행하면서, JavaScript ↔ 네이티브 코드 간의 브릿지를 제공합니다. 한 번의 코드베이스로 웹, iOS, Android를 모두 지원할 수 있습니다.

**핵심 개념:**
- Capacitor의 아키텍처: Web App → WebView → Native Bridge → Native APIs
- `capacitor.config.ts` — 앱 ID, 서버 URL, 플러그인 설정
- `npx cap sync` — 웹 빌드를 네이티브 프로젝트에 동기화
- 플랫폼 감지: `Capacitor.isNativePlatform()`
- 웹과 네이티브에서 다르게 동작하는 API 처리

**추천 학습 리소스:**
- [Capacitor 공식 문서](https://capacitorjs.com/docs)
- [Capacitor vs Cordova 비교](https://capacitorjs.com/docs/cordova)

---

### 5.2 네이티브 플러그인 — 레벨 2 (중요)

**왜 알아야 하는지:**
위치 공유, 진동 피드백, 상태바 제어 등 네이티브 기능을 사용합니다.

**핵심 개념:**
- **Geolocation**: GPS 위치 획득, `watchPosition`, 정확도 설정
- **Haptics**: 진동 피드백 (`impact`, `notification`, `vibrate`)
- **StatusBar**: 상태바 색상, 스타일, 표시/숨김
- **PushNotifications**: 푸시 알림 등록 및 수신
- 플러그인 사용 패턴: `import { Geolocation } from '@capacitor/geolocation'`

**프로젝트 적용 사례:**
- 위치 공유 기능에서 Geolocation 플러그인 사용
- 모바일 환경의 StatusBar 스타일링
- 푸시 알림으로 새 메시지/이벤트 알림

**추천 학습 리소스:**
- [Capacitor Geolocation](https://capacitorjs.com/docs/apis/geolocation)
- [Capacitor Haptics](https://capacitorjs.com/docs/apis/haptics)
- [Capacitor Status Bar](https://capacitorjs.com/docs/apis/status-bar)

---

### 5.3 PWA vs Native 차이 — 레벨 3 (심화)

**왜 알아야 하는지:**
이 앱은 PWA로도 동작하며, 네이티브 앱으로도 배포됩니다. 두 환경의 차이를 이해해야 적절한 기능 분기를 할 수 있습니다.

**핵심 개념:**
- PWA: Service Worker, Web App Manifest, 오프라인 지원
- Native: 앱 스토어 배포, 푸시 알림, 백그라운드 작업
- 기능 차이: PWA는 일부 API 제한 (iOS Safari 제약)
- `safe-area-inset-*` — 노치/홈 인디케이터 대응
- `flex shrink-0` — 모바일 스크롤 레이아웃 안정화

**추천 학습 리소스:**
- [web.dev: Progressive Web Apps](https://web.dev/progressive-web-apps/)
- [Capacitor: PWA → Native Migration](https://capacitorjs.com/docs/web/pwa-elements)

---

## 6. 배포 / DevOps

이 프로젝트는 Render에 배포됩니다. `docs/deployment-checklist.md`와 `docs/deployment-plan.md`를 참고하세요.

### 6.1 Render 배포 파이프라인 — 레벨 1 (필수)

**왜 알아야 하는지:**
main 브랜치에 push하면 Render가 자동으로 빌드 및 배포합니다. 배포 과정과 설정을 이해해야 문제를 디버깅할 수 있습니다.

**핵심 개념:**
- Render의 Web Service: Node.js 앱 자동 감지, 빌드, 배포
- 빌드 명령: `npm install && npm run build`
- 시작 명령: `npm start` (서버) / Static Site (클라이언트)
- 자동 배포: GitHub main 브랜치 push 시 트리거
- 헬스 체크: 배포 후 자동 상태 확인

**추천 학습 리소스:**
- [Render 공식 문서](https://render.com/docs)
- [Render: Node.js 배포 가이드](https://render.com/docs/deploy-node-express-app)

---

### 6.2 환경변수 관리 — 레벨 1 (필수)

**왜 알아야 하는지:**
API 키, DB 연결 문자열, 시크릿은 환경변수로 관리합니다. 절대 코드에 하드코딩하면 안 됩니다.

**핵심 개념:**
- `.env` 파일 — 로컬 개발용 (`.gitignore`에 포함)
- Render 대시보드의 Environment Variables 설정
- `VITE_` 접두사 — Vite에서 클라이언트에 노출할 변수
- `server/src/config.js` — 서버 환경변수 중앙 관리
- Supabase URL, Anon Key, Service Role Key 분리

**추천 학습 리소스:**
- [Vite: 환경변수](https://vitejs.dev/guide/env-and-mode.html)
- [Render: Environment Variables](https://render.com/docs/environment-variables)

---

### 6.3 빌드 최적화 (Manual Chunks) — 레벨 3 (심화)

**왜 알아야 하는지:**
`vite.config.js`의 `manualChunks` 설정으로 vendor 라이브러리를 별도 청크로 분리합니다. 이렇게 하면 앱 코드 변경 시 vendor 청크는 캐시에서 재사용됩니다.

**핵심 개념:**
- Code Splitting: 필요한 코드만 로드
- Manual Chunks: 특정 라이브러리를 별도 번들로 분리
- Tree Shaking: 사용하지 않는 코드 제거
- 브라우저 캐싱과 청크 해시

**프로젝트 적용 사례:**
- `vendor-supabase`, `vendor-socket`, `vendor-date`, `vendor-radix` 4개 청크 분리

**추천 학습 리소스:**
- [Vite: Build Optimizations](https://vitejs.dev/guide/build.html)
- [Rollup: Code Splitting](https://rollupjs.org/guide/en/#code-splitting)

---

### 6.4 모니터링 — 레벨 3 (심화)

**왜 알아야 하는지:**
`server/src/utils/monitor.js`와 `server/src/middleware/monitorMiddleware.js`가 서버 상태와 요청을 모니터링합니다.

**핵심 개념:**
- 요청/응답 로깅 (Morgan)
- 에러 추적 및 알림
- 헬스 체크 엔드포인트
- 메모리 사용량, 응답 시간 모니터링

**추천 학습 리소스:**
- [Morgan 공식 문서](https://github.com/expressjs/morgan)
- Render: Logging & Metrics

---

## 7. API 설계

서버는 Express.js 기반 RESTful API를 제공합니다. `server/src/routes/`와 `server/src/controllers/`를 읽으면서 학습하세요.

### 7.1 RESTful 패턴 — 레벨 1 (필수)

**왜 알아야 하는지:**
이 프로젝트의 모든 API가 REST 원칙을 따릅니다. URL 설계, HTTP 메서드 사용, 상태 코드 처리를 이해해야 합니다.

**핵심 개념:**
- HTTP 메서드: `GET` (조회), `POST` (생성), `PUT/PATCH` (수정), `DELETE` (삭제)
- URL 패턴: `/api/rooms`, `/api/rooms/:roomId/events`, `/api/rooms/:roomId/messages`
- 상태 코드: `200` (성공), `201` (생성), `400` (잘못된 요청), `401` (미인증), `403` (권한 없음), `404` (없음), `500` (서버 오류)
- 리소스 중첩: 방 → 이벤트, 방 → 메시지, 방 → 파일

**프로젝트 라우트 목록:**
| 경로 | 설명 |
|------|------|
| `/api/auth` | 인증 (로그인, 회원가입, 비밀번호 재설정) |
| `/api/rooms` | 방 CRUD, 멤버 관리 |
| `/api/rooms/:roomId/events` | 이벤트 관리 |
| `/api/rooms/:roomId/files` | 파일 업로드/다운로드 |
| `/api/rooms/:roomId/messages` | 메시지 조회 |
| `/api/rooms/:roomId/tasks` | 태스크 관리 |
| `/api/rooms/:roomId/board` | 게시판 |
| `/api/rooms/:roomId/announcements` | 공지사항 |
| `/api/location` | 위치 세션 관리 |
| `/api/reports` | 리포트 |
| `/api/admin` | 관리자 기능 |
| `/api/push` | 푸시 알림 구독 |
| `/api/flinders` | Flinders 대학 데이터 |

**추천 학습 리소스:**
- [RESTful API 설계 가이드](https://restfulapi.net/)
- MDN: HTTP 메서드

---

### 7.2 Express 라우팅 — 레벨 1 (필수)

**왜 알아야 하는지:**
Express Router를 사용하여 라우트를 모듈화합니다. 각 도메인(rooms, events, files 등)이 별도의 라우트 파일로 분리되어 있습니다.

**핵심 개념:**
- `express.Router()` — 모듈화된 라우트 핸들러
- 라우트 파라미터: `req.params.roomId`
- 쿼리 스트링: `req.query.page`
- 라우트 마운팅: `app.use('/api/rooms', roomRoutes)`

**프로젝트 적용 사례:**
```js
// server/src/index.js
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms/:roomId/events', eventRoutes);
// ...
```

**추천 학습 리소스:**
- [Express.js 공식 문서: Routing](https://expressjs.com/en/guide/routing.html)

---

### 7.3 미들웨어 체인 — 레벨 1 (필수)

**왜 알아야 하는지:**
Express의 핵심 패턴은 미들웨어 체인입니다. 요청은 여러 미들웨어를 순서대로 통과하며 각 단계에서 인증, 검증, 권한 확인 등이 수행됩니다.

**핵심 개념:**
- `next()` — 다음 미들웨어로 전달
- 미들웨어 실행 순서의 중요성
- 글로벌 미들웨어: `helmet`, `cors`, `compression`, `morgan`
- 라우트 미들웨어: `authenticate → requireRoomMember → requireRoomAdmin → controller`
- 에러 처리 미들웨어: `(err, req, res, next)` — 4개 인자

**프로젝트 미들웨어 체인 예시:**
```
요청 → helmet → cors → compression → json parser
     → morgan (로깅) → authenticate (JWT 검증)
     → requireRoomMember (멤버십 확인)
     → validate (입력 검증)
     → controller (비즈니스 로직)
     → errorHandler (에러 처리)
```

**추천 학습 리소스:**
- [Express.js: Using Middleware](https://expressjs.com/en/guide/using-middleware.html)

---

### 7.4 에러 핸들링 패턴 — 레벨 2 (중요)

**왜 알아야 하는지:**
일관된 에러 처리가 없으면 클라이언트에서 오류를 적절히 처리할 수 없습니다. `server/src/middleware/errorHandler.js`에서 중앙화된 에러 처리를 제공합니다.

**핵심 개념:**
- 중앙화된 에러 핸들러 미들웨어
- `notFoundHandler` — 존재하지 않는 라우트 처리 (404)
- 에러 응답 형식 통일: `{ error: string, details?: array }`
- 비동기 에러 처리: `try/catch` 패턴
- 프로덕션 vs 개발 환경 에러 정보 차이

**추천 학습 리소스:**
- [Express.js: Error Handling](https://expressjs.com/en/guide/error-handling.html)

---

## 학습 순서 요약

아래는 권장 학습 순서입니다. 레벨 1을 먼저 완료한 후 레벨 2, 3으로 진행하세요.

### 1단계 — 레벨 1 (필수, 먼저 학습)

| 순서 | 주제 | 섹션 |
|------|------|------|
| 1 | React Hooks | 4.1 |
| 2 | Tailwind CSS | 4.5 |
| 3 | React Router v6 | 4.3 |
| 4 | Zustand 상태관리 | 4.2 |
| 5 | PostgreSQL 기본 | 2.1 |
| 6 | JWT 인증 | 1.1 |
| 7 | RLS (Row Level Security) | 1.3 |
| 8 | Input Validation | 1.7 |
| 9 | Express 라우팅 | 7.2 |
| 10 | 미들웨어 체인 | 7.3 |
| 11 | RESTful 패턴 | 7.1 |
| 12 | FK/CASCADE 관계 | 2.4 |
| 13 | 마이그레이션 관리 | 2.3 |
| 14 | Supabase 대시보드 | 2.2 |
| 15 | WebSocket 개념 | 3.1 |
| 16 | Socket.IO Rooms & Events | 3.2 |
| 17 | Render 배포 | 6.1 |
| 18 | 환경변수 관리 | 6.2 |

### 2단계 — 레벨 2 (중요, 다음에 학습)

| 순서 | 주제 | 섹션 |
|------|------|------|
| 19 | PKCE Flow | 1.2 |
| 20 | Helmet CSP | 1.4 |
| 21 | CORS | 1.5 |
| 22 | Rate Limiting | 1.6 |
| 23 | 파일 업로드 보안 | 1.8 |
| 24 | 인덱스 설계 | 2.5 |
| 25 | RLS 정책 작성법 | 2.6 |
| 26 | 위치 공유 패턴 | 3.3 |
| 27 | Radix UI | 4.4 |
| 28 | Vite HMR | 4.6 |
| 29 | Capacitor Bridge | 5.1 |
| 30 | 네이티브 플러그인 | 5.2 |
| 31 | 에러 핸들링 | 7.4 |

### 3단계 — 레벨 3 (심화, 마지막에 학습)

| 순서 | 주제 | 섹션 |
|------|------|------|
| 32 | Socket 인증 & 캐싱 | 3.4 |
| 33 | PWA vs Native | 5.3 |
| 34 | 빌드 최적화 | 6.3 |
| 35 | 모니터링 | 6.4 |

---

> **팁:** 각 주제를 학습할 때 이 프로젝트의 실제 코드를 함께 읽으세요.
> 이론만 공부하는 것보다 실제 구현을 보면서 학습하면 훨씬 빠르게 이해할 수 있습니다.
