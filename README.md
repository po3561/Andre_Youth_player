# Andre Youth Player

GitHub Pages에서 동작하는 **정적(HTML/JS/CSS) 음악 플레이어**이며, 관리자 업로드/수정/삭제는 **Google Apps Script(GAS) + Google Drive + Google Sheet**를 백엔드로 사용합니다.

## 구조

- `index.html`: 플레이어
- `admin.html`: 관리자(업로드/목록/수정/삭제)
- `config.js`: 런타임 설정(특히 `GAS_URL`)을 한 곳에서 관리
- `Code.gs`: GAS 백엔드(권장/메인)
- `gas-backend.gs`: 구버전 호환 파일(가급적 `Code.gs`만 유지 권장)

## 배포(Frontend) - GitHub Pages

1. GitHub 저장소에서 Pages를 활성화합니다.
2. 정적 파일(`index.html`, `admin.html`, `*.js`, `*.css`)이 Pages에 그대로 배포되면 됩니다.
3. **GAS 배포 URL이 바뀌면 `config.js`의 `GAS_URL`만 수정**하세요.

## 배포(Backend) - Google Apps Script

1. Google Apps Script 프로젝트를 새로 만들고, `Code.gs` 내용을 붙여넣습니다.
2. `CONFIG`의 아래 값을 실제 값으로 교체합니다.
   - `SPREADSHEET_ID`
   - `AUDIO_FOLDER_ID`
   - `IMAGE_FOLDER_ID`
   - `LRC_FOLDER_ID`
3. (선택) Project Settings → Script properties에 `GEMINI_API_KEY`를 설정하면 관리자에서 `AI 자동 싱크`가 더 정확해집니다.
4. “웹 앱으로 배포(Deploy as web app)” 하고, 발급된 URL을 `config.js`의 `GAS_URL`에 넣습니다.

## 관리자 리뉴얼(앱 전체 제어)

`admin.html` 목록에서 **연필(수정) 버튼**을 누르면 아래 항목을 변경할 수 있습니다.

- 제목
- 가사(LRC 텍스트)
- 싱크 보정값(`syncOffset`, `syncMinGap`)
- (선택) 음원 교체
- (선택) 커버 교체

또한 관리자에서 플레이어 공통 설정도 수정 가능합니다.

- 상단 타이틀/서브타이틀
- 기본 아티스트명
- 테마 메인 컬러
- 가사 힌트 문구
- 저작권 안내 문구

설정은 GAS Script Properties에 저장되며, 플레이어는 `bootstrap` API로 설정과 플레이리스트를 함께 받아옵니다.

## 가사 싱크(“못따라감”) 개선 사항

- 플레이어가 매 `timeupdate`마다 전체 가사를 순회/전체 DOM 클래스를 갱신하던 로직을 최적화하여,
  활성 라인만 갱신하고, 스크롤도 쓰로틀링(과도한 `smooth` 스크롤 제거)합니다.
- GAS에 `syncOffset`/`syncMinGap`를 저장하고, 플레이어가 곡별 `syncOffset`를 적용하도록 반영했습니다.

## 로딩 성능 개선

- 플레이어가 초기 진입 시 `bootstrap` API(설정 + 경량 곡 목록)를 사용합니다.
- 곡별 `lyricsData`는 필요할 때(`action=lyrics&id=...`) 지연 로딩합니다.
- GAS ScriptCache를 사용해 `bootstrap`/가사 조회 결과를 단기 캐싱합니다.

