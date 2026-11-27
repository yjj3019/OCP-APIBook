---
name: ocp-api-book
description: OpenShift(OCP) 코드, Operator·컨트롤러, API 클라이언트 또는 YAML·Helm 매니페스트를 작성·수정·리뷰하면서 리소스 스키마가 필요할 때 사용한다. 로컬 카탈로그가 제공하는 OCP 릴리스별 apiVersion, 필수 필드, REST 경로, 제약 및 버전 차이를 조회한다.
---

# OpenShift API Book

연결된 `api-book` MCP 도구를 우선 사용한다. MCP 연결이 없고 로컬 실행이 가능하면 아래 조회 스크립트로 같은 카탈로그를 읽는다.

코딩 중에는 프로젝트가 대상으로 하는 OpenShift 릴리스와 리소스 그룹을 확인하고, 구현에 필요한 경로나 필드를 조회해 코드·테스트·매니페스트에 반영한다. 예를 들어 Route TLS 설정을 추가할 때는 `spec`에서 `tls` 자체의 필수 여부를 확인하고, `spec.tls`에서 하위 필드의 필수 여부를 확인한다. 프로젝트가 카탈로그에 없는 릴리스를 대상으로 하면 도구 입력 스키마의 `version.enum`에서 조회 가능한 버전을 확인하고 지원 범위를 밝힌다.

| 알고 싶은 내용 | 조회 방법 |
|---|---|
| 이름을 모르는 리소스, 필드명, 한글 키워드 | `search_apis`의 `query`. 버전을 생략하면 구버전 전용 API와 필드도 찾는다. 정확한 필드명·경로를 검색했을 때 `fieldVersions`가 있으면 그 릴리스에서 상세를 조회한다. 분류나 범위별 목록·개수는 `list_apis`를 사용한다. |
| 특정 리소스의 설명, REST 경로, 공식 문서 | `get_api`에 `api`와 문서 `version`을 전달한다. 같은 Kind가 여러 그룹에 있으면 `group/Kind`를 사용한다. 코어 그룹은 `core/Kind`다. |
| 하위 필드의 타입과 필수 여부 | `get_fields`에 **부모 경로**를 전달한다. 예를 들어 `spec.tls.termination`은 `path=spec.tls` 결과에서 읽는다. 배열 원소의 하위 경로는 `spec.rules[]` 형식이다. |
| 적용 제약이나 업그레이드 시 변경점 | `get_constraints`와 `compare_versions`에는 `api`를 전달한다. 반환된 버전 목록에서 질문에 해당하는 릴리스를 선택한다. |
| 리소스 YAML 예시 | `generate_manifest`에 리소스와 문서 버전을 전달한다. 결과에서 사용자가 채울 자리표시자를 짚어 준다. |

답변에는 문서 릴리스(예: 4.22)와 리소스의 `apiVersion`(예: `route.openshift.io/v1`)을 구별해 적는다. 출처가 필요하면 같은 버전의 `get_api.docUrl`을 사용한다. 요청한 릴리스에 리소스가 없으면 제공 버전을 알려 준다.

제약 문장은 문서에서 추출한 요약이다. 경로별 적용 버전은 `pathsByVersion`이 있으면 해당 버전의 경로를 사용하고, 대표 경로는 `primaryPathVersions`로 확인한다. 유형별 `shownCounts`가 `counts`보다 작으면 일부 문장만 제공된다는 점을 밝힌다.

## 로컬 조회

Node.js와 API Book 저장소가 있으면 아래 명령을 실행할 수 있다. 예시는 저장소 루트 기준이다. 다른 작업 디렉터리에서는 이 스킬에 포함된 [조회 스크립트](scripts/query.cjs)의 절대 경로를 사용한다. 스킬 폴더만 복사해 설치한 경우에는 환경 변수 `OCP_API_BOOK_ROOT`를 API Book 저장소 루트로 지정한다.

```sh
node skills/ocp-api-book/scripts/query.cjs get_fields api=route.openshift.io/Route version=4.22 path=spec.tls
node skills/ocp-api-book/scripts/query.cjs compare_versions api=insights.openshift.io/DataGather
node skills/ocp-api-book/scripts/query.cjs --list
```

공백이 있는 인자는 `"query=mutually exclusive"`처럼 한 인자로 전달한다. `--list`는 현재 도구의 입력 스키마를 출력한다.
