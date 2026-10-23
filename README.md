# API Book

Kubernetes 계열 컨테이너 플랫폼의 API 문서를 모아 만든, 검색 가능한 **API 레퍼런스 북**입니다.
데이터는 공개된 OpenShift Container Platform 4.22 / 4.21 / 4.20 API 문서(Apache License 2.0)에서 수집했습니다.
**배포 주소: <https://yjj3019.github.io/OCP-APIBook/>**

원본: <https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html-single/api_overview/index>

외부 서버나 빌드 도구 없이 정적 파일만으로 동작합니다(Node.js는 로컬 서버용).

> **저장소 소유자 할 일**: 제품 이름은 "API Book"으로 바뀌었지만 저장소 이름(`yjj3019/OCP-APIBook`)과 Pages 주소는 아직 그대로입니다. 저장소 이름은 소유자만 바꿀 수 있습니다(**Settings → General → Repository name**). 이름을 바꾸면 Pages 주소가 바뀌므로 이 README의 링크와 경로(`/OCP-APIBook/`)도 함께 고쳐야 합니다. 그 전까지는 현재 링크가 그대로 동작합니다.

## 실행

```
node serve.js                    # http://localhost:8080 (로컬 전용)
node serve.js 9000               # 다른 포트
node serve.js 9000 --host 0.0.0.0   # 같은 네트워크의 다른 기기에서도 접속
```

서버는 brotli/gzip 압축과 ETag 재검증(304)을 지원합니다. 첫 화면(홈)에 필요한 파일의 전송량은 `node tools/perf.js` 로 확인할 수 있습니다.

## GitHub Pages 배포

`main` 에 push 하면 `.github/workflows/pages.yml` 이 정적 파일만 골라 배포합니다. 처음 한 번 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 지정하세요. 주소는 <https://yjj3019.github.io/OCP-APIBook/> 입니다. 하위 경로(`/OCP-APIBook/`)에서 서비스 워커·데이터가 정상 동작함을 확인했습니다.

## MCP 서버

같은 데이터를 MCP(Model Context Protocol) 서버로도 쓸 수 있습니다. 서버 이름은 `api-book` 입니다. 의존성 없이 `node` 만 있으면 되고, 읽기 전용이며 네트워크·클러스터에 접근하지 않습니다(stdio).

```
claude mcp add api-book -- node /경로/OCP-APIBook/mcp/server.js
```

다른 클라이언트는 설정에 `{"command": "node", "args": ["/경로/OCP-APIBook/mcp/server.js"]}` 를 넣으면 됩니다.

| 도구 | 역할 |
|---|---|
| `search_apis` | 키워드 검색(한글·영문·Kind·필드 경로·제약 문장), 버전 무관 통합 결과 |
| `list_apis` | 분류·범위·제약 유형별 목록과 개수 |
| `get_api` | 설명, 제공 버전, 호환성 레벨, 엔드포인트, 최상위 필드 |
| `get_fields` | 중첩 필드 상세(`spec.tls`, 배열은 `spec.rules[]`) |
| `get_constraints` | 제약·제한 사항과 적용 버전 |
| `compare_versions` | 4.20 / 4.21 / 4.22 사이 필드·타입·필수·엔드포인트 차이 |
| `generate_manifest` | 필수 필드만 채운 YAML 뼈대 |

`node mcp/smoke.js` 로 stdio 왕복 테스트를 돌릴 수 있습니다. 제약 사항은 웹 화면과 같은 추출 결과라서 같은 한계가 있습니다.

## 기능

- **통합 검색**: 같은 API는 버전과 관계없이 한 번만 나오고, 제공 버전과 **제약·제한 사항**이 함께 표시됩니다. 한글·영문·약어(`mcp`, `pvc`)·오타·`apiVersion`·중첩 필드 경로(`spec.tls.termination`)·제약 문장(`deprecated`, `immutable`)까지 찾습니다. 분류, 범위, 안정성(GA/Beta/Alpha), 제약 유무로 거를 수 있습니다.
- **제약·제한 사항**: 원문 설명 문장에서 추출한 폐지 예정, 변경 불가 필드, 미리보기·기능 게이트, 싱글턴 이름, 상호 배타, 조건부 필드, 값 범위와 호환성 레벨, 그리고 버전별 필드·타입·엔드포인트 차이.
- **커맨드 팔레트**: `Ctrl K` 또는 `/` 로 어디서나 API·필드·가이드·명령을 검색합니다.
- **API 상세**: 설명, 중첩 필드 트리(제약 표시 포함), 엔드포인트별 파라미터·본문·응답, 구문 강조된 YAML / `oc` / REST 예시, 관계도.
- **버전 비교**: 버전 사이에 추가·삭제·변경된 API와 필드 차이.
- **토폴로지**: API 간 연결 그래프와 선택한 API의 설명 패널.
- **API 설계 시뮬레이터**: 스펙 기반 폼으로 리소스를 설계하면 YAML이 만들어지고, 필수 값·타입·알 수 없는 필드를 검증합니다. 생성·조회·수정·삭제 요청에 서버가 어떻게 응답할지(201/400/401/403/404/409/422)를 가상으로 보여줍니다. 실제 클러스터에는 아무것도 보내지 않습니다.
- **그 밖에**: 즐겨찾기·최근 본 API, 라이트/다크/시스템 테마, 모바일 대응, 단축키(`?` 로 목록 보기).

## 배포 절차

```
node build.js && node tools/test-build.js && node tools/stamp.js
```

코드·CSS·데이터를 고친 뒤에는 `tools/stamp.js` 로 `?v=` 해시와 `sw.js` 를 다시 만들어야 합니다. 잊으면 GitHub Actions 배포가 "스탬프가 최신이 아님" 오류로 멈춥니다(배포 전에 문법 검사·스탬프 확인·MCP 스모크 테스트를 돌립니다).

`build.js` 와 `tools/test-build.js` 는 수집 원본(`_scrape/`, 저장소에 포함하지 않음)이 있어야 돌아갑니다. 원본은 `node tools/scrape.js` 로 다시 수집합니다(Playwright 필요). 일부 버전만 빌드하는 것은 지원하지 않습니다.

서비스 워커는 새 버전을 받아도 열린 탭을 모두 닫거나 새로 열었을 때 바뀝니다(열린 탭의 옛 코드와 섞이지 않게).

## 구성

| 경로 | 역할 |
|---|---|
| `index.html`, `app.css`, `sim.css` | 셸 마크업과 디자인 시스템 |
| `core.js` | 상태·저장소·지연 로딩·통합 검색 엔진·라우터 |
| `views.js` | 홈, 탐색, API 상세, 버전 비교, 가이드, 토폴로지·시뮬레이터 연결 |
| `boot.js` | 아이콘 채우기, 앱 시작, 서비스 워커 등록(인라인 스크립트 없음) |
| `palette.js` | 커맨드 팔레트, 단축키, 도움말 |
| `ui-kit.js` | 아이콘 60종과 YAML/JSON/bash 구문 강조 |
| `search.js` | 검색 엔진(역색인, 한글 키워드 사전, 오타 보정) |
| `graph.js` / `viz.js` / `topo.js` | 관계 데이터, 캔버스 그래프 엔진, 토폴로지 화면 |
| `sim.js` | 설계 시뮬레이터(YAML 파서, 스키마 검증, 요청·응답 시뮬레이션) |
| `data/` | 데이터베이스(`build.js` 가 생성). `merged.js`(통합·제약), `legacy.js`, `<버전>.js`, `<버전>.fidx.js`, `<버전>.fields.<책>.js (책별 분할)` |
| `build.js` | 수집 원본(`_scrape/`) → `data/` 변환, 제약 추출 |
| `tools/` | 수집 스크립트, 상표 문구 치환(`trademark.js`), 빌드 테스트(`test-build.js`), 전송량 측정(`perf.js`) |
| `mcp/` | MCP 서버(`server.js`)와 스모크 테스트(`smoke.js`) |
| `serve.js` | 압축·캐시·보안 헤더를 갖춘 정적 서버 |

그래프·시뮬레이터·버전별 큰 데이터는 필요할 때만 불러옵니다.

## 보안과 운영

- **서버**: 기본은 로컬 전용(`127.0.0.1`)이며 `Host` 헤더를 검사합니다(DNS rebinding 방어). 앱이 쓰는 파일(루트 직하 파일과 `data/` 하위)만 허용 목록으로 서빙하고 `tools/`, `_scrape/`, 숨김 파일, 개발용 파일은 대소문자·경로 우회와 무관하게 거부합니다. 압축 캐시는 96MB로 제한되고 타임아웃·연결 수 제한이 있습니다.
- **CSP**: 서버가 `script-src 'self'`, `font-src 'none'` 등 엄격한 Content-Security-Policy 를 보냅니다. `index.html` 에도 같은 정책이 `<meta>` 로 들어 있어 정적 호스팅에서도 적용됩니다(이 경우 `frame-ancestors` 는 적용되지 않음). 인라인 스크립트와 이벤트 핸들러는 쓰지 않습니다.
- **원문 HTML**: 가이드 본문은 허용 태그·속성만 남기고 렌더링합니다.
- **캐시**: 모든 파일은 ETag 로 재검증합니다. `data/` 파일은 `merged.js` 의 `build` 해시를 `?v=` 로 붙여 요청하므로(데이터가 바뀌면 값이 바뀜) 장기 캐시(immutable)가 안전합니다.
- **외부 요청**: 없습니다. 웹 글꼴은 포함하지도 불러오지도 않으며 모든 글자는 사용자 기기의 시스템 글꼴로 표시합니다. 서비스 워커(`sw.js`)가 재방문 속도와 오프라인 동작을 돕습니다(`?nosw` 로 끌 수 있음). 검색어와 입력은 외부로 나가지 않습니다.
- **저장소 사용**: 즐겨찾기·최근 본 API·테마·버전·시뮬레이터 초안이 브라우저 `localStorage` 에 저장됩니다(서버로 전송되지 않음).

## 라이선스와 상표

[Apache License 2.0](LICENSE). 원문 문서가 Apache License 2.0 으로 공개되어 있어 같은 라이선스를 따릅니다.
수집 데이터는 원문의 파생물이며 출처, 원문 Legal Notice, 변경 사항은 [NOTICE](NOTICE)에 적었습니다. 필드 설명의 상당 부분은 Kubernetes API 레퍼런스(Copyright The Kubernetes Authors, Apache License 2.0)에서 유래합니다.

비공식 프로젝트이며 원문 문서의 저작자·상표권자와 제휴하거나 그들의 보증을 받지 않았습니다. 제품 이름은 원문 문서의 출처를 밝히기 위해서만 씁니다.
원문 Legal Notice의 "수정본은 상표를 제거해야 한다"는 조건에 따라, 빌드 때 `tools/trademark.js` 가 사람이 읽는 설명 문장(API·필드 설명, 가이드 제목·본문)의 제품·회사 이름을 "platform", "host operating system", "vendor" 같은 일반 명칭으로 바꿉니다. 화면 UI에도 상표를 쓰지 않으며, 정보 창과 하단은 "Apache-2.0로 공개된 문서"라고만 표시하고 NOTICE를 가리킵니다.
상호운용을 위해 API 그룹·Kind 이름과 경로(예: `route.openshift.io`), 네임스페이스, 열거형 값(`RHCOS`, `RHEL` 등), 원문 URL 같은 **기술 식별자는 바꾸지 않습니다**(자세한 내용은 NOTICE).

### 법적 고지에 대한 참고

위 조치(중립적인 제품 이름, 설명 문장의 상표 치환, 출처를 알 수 없는 웹 글꼴 제거)는 확인된 두 조건, 즉 원문 문서의 "수정본은 상표를 제거해야 한다"는 조건과 글꼴 라이선스의 예약 글꼴 이름 조건에 대한 위험을 줄이기 위한 것입니다. 법률 자문이 아니며 문제가 없다는 보장도 아닙니다. 확실히 하려면 법률 전문가와 상의하세요. `RHCOS`/`RHEL` 같은 열거형 값과 API 그룹 이름은 기술 식별자로 남아 있습니다.

## 데이터 출처와 한계

- API 설명·필드·엔드포인트는 위 원본 문서에서 수집했습니다. 설명은 원문(영문)이며, 상표 이름만 위와 같이 일반 명칭으로 바꿨습니다.
- **제약·제한 사항은 설명 문장에서 정규식으로 추출**합니다(`tools/cons-rules.js`). 화면·MCP에 나가는 고유 문장 1,130개는 모두 사람이(또는 에이전트가 문장마다) 판정한 기준선(`tools/cons-audited.json`)에 있고, 오탐은 `tools/cons-deny.json`, 유형 오류는 `tools/cons-retype.json` 으로 바로잡았습니다. 원문을 다시 수집하거나 규칙을 바꾸면 `node tools/cons-audit.js` 가 새(미검토) 문장만 보여 주며, 배포 CI 는 `--strict` 로 미검토 문장이 있으면 멈춥니다. 정규식 추출이라 일부 제약은 여전히 빠질 수 있고(특히 긴 문장 안의 제약), 정확한 내용은 원문을 확인하세요.
- 토폴로지의 **"일반 관계"(점선)** 는 문서에서 추출한 것이 아니라 Kubernetes 계열 플랫폼의 일반적인 구조를 바탕으로 정리한 것입니다.
- 사용 예시(YAML, `oc`, REST)는 이름·그룹/버전·필수 필드로 만든 기본 틀입니다.
- 시뮬레이터의 검증과 가상 응답은 문서의 스키마 규칙만 사용합니다. 어드미션 웹훅, 기본값 적용, RBAC, 실제 충돌 검사는 반영하지 않습니다. "허용 값" 경고는 설명 문장에서 뽑은 힌트라 틀릴 수 있습니다.
- 원문 4.20 API index에 `IPAddressClaim` 행이 중복되어 하나만 남겼습니다.
