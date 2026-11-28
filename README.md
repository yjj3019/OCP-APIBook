# API Book

기본 화면은 한국어입니다. 상단의 **EN** 또는 **한국어**를 눌러 같은 릴리스와 페이지의 언어를 전환하세요. 영문 주소는 `index.html?lang=en`이며 로컬 파일에서도 사용할 수 있습니다. 시뮬레이터나 YAML 입력이 있는 비교 화면에서는 편집 중인 탭을 보존하고 새 탭에서 전환합니다.

Kubernetes 계열 컨테이너 플랫폼의 API 문서를 모아 만든, 검색 가능한 **API 레퍼런스 북**입니다.
데이터는 공개된 OpenShift Container Platform 5.0 / 4.22 / 4.21 / 4.20 API 문서(Apache License 2.0)에서 수집했습니다.
**배포 주소: <https://yjj3019.github.io/OCP-APIBook/>**

[5.0 공식 API 문서](https://docs.redhat.com/en/documentation/openshift_container_platform/5.0/html/api_overview/index) · [버전별 원본 페이지와 수집 경로](tools/refresh/sources.json)

외부 서버나 빌드 도구 없이 정적 파일만으로 동작합니다(Node.js는 로컬 서버용).

> **저장소 소유자 할 일**: 제품 이름은 "API Book"으로 바뀌었지만 저장소 이름(`yjj3019/OCP-APIBook`)과 Pages 주소는 아직 그대로입니다. 저장소 이름은 소유자만 바꿀 수 있습니다(**Settings → General → Repository name**). 이름을 바꾸면 Pages 주소가 바뀌므로 이 README의 링크와 경로(`/OCP-APIBook/`)도 함께 고쳐야 합니다. 그 전까지는 현재 링크가 그대로 동작합니다.

## 실행

로컬에서는 저장소 폴더의 `index.html`을 브라우저로 직접 열 수 있습니다. 아래 명령으로 로컬 서버를 실행하면 파일 무결성 검사와 서비스 워커도 사용할 수 있습니다.

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

Claude Code에서는 Node.js가 설치된 환경에서 이 저장소의 루트 디렉터리를 열고 `claude`를 실행합니다. 프로젝트 설정 [`.mcp.json`](.mcp.json)에 `api-book`이 등록되어 있습니다. 처음 연결할 때 승인 요청이 표시되면 서버 이름을 확인하세요. `/mcp`에서 연결 상태를 볼 수 있습니다.

다른 AI 클라이언트가 로컬 MCP(stdio)를 지원하면 서버 이름은 `api-book`, 실행 명령은 `node`, 인자는 이 저장소의 `mcp/server.js` 절대 경로로 지정합니다. 클라이언트가 서버 프로세스를 시작합니다. API 키나 클러스터 자격 증명은 필요하지 않습니다.

연결 후 “API Book에서 4.22 Route의 `spec.tls` 하위 필드와 필수 여부를 알려줘”라고 물어보세요. AI는 `get_fields`에 `{"api":"route.openshift.io/Route","version":"4.22","path":"spec.tls"}`를 전달해 조회한 필드와 하위 필드의 필수 여부, 리소스 API 버전, 같은 릴리스의 공식 문서 링크를 한 번에 확인할 수 있습니다.

| 도구 | 역할 |
|---|---|
| `search_apis` | 키워드 검색(한글·영문·Kind·필드 경로·제약 문장), 버전 무관 통합 결과 |
| `list_apis` | 분류·범위·제약 유형별 목록과 개수 |
| `get_api` | 설명, 제공 버전, 호환성 레벨, 엔드포인트, 최상위 필드 |
| `get_fields` | 중첩 필드 상세(`spec.tls`, 배열은 `spec.rules[]`) |
| `get_constraints` | 제약·제한 사항과 적용 버전. `version`을 지정하면 해당 릴리스의 필드 경로와 개수를 반환 |
| `compare_versions` | 수록 버전 사이 필드·타입·필수·엔드포인트 차이 |
| `generate_manifest` | 필수 필드만 채운 YAML 뼈대 |
| `validate_manifest` | 여러 YAML·JSON 문서의 릴리스별 필드 검증 |
| `get_catalog_status` | 수록 원본 커밋, 날짜, 문서 주소 |

`node mcp/smoke.js` 로 stdio 왕복 테스트를 돌릴 수 있습니다. 제약 사항은 웹 화면과 같은 추출 결과라서 같은 한계가 있습니다.

## AI 스킬

Claude Code, Codex, Grok Build에서 같은 [OpenShift API Book 스킬](skills/ocp-api-book/SKILL.md)을 사용할 수 있습니다. 저장소 루트에서 `node tools/install-api-skill.js`를 한 번 실행하면 사용자 스킬 폴더에서 이 체크아웃을 참조하므로 다른 프로젝트에서 코딩할 때도 조회할 수 있습니다. 체크아웃은 설치한 위치에 유지하세요.

| 클라이언트 | 설치 경로 | 직접 호출 |
|---|---|---|
| Claude Code | `~/.claude/skills/ocp-api-book` (사용자 지정 `CLAUDE_CONFIG_DIR` 지원) | `/ocp-api-book` |
| Codex CLI·IDE | `~/.agents/skills/ocp-api-book` | `$ocp-api-book` |
| Grok Build CLI | Codex와 같은 `~/.agents/skills/ocp-api-book` | `/ocp-api-book` |

“OpenShift 4.22에서 Route에 edge TLS를 설정하는 Helm 템플릿을 작성해줘”처럼 요청하면 에이전트가 작업에 맞춰 스킬을 선택할 수 있습니다. 호스트의 자동 선택은 요청에 따라 달라집니다. 같은 스킬을 지정하려면 위 표의 호출명을 사용하세요. 스킬을 거치지 않고 MCP의 `get_fields`를 직접 호출해도 로컬 CLI와 같은 필드 정보와 공식 출처를 받습니다.

```sh
node skills/ocp-api-book/scripts/query.cjs get_fields api=route.openshift.io/Route version=4.22 path=spec.tls
```

## 기능

- **통합 검색**: 같은 API는 버전과 관계없이 한 번만 나오고, 제공 버전과 **제약·제한 사항**이 함께 표시됩니다. 한글·영문·약어(`mcp`, `pvc`)·오타·`apiVersion`·중첩 필드 경로(`spec.tls.termination`)·제약 문장(`deprecated`, `immutable`)까지 찾습니다. 분류, 범위, 안정성(GA/Beta/Alpha), 제약 유무로 거를 수 있습니다.
- **제약·제한 사항**: 원문 설명 문장에서 추출한 폐지 예정, 변경 불가 필드, 미리보기·기능 게이트, 싱글턴 이름, 상호 배타, 조건부 필드, 값 범위와 호환성 레벨, 그리고 버전별 필드·타입·엔드포인트 차이.
- **커맨드 팔레트**: `Ctrl K` 또는 `/` 로 어디서나 API·필드·가이드·명령을 검색합니다.
- **API 상세**: 설명, 중첩 필드 트리(제약 표시 포함), 엔드포인트별 파라미터·본문·응답, 구문 강조된 YAML / `oc` / REST 예시, 관계도.
- **버전 비교**: 버전 사이에 추가·삭제·변경된 API와 필드 차이.
- **토폴로지**에서 API 간 연결을 3D로 탐색합니다. 드래그나 방향키로 회전하고 노드를 선택하면 API 설명과 연결 목록이 열립니다.
- **API 설계 시뮬레이터**: 스펙 기반 폼으로 리소스를 설계하면 YAML이 만들어지고, 필수 값·타입·알 수 없는 필드를 검증합니다. 생성·조회·수정·삭제 요청에 서버가 어떻게 응답할지(201/400/401/403/404/409/422)를 가상으로 보여줍니다. 실제 클러스터에는 아무것도 보내지 않습니다.
- **그 밖에**: 즐겨찾기·최근 본 API, 라이트/다크/시스템 테마, 모바일 대응, 단축키(`?` 로 목록 보기).

## 배포 절차

```
node build.js && node tools/test-build.js
```

데이터 빌드는 스탬프도 함께 갱신합니다. 코드·CSS만 고친 뒤에는 `tools/stamp.js` 로 `?v=` 해시와 `sw.js` 를 다시 만들어야 합니다. 잊으면 GitHub Actions 배포가 "스탬프가 최신이 아님" 오류로 멈춥니다(배포 전에 문법 검사·스탬프 확인·MCP 스모크 테스트를 돌립니다).

API 문서 현행화는 `npm ci --prefix tools/refresh` 후 `python tools/refresh/run.py`로 실행합니다. 등록된 릴리스의 공식 문서 원본을 수집하고 전체 카탈로그를 검증·재생성합니다. 출처와 자동 실행 주기는 [수집 안내](tools/README.md)에서 확인할 수 있습니다.

서비스 워커는 새 버전을 받아도 열린 탭을 모두 닫거나 새로 열었을 때 바뀝니다(열린 탭의 옛 코드와 섞이지 않게).

## 구성

| 경로 | 역할 |
|---|---|
| `index.html`, `app.css`, `sim.css` | 셸 마크업과 디자인 시스템 |
| `core.js` | 상태·저장소·지연 로딩·통합 검색 엔진·라우터 |
| `views.js` | 홈, 탐색, API 상세, 버전 비교, 가이드, 토폴로지·시뮬레이터 연결 |
| `boot.js` | 아이콘 채우기, 앱 시작, 서비스 워커 등록 |
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

- **서버**: 기본은 로컬 전용(`127.0.0.1`)이며 `Host` 헤더를 검사합니다(DNS rebinding 방어). Pages와 공유하는 공개 파일 목록과 `data/`의 카탈로그 파일명 규칙으로 서빙 대상을 제한하고 `tools/`, `_scrape/`, 숨김 파일, 개발용 파일은 대소문자·경로 우회와 무관하게 거부합니다. 압축 캐시는 96MB로 제한되고 타임아웃·연결 수 제한이 있습니다.
- **CSP**: 서버 헤더와 HTML 메타 정책이 같은 출처의 스크립트와 SHA-256으로 고정한 시작 코드 하나를 허용합니다. 시작 코드는 웹에서 CSS와 JavaScript의 무결성 검사를 활성화하고, `file://`에서는 같은 폴더의 파일을 직접 불러옵니다.
- **원문 HTML**: 가이드 본문은 허용 태그·속성만 남기고 렌더링합니다.
- **캐시**: 페이지는 JavaScript, CSS, 데이터 파일마다 SHA-256을 URL과 무결성 값으로 사용합니다. 로컬 서버는 요청한 해시와 일치하는 파일에 장기 캐시를 허용합니다. 새 배포로 이전 파일을 불러올 수 없을 때는 페이지를 새로고침하세요.
- **외부 요청**: 없습니다. 웹 글꼴은 포함하지도 불러오지도 않으며 모든 글자는 사용자 기기의 시스템 글꼴로 표시합니다. 서비스 워커(`sw.js`)가 재방문 속도와 오프라인 동작을 돕습니다(`?nosw` 로 끌 수 있음). 검색어와 입력은 외부로 나가지 않습니다.
- **저장소 사용**: 즐겨찾기·최근 본 API·테마·버전은 브라우저 `localStorage`에, 자동 저장한 시뮬레이터 초안은 `IndexedDB`에 보관합니다. 해당 릴리스의 시뮬레이터를 열면 이전 초안을 합칩니다. 같은 이름의 편집 내용이 다르면 두 편집본을 보존합니다.

## 라이선스와 상표

- **자체 코드와 문서**는 [MIT License](LICENSE)를 적용합니다. 웹 대시보드, MCP 서버, CLI와 AI 스킬, 빌드·테스트 도구가 포함됩니다.
- **수록 카탈로그(`data/`)와 원문을 인용하는 제약 검토 데이터(`tools/cons-audited.json`, `tools/cons-deny.json`, `tools/cons-retype.json`)**는 [Apache License 2.0](LICENSE-APACHE)을 따릅니다. OpenShift·Kubernetes 원문 출처, 저작권 고지, 변경 사항을 [NOTICE](NOTICE)에 담았습니다. 이 데이터를 재배포할 때는 Apache-2.0 전문과 필요한 고지를 함께 제공하세요.

비공식 프로젝트이며 원문 문서의 저작자·상표권자와 제휴하거나 그들의 보증을 받지 않았습니다. 제품 이름은 원문 문서의 출처를 밝히기 위해서만 씁니다.
원문 Legal Notice의 "수정본은 상표를 제거해야 한다"는 조건에 따라, 빌드 때 `tools/trademark.js` 가 사람이 읽는 설명 문장(API·필드 설명, 가이드 제목·본문)의 제품·회사 이름을 "platform", "host operating system", "vendor" 같은 일반 명칭으로 바꿉니다. 화면에서는 프로젝트 코드와 수록 데이터의 라이선스를 각각 안내합니다.
상호운용을 위해 API 그룹·Kind 이름과 경로(예: `route.openshift.io`), 네임스페이스, 열거형 값(`RHCOS`, `RHEL` 등), 원문 URL 같은 **기술 식별자는 바꾸지 않습니다**(자세한 내용은 NOTICE).

### 법적 고지에 대한 참고

위 조치(중립적인 제품 이름, 설명 문장의 상표 치환, 출처를 알 수 없는 웹 글꼴 제거)는 확인된 두 조건, 즉 원문 문서의 "수정본은 상표를 제거해야 한다"는 조건과 글꼴 라이선스의 예약 글꼴 이름 조건에 대한 위험을 줄이기 위한 것입니다. 법률 자문이 아니며 문제가 없다는 보장도 아닙니다. 확실히 하려면 법률 전문가와 상의하세요. `RHCOS`/`RHEL` 같은 열거형 값과 API 그룹 이름은 기술 식별자로 남아 있습니다.

## 데이터 출처와 한계

- API 설명·필드·엔드포인트는 위 원본 문서에서 수집했습니다. 설명은 원문(영문)이며, 상표 이름만 위와 같이 일반 명칭으로 바꿨습니다.
- **제약·제한 사항은 설명 문장에서 정규식으로 추출**합니다(`tools/cons-rules.js`). 화면·MCP에 나가는 고유 문장은 모두 사람이(또는 에이전트가 문장마다) 판정한 기준선(`tools/cons-audited.json`)에 있고, 오탐은 `tools/cons-deny.json`, 유형 오류는 `tools/cons-retype.json` 으로 바로잡았습니다. 원문을 다시 수집하거나 규칙을 바꾸면 `node tools/cons-audit.js` 가 새(미검토) 문장만 보여 주며, 배포 CI 는 `--strict` 로 미검토 문장이 있으면 멈춥니다. 정규식 추출이라 일부 제약은 여전히 빠질 수 있고(특히 긴 문장 안의 제약), 정확한 내용은 원문을 확인하세요.
- 토폴로지의 **"일반 관계"(점선)** 는 문서에서 추출한 것이 아니라 Kubernetes 계열 플랫폼의 일반적인 구조를 바탕으로 정리한 것입니다.
- 사용 예시(YAML, `oc`, REST)는 이름·그룹/버전·필수 필드로 만든 기본 틀입니다.
- 시뮬레이터의 검증과 가상 응답은 문서의 스키마 규칙만 사용합니다. 어드미션 웹훅, 기본값 적용, RBAC, 실제 충돌 검사는 반영하지 않습니다. "허용 값" 경고는 설명 문장에서 뽑은 힌트라 틀릴 수 있습니다.
- 원문 4.20 API index에 `IPAddressClaim` 행이 중복되어 하나만 남겼습니다.

## 설계와 업그레이드 검토

- 시뮬레이터에서 여러 YAML 문서를 `---`로 구분해 가져오면 릴리스의 `apiVersion`과 `kind`에 맞춰 문서별 필드 오류를 확인할 수 있습니다. 지원하는 리소스는 각각 편집 탭에 열립니다.
- Secret, TLS 개인 키가 있는 Route, 토큰이 있는 TokenReview, 직접 입력한 패치 본문은 초안 전체를 메모리에서만 편집합니다. 리소스 목록과 `kubectl.kubernetes.io/last-applied-configuration`에 포함된 값도 확인하며, 해석할 수 없는 적용 기록은 메모리에만 둡니다. 두 탭이 같은 초안을 수정하면 새로고침 후 충돌 보관본과 현재 초안을 확인할 수 있습니다. 다른 리소스에 인증 정보가 있다면 입력 전에 자동 저장을 끄세요. 저장본 지우기는 모든 릴리스의 시뮬레이터 초안을 지우고 자동 저장을 끕니다.
- 버전 비교에서 기준·대상 릴리스를 선택하면 필수 여부와 문서 제약의 변경을 확인할 수 있습니다. **내 YAML 업그레이드 영향 검사**는 입력을 저장하지 않고 문서마다 새로 발생하거나 해소된 오류·경고를 보여 줍니다. 스킬과 MCP는 `compare_versions`, `validate_manifest`, `get_catalog_status`를 제공합니다.
- 홈의 **카탈로그 원본과 갱신 상태**에서 수록 원본과 최신 원본을 비교하거나 갱신 PR을 열 수 있습니다. 최신 원본 조회 버튼을 누를 때만 GitHub에 원본 커밋을 요청합니다.
- 전체 토폴로지의 **두 API 사이의 관계 경로 찾기**에서 출발과 도착을 선택하면 켜 둔 관계 종류를 따라 최단 경로와 단계별 근거가 표시됩니다.
