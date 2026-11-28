---
name: ocp-api-book
description: OpenShift(OCP) API의 필수 필드, 정확한 YAML 경로, apiVersion, REST 경로, 릴리스별 제약·차이를 확인한다. Route TLS 같은 단독 스키마 질문과 Operator·클라이언트·YAML·Helm 코드 작성 및 리뷰에서 버전별 공식 근거가 필요할 때 사용한다.
---

# OpenShift API Book

질문이나 프로젝트에서 OCP 릴리스를 확인하고, 명시된 릴리스를 조회 인자에 그대로 전달한다. 버전을 알 수 없어 기본값을 사용하면 응답의 실제 `version`을 밝힌다. 동명 Kind가 있으면 매니페스트의 API 그룹으로 좁힌다. 그룹을 결정할 단서가 없으면 도구가 반환한 후보를 제시한다.

필드 질문은 `get_fields`에 리소스와 질문 속 경로를 그대로 전달한다. 예를 들어 `spec.tls: {}`를 리뷰할 때 `path=spec.tls` 한 번으로 TLS 자체의 필수 여부(`field.required`)와 빈 객체에 빠진 필드(`requiredChildPaths`)를 확인할 수 있다. 개별 속성은 `path=spec.rules[].host`처럼 조회한다. 배열 원소는 `itemsPath`, 맵 값은 `valuesPath`를 따른다. `pathKind: mapValue`는 임의 키에 대응하는 값이다. 최상위·원소·맵 값 경로에서는 `field`가 `null`이다. 하위 필수 목록은 카탈로그에 해당 객체 정의가 있을 때만 `requiredChildPaths`로 제공된다. `fields: []`는 수록된 하위 속성이 없다는 뜻이다.

연결된 `api-book` MCP를 사용한다. MCP 연결 실패 시 허용된 로컬 실행 환경에서는 이 스킬의 `scripts/query.cjs`에 같은 도구 이름과 인자를 전달한다. 경로·릴리스 오류는 해당 입력을 확인한다. 두 경로 모두 사용할 수 없으면 확인하지 못한 항목과 원인을 알린다.

| 알고 싶은 내용 | 조회 방법 |
|---|---|
| 이름을 모르는 리소스, 필드명, 한글 키워드 | `search_apis`의 `query`. 버전을 생략하면 구버전 전용 API와 필드도 찾는다. 결과의 `id`와 `version`을 상세 조회에 함께 전달한다. `fieldVersions`에는 검색한 필드를 함께 제공하는 릴리스가 표시된다. 분류나 범위별 목록·개수는 `list_apis`를 사용한다. |
| 특정 리소스의 설명, REST 경로, 공식 문서 | `get_api`에 `api`와 문서 `version`을 전달한다. 같은 Kind가 여러 그룹에 있으면 `group/Kind`를 사용한다. 코어 그룹은 `core/Kind`다. |
| 하위 필드의 타입과 필수 여부 | `get_fields` 결과의 `field.path`와 `field.required`를 읽는다. 객체의 하위 필드는 각 `fields[].path`와 `required`를 사용한다. |
| 적용 제약이나 업그레이드 시 변경점 | 특정 릴리스의 제약은 `get_constraints`에 `api`와 `version`을 전달한다. 전체 릴리스의 제약은 `version`을 생략한다. 특정 두 릴리스의 변경은 `compare_versions`에 `api`, `from`, `to`를 전달한다. |
| 리소스 YAML 예시 | `generate_manifest`에 리소스와 문서 버전을 전달한다. 결과에서 사용자가 채울 자리표시자를 짚어 준다. |

답은 사용자의 결정에 필요한 결론부터 쓴다. 스키마 판단에는 조회한 OCP `version`, 리소스 `apiVersion`, 필드 경로와 같은 응답의 공식 `docUrl`을 함께 제시한다. `required`는 바로 위 객체가 주어졌을 때의 스키마 요구사항이다. 설명의 기본값과 필수 표시는 구별한다. `descriptionTruncated`가 표시된 하위 필드는 정확한 경로로 다시 조회하면 설명 전문을 볼 수 있다. 값에 따라 추가되는 조건은 설명이나 `get_constraints`에서 근거를 확인한다. 릴리스 비교에서는 `sources`의 각 버전 공식 링크를 사용한다. 요청한 버전이나 리소스가 없으면 도구가 안내한 제공 범위를 밝힌다.

제약 문장은 문서에서 추출한 요약이다. 경로별 적용 버전은 `pathsByVersion`이 있으면 해당 버전의 경로를 사용하고, 대표 경로는 `primaryPathVersions`로 확인한다. 유형별 `shownCounts`가 `counts`보다 작으면 일부 문장만 제공된다는 점을 밝힌다.

## 로컬 조회

Node.js와 API Book 저장소가 있으면 아래 명령을 실행할 수 있다. 예시는 저장소 루트 기준이다. 다른 작업 디렉터리에서는 이 스킬에 포함된 [조회 스크립트](scripts/query.cjs)의 절대 경로를 사용한다. 스킬 폴더만 복사해 설치한 경우에는 환경 변수 `OCP_API_BOOK_ROOT`를 API Book 저장소 루트로 지정한다.

```sh
node skills/ocp-api-book/scripts/query.cjs get_fields api=route.openshift.io/Route version=4.22 path=spec.tls
node skills/ocp-api-book/scripts/query.cjs compare_versions api=insights.openshift.io/DataGather
node skills/ocp-api-book/scripts/query.cjs --list
```

공백이 있는 인자는 `"query=mutually exclusive"`처럼 한 인자로 전달한다. `--list`는 현재 도구의 입력 스키마를 출력한다.

## 매니페스트 검증과 수록 원본

작성한 YAML은 `validate_manifest`에 `version`과 `manifest`를 전달해 문서별 오류와 경고를 확인한다. 필드의 정확한 경로를 인용하고 클러스터의 어드미션 결과와 구분한다. 민감한 실제 값은 예시 값으로 대체한다. 업그레이드 검사에는 `version` 대신 `from`과 `to`를 함께 전달해 새 진단과 해소된 진단을 확인한다. 구조가 같은 API도 `compare_versions`의 `constraintChanges`에 문서 제약 차이가 있을 수 있다. 로컬 CLI는 `manifest=-`로 표준 입력을 읽는다.

```sh
node skills/ocp-api-book/scripts/query.cjs validate_manifest version=5.0 manifest=- < example.yaml
node skills/ocp-api-book/scripts/query.cjs compare_versions api=batch/CronJob from=4.22 to=5.0
node skills/ocp-api-book/scripts/query.cjs get_catalog_status version=5.0
```
