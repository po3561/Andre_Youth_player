# Firebase 전환 및 배포 마이그레이션 제안서

현재 **Google Apps Script(GAS) + Google Drive** 백엔드에서 신규 기기 로딩 지연 및 멈춤 현상이 발생하는 원인을 분석하고, 이를 **Firebase** 기반의 통합 아키텍처로 이전했을 때의 장단점 및 구체적인 마이그레이션 계획을 제안합니다.

---

## 1. 현재 아키텍처의 문제점 및 원인 분석

현재 서비스는 **Google Apps Script(GAS)**와 **Google Drive**를 기반으로 작동하고 있습니다. 이 구조는 다음과 같은 이유로 새로운 기기나 네트워크 환경에서 로딩 지연을 발생시킵니다.

### ① Google Apps Script의 콜드 스타트(Cold Start) 지연
- 새로운 기기에서 접속하거나 한동안 접속이 없었던 경우, Apps Script가 최초 요청을 처리하기 위해 서버를 깨우는 과정(Cold Start)에서 **최소 3초 ~ 최대 7초 이상**의 응답 지연이 발생합니다.
- 이 시간 동안 앱은 `불러오는 중...` 상태에 머물게 되며, 사용자는 앱이 멈춘 것으로 오해할 수 있습니다.

### ② Google Drive 오디오 스트리밍의 불안정성
- Google Drive는 기본적으로 파일 저장 및 다운로드에 특화된 서비스이지, 고속 미디어 스트리밍이나 CDN(Content Development Network) 목적으로 설계되지 않았습니다.
- 신규 기기에서 대용량 음원 데이터를 연속적으로 스트리밍할 때, Google Drive 측에서 트래픽 제한(Throttling)을 걸거나 CORS(교차 출처 리소스 공유) 차단을 발생시켜 오디오가 전혀 로드되지 않는 현상이 발생할 수 있습니다.

### ③ 캐싱 부재 및 네트워크 환경에 따른 성능 편차
- 기존에는 로컬 캐시(`localStorage`)를 활용하여 재방문 시 속도를 높였으나, **신규 기기 및 캐시가 만료된 기기**에서는 모든 데이터를 Apps Script로부터 다시 불러와야 하므로 동일한 정지 현상이 반복됩니다.

---

## 2. Firebase 백엔드 및 Hosting 이전 시 장점

서버와 파일 저장소, 그리고 배포 환경까지 **Firebase**로 완전히 전환하면 다음과 같은 큰 이점을 얻을 수 있습니다.

| 비교 항목 | 기존 구조 (GAS + Google Drive + GitHub) | 변경 구조 (Firebase 통합 아키텍처) |
| :--- | :--- | :--- |
| **데이터 로딩 속도** | **느림 (3~7초)** <br>Apps Script 콜드 스타트 영향 | **매우 빠름 (100ms 이내)** <br>Realtime Database의 실시간 쿼리 |
| **음원 스트리밍** | **불안정** <br>트래픽 제한 및 CORS 문제 잦음 | **안정적 & 최적화** <br>Firebase Storage의 고속 CDN 스트리밍 |
| **인증 및 보안** | 단순 하드코딩된 아이디/비밀번호 확인 | **강력함** <br>Firebase Auth 기반의 안전한 로그인/회원가입 |
| **웹 사이트 배포** | GitHub Pages (업데이트 반영 다소 지연) | **Firebase Hosting** <br>전 세계 고속 CDN 배포 및 즉시 반영 |
| **통합 관리** | 데이터(Drive, Sheet), 채팅(Firebase), 앱 소스(GitHub)가 분산됨 | **하나의 Firebase Project에서** 데이터, 스토리지, 채팅, 호스팅 일괄 관리 |

---

## 3. Firebase 전환 시 고려할 점 (단점 및 제약 사항)

1. **무료 사용량 한도 (Spark 요금제)**
   - Firebase Realtime Database: 동시 접속자 100명, 용량 1GB까지 무료.
   - Firebase Storage: 총 저장 용량 5GB, 일일 다운로드 용량 1GB까지 무료.
   - **조치 사항**: 플레이어 서비스의 규모가 커지거나 음원 파일이 많아지면 종량제(Blaze 요금제) 전환을 고려해야 합니다. 초기에는 무료 요금제(Spark)로도 충분히 테스트 및 운영이 가능합니다.

2. **기존 데이터 이관 작업**
   - 현재 Google Sheet나 파일에 저장된 곡 목록을 Firebase Database용 JSON 형식으로 변환하여 업로드하는 일회성 작업이 필요합니다.

---

## 4. 구체적인 마이그레이션 단계 (Action Plan)

Firebase로 완전 이전을 결정할 경우, 아래의 3단계로 작업을 진행할 수 있습니다.

### [Phase 1] 데이터베이스 마이그레이션 (GAS -> Firebase RTDB)
- **대상**: 곡 목록(`songs`), 앱 전역 설정(`settings`)
- **방법**: 기존 Google Apps Script가 반환하던 JSON 구조를 그대로 Firebase Realtime Database의 새로운 노드(`playlist`)에 저장합니다.
- **결과**: 앱 진입 시 Apps Script 호출 없이 Firebase JS SDK를 통해 0.1초 만에 플레이리스트 전체를 로드합니다.

### [Phase 2] 음원 및 이미지 저장소 전환 (Google Drive -> Firebase Storage)
- **대상**: 오디오 파일(.mp3, .m4a), 커버 이미지 파일(.jpg, .png)
- **방법**: 기존의 Google Drive 링크 대신 Firebase Storage에 파일을 업로드하고 생성된 다운로드 URL을 데이터베이스에 기록합니다.
- **결과**: CORS 오류가 완전히 사라지며 미디어 파일이 끊김 없이 즉시 로딩 및 재생됩니다.

### [Phase 3] 웹 앱 배포 및 호스팅 (GitHub -> Firebase Hosting)
- **대상**: HTML, CSS, JS 소스 파일 전체
- **방법**: `firebase-tools` CLI를 설치하고 `firebase init hosting`, `firebase deploy` 명령어로 Firebase 전용 도메인 또는 커스텀 도메인에 즉시 배포합니다.
- **결과**: 웹페이지 로딩 속도 자체가 훨씬 빨라지며, SSL(HTTPS)이 기본으로 제공되어 안전합니다.

---

## 5. 결론 및 추천 방향

사용자의 의견처럼 **서버(데이터, 파일 스토리지)와 배포까지 Firebase로 전부 이전하는 것**을 **적극 권장**합니다. 

현재 겪고 계신 **신규 기기 로딩 지연**과 **멈춤 현상**은 기존 Google 환경의 API 지연과 스트리밍 속도 제한이 주요 원인이므로, Firebase Hosting + Realtime Database + Storage를 도입하면 **체감 속도가 10배 이상 향상**될 것입니다.

저희가 마이그레이션을 도와드릴 수 있으니, 진행 여부를 알려주시면 바로 코드 변경 작업과 이관 작업을 시작하겠습니다!
