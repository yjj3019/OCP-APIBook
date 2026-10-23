# OCP API Book

Red Hat OpenShift Container Platform **4.22 / 4.21 / 4.20** API 문서를 수집해 만든, 검색 가능한 **API 레퍼런스 북**입니다.
**배포 주소: <https://yjj3019.github.io/OCP-APIBook/>**

원본: <https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html-single/api_overview/index>

외부 서버나 빌드 도구 없이 정적 파일만으로 동작합니다(Node.js는 로컬 서버용).

## 실행

```
node serve.js                    # http://localhost:8080 (로컬 전용)
node serve.js 9000               # 다른 포트
node serve.js 9000 --host 0.0.0.0   # 같은 네트워크의 다른 기기에서도 접속
```

서버는 brotli/gzip 압축과 ETag 재검증(304)을 지원합니다. 첫 화면 전송량은 압축 없이 약 2.2MB, 압축하면 약 0.19MB입니다.

## GitHub Pages 배포

`main` 에 push 하면 `.github/workflows/pages.yml` 이 정적 파일만 골라 배포합니다. 처음 한 번 저장소 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions** 로 지정하세요. 주소는 <https://yjj3019.github.io/OCP-APIBook/> 입니다. 하위 경로(`/OCP-APIBook/`)에서 서비스 워커·글꼴·데이터가 정상 동작함을 확인했습니다.

## MCP 서버

같은 데이터를 MCP(Model Context Protocol) 서버로도 쓸 수 있습니다. 의존성 없이 `node` 만 있으면 되고, 읽기 전용이며 네트워크·클러스터에 접근하지 않습니다(stdio).

```
claude mcp add ocp-api-book -- node /경로/OCP-APIBook/mcp/server.js
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

코드·CSS·폰트·데이터를 고친 뒤에는 `tools/stamp.js` 로 `?v=` 해시와 `sw.js` 를 다시 만들어야 합니다.

## 구성

| 경로 | 역할 |
|---|---|
| `index.html`, `app.css`, `sim.css` | 셸 마크업과 디자인 시스템 |
| `core.js` | 상태·저장소·지연 로딩·통합 검색 엔진·라우터 |
| `views.js` | 홈, 탐색, API 상세, 버전 비교, 가이드, 토폴로지·시뮬레이터 연결 |
| `boot.js` | 아이콘 채우기, 폰트 비차단 로드, 앱 시작(인라인 스크립트 없음) |
| `palette.js` | 커맨드 팔레트, 단축키, 도움말 |
| `ui-kit.js` | 아이콘 60종과 YAML/JSON/bash 구문 강조 |
| `search.js` | 검색 엔진(역색인, 한글 키워드 사전, 오타 보정) |
| `graph.js` / `viz.js` / `topo.js` | 관계 데이터, 캔버스 그래프 엔진, 토폴로지 화면 |
| `sim.js` | 설계 시뮬레이터(YAML 파서, 스키마 검증, 요청·응답 시뮬레이션) |
| `data/` | 데이터베이스(`build.js` 가 생성). `merged.js`(통합·제약), `legacy.js`, `<버전>.js`, `<버전>.fidx.js`, `<버전>.fields.<책>.js (책별 분할)` |
| `build.js` | 수집 원본(`_scrape/`) → `data/` 변환, 제약 추출 |
| `tools/` | 수집 스크립트, 빌드 테스트(`test-build.js`), 전송량 측정(`perf.js`) |
| `mcp/` | MCP 서버(`server.js`)와 스모크 테스트(`smoke.js`) |
| `serve.js` | 압축·캐시·보안 헤더를 갖춘 정적 서버 |

그래프·시뮬레이터·버전별 큰 데이터는 필요할 때만 불러옵니다.

## 보안과 운영

- **서버**: 기본은 로컬 전용(`127.0.0.1`)이며 `Host` 헤더를 검사합니다(DNS rebinding 방어). 앱이 쓰는 파일(루트 직하 파일과 `data/` 하위)만 허용 목록으로 서빙하고 `tools/`, `_scrape/`, 숨김 파일, 개발용 파일은 대소문자·경로 우회와 무관하게 거부합니다. 압축 캐시는 96MB로 제한되고 타임아웃·연결 수 제한이 있습니다.
- **CSP**: 서버가 `script-src 'self'` 등 엄격한 Content-Security-Policy 를 보냅니다. `index.html` 에도 같은 정책이 `<meta>` 로 들어 있어 정적 호스팅에서도 적용됩니다(이 경우 `frame-ancestors` 는 적용되지 않음). 인라인 스크립트와 이벤트 핸들러는 쓰지 않습니다.
- **원문 HTML**: 가이드 본문은 허용 태그·속성만 남기고 렌더링합니다.
- **캐시**: 모든 파일은 ETag 로 재검증합니다. `data/` 파일은 `merged.js` 의 `build` 해시를 `?v=` 로 붙여 요청하므로(데이터가 바뀌면 값이 바뀜) 장기 캐시(immutable)가 안전합니다.
- **외부 요청**: 없습니다. IBM Plex 글꼴(OFL)은 `fonts/` 에 포함되어 있고, 한글은 시스템 글꼴을 씁니다. 서비스 워커(`sw.js`)가 재방문 속도와 오프라인 동작을 돕습니다(`?nosw` 로 끌 수 있음). 검색어와 입력은 외부로 나가지 않습니다.
- **저장소 사용**: 즐겨찾기·최근 본 API·테마·버전·시뮬레이터 초안이 브라우저 `localStorage` 에 저장됩니다(서버로 전송되지 않음).

## 라이선스

[Apache License 2.0](LICENSE). 원문(Red Hat OpenShift 문서)이 Apache License 2.0 으로 공개되어 있어 같은 라이선스를 따릅니다.
수집 데이터는 원문의 파생물이며 출처와 변경 사항은 [NOTICE](NOTICE)에 적었습니다.

비공식 프로젝트입니다. Red Hat, OpenShift 는 Red Hat, Inc.의 상표이며 소프트웨어를 식별하기 위해서만 이름을 사용합니다. 원문 Legal Notice에는 "수정본은 Red Hat 상표를 제거해야 한다"는 조건이 있으므로, 공개·재배포 전에 [NOTICE](NOTICE)를 확인하세요.

## 데이터 출처와 한계

- API 설명·필드·엔드포인트는 위 원본 문서에서 수집했습니다. 설명은 원문(영문) 그대로입니다.
- **제약·제한 사항은 설명 문장에서 정규식으로 추출**한 뒤, 고유 문장 762개를 전수 감사해 오탐 패턴(`build.js` 의 `DROP_ALL`·`BAD_BY`)과 개별 제외 문장(`tools/cons-deny.json`)을 반영했습니다. 감사한 문장 기준으로 오탐은 모두 제거했지만, 새 원문을 수집하면 다시 감사가 필요합니다. 유형 분류가 어색한 문장이 소수 남아 있을 수 있으니 정확한 내용은 원문을 확인하세요.
- 토폴로지의 **"일반 관계"(점선)** 는 문서에서 추출한 것이 아니라 OpenShift/Kubernetes의 일반적인 구조를 바탕으로 정리한 것입니다.
- 사용 예시(YAML, `oc`, REST)는 이름·그룹/버전·필수 필드로 만든 기본 틀입니다.
- 시뮬레이터의 검증과 가상 응답은 문서의 스키마 규칙만 사용합니다. 어드미션 웹훅, 기본값 적용, RBAC, 실제 충돌 검사는 반영하지 않습니다. "허용 값" 경고는 설명 문장에서 뽑은 힌트라 틀릴 수 있습니다.
- 원문 4.20 API index에 `IPAddressClaim` 행이 중복되어 하나만 남겼습니다.
