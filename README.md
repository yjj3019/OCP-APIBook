# OCP API Book

Red Hat OpenShift Container Platform **4.22 / 4.21 / 4.20** API 문서를 수집해 만든, 검색 가능한 **API 레퍼런스 북**입니다.
원본: <https://docs.redhat.com/en/documentation/openshift_container_platform/4.22/html-single/api_overview/index>

외부 서버나 빌드 도구 없이 정적 파일만으로 동작합니다(Node.js는 로컬 서버용).

## 실행

```
node serve.js        # http://localhost:8080
node serve.js 9000   # 다른 포트
```

## 기능

- **검색**: 한글·영문·약어(`mcp`, `pvc`)·오타·`apiVersion`·중첩 필드 이름(`spec.tls.termination`)까지 찾습니다. 단어→문서 역색인으로 동작합니다.
- **버전 선택**: 우측 상단에서 4.22 / 4.21 / 4.20 을 전환합니다. 버전마다 별도 데이터를 필요할 때만 불러옵니다.
- **API 상세**: 설명, 필수 필드, 중첩 필드 트리, 엔드포인트별 파라미터·본문·응답, YAML / `oc` / REST 예시(중첩 필수 필드 포함).
- **버전 비교**: 버전 사이에 추가·삭제·변경된 API 목록, 그리고 한 API의 필드·엔드포인트 차이.
- **토폴로지**: API 간 연결을 그래프로 보여주고, 노드를 선택하면 설명과 연결 목록을 표시합니다.
- **API 설계 시뮬레이터**: 스펙 기반 폼으로 리소스를 설계하면 YAML이 만들어지고, 필수 값·타입·알 수 없는 필드를 검증합니다. 생성·조회·수정·삭제 요청에 서버가 어떻게 응답할지(201/400/401/403/404/409/422)를 가상으로 보여줍니다. 실제 클러스터에는 아무것도 보내지 않습니다.
- **가이드**: API 지원 단계, 호환성 정책, kubelet 로그 설정 문서.

## 구성

| 경로 | 역할 |
|---|---|
| `index.html`, `sim.css` | 화면과 라우팅 |
| `search.js` | 검색 엔진(역색인, 한글 키워드 사전, 오타 보정) |
| `graph.js` / `viz.js` / `topo.js` | 관계 데이터, 캔버스 그래프 엔진, 토폴로지 화면 |
| `sim.js` | 설계 시뮬레이터(YAML 파서, 스키마 검증, 요청·응답 시뮬레이션) |
| `data/` | 버전별 데이터베이스(`build.js` 가 생성). `versions.js`, `<버전>.js`, `<버전>.fidx.js`, `<버전>.fields.js` |
| `build.js` | 수집 원본(`_scrape/`) → `data/` 변환 |
| `tools/` | 데이터 수집 스크립트와 사용법 |
| `serve.js` | 정적 서버 |

## 라이선스

[Apache License 2.0](LICENSE). 원문(Red Hat OpenShift 문서)이 Apache License 2.0 으로 공개되어 있어 같은 라이선스를 따릅니다.
수집 데이터는 원문의 파생물이며 출처와 변경 사항은 [NOTICE](NOTICE)에 적었습니다.

비공식 프로젝트입니다. Red Hat, OpenShift 는 Red Hat, Inc.의 상표이며 소프트웨어를 식별하기 위해서만 이름을 사용합니다. 원문 Legal Notice에는 "수정본은 Red Hat 상표를 제거해야 한다"는 조건이 있으므로, 공개·재배포 전에 [NOTICE](NOTICE)를 확인하세요.

## 데이터 출처와 한계

- API 설명·필드·엔드포인트는 위 원본 문서에서 수집했습니다. 설명은 원문(영문) 그대로입니다.
- 토폴로지의 **"일반 관계"(점선)** 는 문서에서 추출한 것이 아니라 OpenShift/Kubernetes의 일반적인 구조를 바탕으로 정리한 것입니다.
- 사용 예시(YAML, `oc`, REST)는 이름·그룹/버전·필수 필드로 만든 기본 틀입니다.
- 시뮬레이터의 검증과 가상 응답은 문서의 스키마 규칙만 사용합니다. 어드미션 웹훅, 기본값 적용, RBAC, 실제 충돌 검사는 반영하지 않습니다. "허용 값" 경고는 설명 문장에서 뽑은 힌트라 틀릴 수 있습니다.
- 원문 4.20 API index에 `IPAddressClaim` 행이 중복되어 하나만 남겼습니다.
