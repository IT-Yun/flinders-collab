# iOS Local Test Checklist

이 프로젝트는 웹 앱을 Capacitor로 감싸서 iPhone에서 실행합니다.

## 현재 준비 완료 상태
- `client` 웹 빌드 성공
- `@capacitor/ios` 설치 완료
- `@capacitor/cli` 설치 완료
- `npx cap sync ios` 성공

## Xcode 설치가 끝난 뒤 바로 할 일

1. Xcode를 한 번 직접 실행합니다.
   - 라이선스/추가 컴포넌트 설치가 뜨면 완료합니다.

2. Xcode 경로를 본체로 맞춥니다.
```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version
```

3. iOS 프로젝트를 최신 상태로 맞춥니다.
```bash
cd "./client"
npm run ios:prepare
```

4. Xcode를 엽니다.
```bash
cd "./client"
npm run ios:open
```

## Xcode 안에서 해야 할 설정

1. 왼쪽에서 `App` 프로젝트 선택
2. `TARGETS > App > Signing & Capabilities`
3. `Automatically manage signing` 체크
4. `Team`에서 본인 Apple 계정의 `Personal Team` 선택
5. `Bundle Identifier` 충돌 시 고유하게 수정
   - 현재 값: `au.edu.flinders.collab`
   - 예시: `com.example.collab`

## iPhone 연결

1. iPhone을 Mac에 연결
2. iPhone에서 `이 컴퓨터를 신뢰` 선택
3. 잠금 해제 유지
4. Xcode 상단 실행 대상에서 본인 iPhone 선택
5. Run 실행

## 앱이 설치됐는데 열리지 않을 때

iPhone에서 아래 메뉴를 확인합니다.

- `설정 > 일반 > VPN 및 기기 관리`
- 개발자/프로필 신뢰 후 앱 재실행

## 반복 작업 명령

코드 수정 후 iOS 반영:
```bash
cd "./client"
npm run ios:prepare
```

Xcode 다시 열기:
```bash
cd "./client"
npm run ios:open
```

## 점검해야 할 핵심 기능
- 로그인
- 방 목록/입장
- 채팅
- 게시판
- 일정
- 파일 업로드
- 위치 권한
- 외부 링크

## 주의
- iPhone에서는 `localhost` API를 직접 볼 수 없습니다.
- 실제 서버 URL이 필요합니다.
- `VITE_API_BASE_URL`이 운영/외부 접속 가능한 주소인지 확인해야 합니다.
