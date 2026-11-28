// SPDX-License-Identifier: Apache-2.0
/* API 관계 그래프 데이터. 브라우저(window.ApiGraph)와 Node 양쪽에서 동작 */
(function (root) {
  const locale = typeof module !== 'undefined' && module.exports ? require('./locale') : root.ApiBookLocale;
  const ui = locale.text;
  // 관계 종류. src: 'doc' = 이 문서의 텍스트에서 추출, 'name' = 이름 규칙, 'curated' = 일반적인 구조(문서 밖 지식)
  const TYPES = {
    mention: { label: ui('문서에서 언급'), src: 'doc' },
    curated: { label: ui('일반 관계'), src: 'curated' },
    same:    { label: ui('같은 이름'), src: 'name' },
    variant: { label: ui('이름 변형'), src: 'name' },
  };

  // [출발, 도착, 라벨]  — 'Kind@group' 으로 같은 이름 중 대상을 지정
  const R = 'rbac.authorization.k8s.io';
  const CURATED = [
    // 네트워크 노출
    ['Route', 'Service', ui('트래픽 전달')], ['Service', 'Pod', locale.choice('선택', 'Selects')], ['Service', 'Endpoints', ui('엔드포인트 생성')], ['Service', 'EndpointSlice', ui('슬라이스 생성')],
    ['IngressController', 'Route', ui('처리')], ['IngressController', 'Service', ui('LB 서비스 생성')], ['IngressController', 'DNSRecord', ui('DNS 레코드 생성')],
    ['Ingress@networking.k8s.io', 'Service', ui('전달')], ['Ingress@networking.k8s.io', 'IngressClass', ui('사용')],
    ['Gateway', 'GatewayClass', ui('사용')], ['HTTPRoute', 'Gateway', ui('연결')], ['GRPCRoute', 'Gateway', ui('연결')], ['HTTPRoute', 'Service', ui('전달')], ['GRPCRoute', 'Service', ui('전달')], ['BackendTLSPolicy', 'Service', ui('TLS 정책')], ['ReferenceGrant', 'Gateway', ui('교차 참조 허용')],
    ['NetworkPolicy', 'Pod', locale.choice('선택', 'Selects')], ['AdminNetworkPolicy', 'Namespace', ui('적용')], ['BaselineAdminNetworkPolicy', 'Namespace', ui('적용')], ['MultiNetworkPolicy', 'NetworkAttachmentDefinition', ui('적용')],
    ['EgressFirewall', 'Namespace', ui('적용')], ['EgressIP', 'Namespace', locale.choice('선택', 'Selects')], ['EgressIP', 'Pod', locale.choice('선택', 'Selects')], ['EgressService', 'Service', ui('이그레스 지정')], ['EgressQoS', 'Namespace', ui('적용')],
    ['UserDefinedNetwork', 'Namespace', ui('네트워크 제공')], ['ClusterUserDefinedNetwork', 'Namespace', ui('네트워크 제공')],
    // 워크로드
    ['Deployment', 'ReplicaSet', ui('생성')], ['ReplicaSet', 'Pod', ui('생성')], ['StatefulSet', 'Pod', ui('생성')], ['DaemonSet', 'Pod', ui('생성')], ['DaemonSet', 'ControllerRevision', ui('리비전 기록')],
    ['Job', 'Pod', ui('생성')], ['CronJob', 'Job', ui('주기 생성')], ['DeploymentConfig', 'ReplicationController', ui('생성')], ['ReplicationController', 'Pod', ui('생성')],
    ['HorizontalPodAutoscaler', 'Scale', ui('조정')], ['PodDisruptionBudget', 'Pod', ui('보호')],
    ['Pod', 'PersistentVolumeClaim', ui('볼륨 마운트')], ['Pod', 'ConfigMap', ui('설정 사용')], ['Pod', 'Secret', ui('비밀 사용')], ['Pod', 'ServiceAccount', ui('실행 계정')], ['Pod', 'Node', ui('스케줄됨')],
    ['DeploymentLog', 'DeploymentConfig', ui('로그')], ['DeploymentRequest', 'DeploymentConfig', ui('배포 요청')], ['DeploymentConfigRollback', 'DeploymentConfig', ui('롤백')],
    // 스토리지
    ['PersistentVolumeClaim', 'PersistentVolume', ui('바인딩')], ['PersistentVolumeClaim', 'StorageClass', ui('클래스 사용')], ['PersistentVolume', 'StorageClass', ui('클래스 지정')], ['StorageClass', 'CSIDriver', ui('프로비저너')],
    ['CSINode', 'CSIDriver', ui('드라이버 정보')], ['ClusterCSIDriver', 'CSIDriver', ui('관리')], ['VolumeSnapshot', 'VolumeSnapshotClass', ui('클래스 사용')], ['VolumeSnapshot', 'PersistentVolumeClaim', ui('원본')],
    ['VolumeSnapshotContent', 'VolumeSnapshot', ui('실제 스냅샷')], ['VolumeAttachment', 'PersistentVolume', ui('노드에 연결')],
    // 권한·인증
    ['RoleBinding@' + R, 'Role@' + R, ui('역할 부여')], ['ClusterRoleBinding@' + R, 'ClusterRole@' + R, ui('역할 부여')],
    ['RoleBinding@' + R, 'ServiceAccount', ui('주체')], ['RoleBinding@' + R, 'User', ui('주체')], ['RoleBinding@' + R, 'Group', ui('주체')],
    ['ClusterRoleBinding@' + R, 'ServiceAccount', ui('주체')], ['ClusterRoleBinding@' + R, 'User', ui('주체')], ['ClusterRoleBinding@' + R, 'Group', ui('주체')],
    ['SecurityContextConstraints', 'ServiceAccount', ui('허용 대상')], ['SecurityContextConstraints', 'User', ui('허용 대상')], ['SecurityContextConstraints', 'Group', ui('허용 대상')],
    ['Identity', 'User', ui('사용자 매핑')], ['UserIdentityMapping', 'User', ui('매핑')], ['UserIdentityMapping', 'Identity', ui('매핑')], ['Group', 'User', ui('구성원')],
    ['OAuthAccessToken', 'OAuthClient', ui('발급 클라이언트')], ['OAuthAccessToken', 'User', ui('사용자')], ['OAuthAuthorizeToken', 'OAuthClient', ui('발급 클라이언트')],
    ['OAuthClientAuthorization', 'OAuthClient', ui('승인')], ['OAuthClientAuthorization', 'User', ui('승인 사용자')], ['UserOAuthAccessToken', 'OAuthAccessToken', ui('조회')],
    ['ServiceAccount', 'Secret', ui('토큰')], ['TokenRequest', 'ServiceAccount', ui('토큰 발급')],
    // 프로젝트·쿼터
    ['Project@project.openshift.io', 'Namespace', ui('1:1 대응')], ['ProjectRequest', 'Project@project.openshift.io', ui('생성')], ['ProjectHelmChartRepository', 'Project@project.openshift.io', ui('소속')],
    ['ResourceQuota', 'Namespace', ui('제한')], ['LimitRange', 'Namespace', ui('제한')], ['ClusterResourceQuota', 'Namespace', ui('여러 네임스페이스 제한')], ['AppliedClusterResourceQuota', 'ClusterResourceQuota', ui('적용 결과')],
    // 머신·노드
    ['MachineSet', 'Machine', ui('생성')], ['ControlPlaneMachineSet', 'Machine', ui('생성')], ['Machine', 'Node', ui('대응')], ['MachineAutoscaler', 'MachineSet', ui('크기 조정')], ['ClusterAutoscaler', 'MachineAutoscaler', ui('연동')],
    ['MachineHealthCheck', 'Machine', ui('감시')], ['MachineHealthCheck', 'Node', ui('감시')],
    ['MachineConfigPool', 'MachineConfig', locale.choice('선택', 'Selects')], ['MachineConfigPool', 'Node', locale.choice('대상', 'Targets')], ['KubeletConfig', 'MachineConfigPool', locale.choice('대상', 'Targets')], ['ContainerRuntimeConfig', 'MachineConfigPool', locale.choice('대상', 'Targets')],
    ['MachineConfigNode', 'Node', ui('노드 상태')], ['MachineConfigNode', 'MachineConfigPool', ui('풀 소속')], ['ControllerConfig', 'MachineConfig', ui('렌더링')],
    ['MachineOSConfig', 'MachineConfigPool', locale.choice('대상', 'Targets')], ['MachineOSBuild', 'MachineOSConfig', ui('빌드 결과')], ['PinnedImageSet', 'MachineConfigPool', locale.choice('대상', 'Targets')], ['PerformanceProfile', 'MachineConfigPool', locale.choice('대상', 'Targets')],
    ['Tuned', 'Profile', ui('생성')], ['Profile', 'Node', ui('적용')],
    ['BareMetalHost', 'Machine', ui('호스트 매칭')], ['Provisioning', 'BareMetalHost', ui('프로비저닝')], ['BareMetalHost', 'HostFirmwareSettings', ui('펌웨어 설정')], ['BareMetalHost', 'HardwareData', ui('하드웨어 정보')],
    ['BareMetalHost', 'FirmwareSchema', ui('펌웨어 스키마')], ['BareMetalHost', 'HostFirmwareComponents', ui('펌웨어 구성')], ['BareMetalHost', 'PreprovisioningImage', ui('부팅 이미지')], ['BareMetalHost', 'DataImage', ui('데이터 이미지')],
    ['BMCEventSubscription', 'BareMetalHost', ui('이벤트 구독')], ['HostUpdatePolicy', 'BareMetalHost', ui('업데이트 정책')], ['Metal3RemediationTemplate', 'Metal3Remediation', ui('템플릿')],
    // 클러스터·OLM
    ['ClusterVersion', 'ClusterOperator', ui('관리')], ['Etcd', 'ClusterOperator', ui('상태 보고')], ['KubeAPIServer', 'ClusterOperator', ui('상태 보고')], ['KubeControllerManager', 'ClusterOperator', ui('상태 보고')],
    ['KubeScheduler', 'ClusterOperator', ui('상태 보고')], ['OpenShiftAPIServer', 'ClusterOperator', ui('상태 보고')], ['OpenShiftControllerManager', 'ClusterOperator', ui('상태 보고')], ['Scheduler', 'KubeScheduler', ui('설정')],
    ['Subscription', 'CatalogSource', ui('소스')], ['Subscription', 'InstallPlan', ui('생성')], ['InstallPlan', 'ClusterServiceVersion', ui('설치')], ['ClusterServiceVersion', 'CustomResourceDefinition', ui('제공')],
    ['ClusterServiceVersion', 'OperatorGroup', ui('소속')], ['OperatorGroup', 'Namespace', locale.choice('대상', 'Targets')], ['OperatorCondition', 'ClusterServiceVersion', ui('상태')], ['PackageManifest', 'CatalogSource', ui('출처')],
    ['OperatorHub', 'CatalogSource', ui('기본 소스')], ['ClusterExtension', 'ClusterCatalog', ui('카탈로그')], ['CloudCredential', 'CredentialsRequest', ui('처리')], ['CredentialsRequest', 'Secret', ui('생성')],
    // 이미지·빌드
    ['ImageStream', 'ImageStreamTag', ui('태그')], ['ImageStreamTag', 'ImageStreamImage', ui('가리킴')], ['ImageStreamImage', 'Image@image.openshift.io', ui('메타데이터')], ['ImageStreamImport', 'ImageStream', ui('가져오기')],
    ['ImageStreamMapping', 'ImageStream', ui('매핑')], ['ImageStreamLayers', 'ImageStream', ui('레이어')], ['ImageSignature', 'Image@image.openshift.io', ui('서명')], ['ImageTag', 'ImageStream', ui('태그')],
    ['BuildConfig', 'Build@build.openshift.io', ui('실행 생성')], ['BuildConfig', 'ImageStream', ui('결과 푸시')], ['BuildLog', 'Build@build.openshift.io', ui('로그')], ['BuildRequest', 'BuildConfig', ui('실행 요청')],
    ['DeploymentConfig', 'ImageStream', ui('이미지 트리거')], ['ImageDigestMirrorSet', 'MachineConfig', ui('노드 설정 반영')], ['ImageTagMirrorSet', 'MachineConfig', ui('노드 설정 반영')], ['ImagePruner', 'ImageStream', ui('정리')],
    // 템플릿
    ['TemplateInstance', 'Template', ui('원본')], ['BrokerTemplateInstance', 'TemplateInstance', ui('대응')],
    // 모니터링
    ['Prometheus', 'ServiceMonitor', ui('수집 대상')], ['Prometheus', 'PodMonitor', ui('수집 대상')], ['Prometheus', 'Probe', ui('수집 대상')], ['Prometheus', 'PrometheusRule', ui('규칙')], ['Prometheus', 'Alertmanager', ui('알림 전송')],
    ['Alertmanager', 'AlertmanagerConfig', ui('설정')], ['ThanosRuler', 'PrometheusRule', ui('규칙')], ['ServiceMonitor', 'Service', ui('모니터링')], ['PodMonitor', 'Pod', ui('모니터링')], ['AlertingRule', 'PrometheusRule', ui('규칙 생성')],
    // 콘솔
    ['ConsolePlugin', 'Console@operator.openshift.io', ui('확장')], ['ConsoleLink', 'Console@config.openshift.io', ui('표시')], ['ConsoleCLIDownload', 'Console@config.openshift.io', ui('표시')],
    ['ConsoleNotification', 'Console@config.openshift.io', ui('표시')], ['ConsoleQuickStart', 'Console@config.openshift.io', ui('표시')], ['ConsoleExternalLogLink', 'Console@config.openshift.io', ui('표시')],
    // 어드미션·확장
    ['ValidatingAdmissionPolicyBinding', 'ValidatingAdmissionPolicy', ui('정책 연결')], ['ValidatingWebhookConfiguration', 'Service', ui('웹훅 호출')], ['MutatingWebhookConfiguration', 'Service', ui('웹훅 호출')],
    ['APIService', 'Service', ui('요청 위임')],
    // 확장 네트워크·IPAM
    ['AdminPolicyBasedExternalRoute', 'Namespace', ui('적용')], ['AdminPolicyBasedExternalRoute', 'Pod', ui('게이트웨이 선택')], ['CloudPrivateIPConfig', 'EgressIP', ui('클라우드 IP 할당')], ['EgressRouter', 'Pod', ui('라우터 생성')], ['EgressFirewall', 'DNSNameResolver', ui('도메인 해석')],
    ['NetworkAttachmentDefinition', 'IPPool@whereabouts.cni.cncf.io', ui('IP 할당 기록')], ['NodeSlicePool', 'NetworkAttachmentDefinition', ui('노드별 슬라이스')], ['OverlappingRangeIPReservation', 'IPPool@whereabouts.cni.cncf.io', ui('중복 범위 예약')],
    ['IPAMClaim', 'NetworkAttachmentDefinition', ui('고정 IP 예약')], ['Service', 'IPAddress@networking.k8s.io', ui('클러스터 IP 할당')],
    // DRA(동적 리소스 할당)
    ['Pod', 'ResourceClaim', ui('장치 요청')], ['Pod', 'ResourceClaimTemplate', ui('장치 요청 템플릿')], ['ResourceClaim', 'DeviceClass', ui('장치 클래스 사용')], ['ResourceClaim', 'ResourceSlice', ui('장치 할당')], ['ResourceSlice', 'Node', ui('노드 장치 목록')],
    // 코어 부가 리소스
    ['Binding', 'Pod', ui('바인딩')], ['Binding', 'Node', ui('스케줄 대상')], ['Eviction@policy', 'Pod', ui('축출')], ['Eviction@policy', 'PodDisruptionBudget', ui('예산 확인')],
    ['Pod', 'PriorityClass', ui('우선순위')], ['Pod', 'RuntimeClass', ui('런타임 클래스')], ['FlowSchema', 'PriorityLevelConfiguration', ui('우선순위 지정')], ['Lease@coordination.k8s.io', 'Node', ui('노드 하트비트')],
    ['NodeMetrics', 'Node', ui('지표')], ['PodMetrics', 'Pod', ui('지표')], ['PersistentVolumeClaim', 'VolumePopulator', ui('데이터 소스')], ['TokenReview', 'User', ui('토큰 검증')],
    ['StorageVersionMigration', 'StorageState', ui('상태 기록')], ['KubeStorageVersionMigrator', 'StorageVersionMigration', ui('관리')],
    // 보안·설정
    ['PodSecurityPolicyReview', 'SecurityContextConstraints', ui('평가')], ['PodSecurityPolicySubjectReview', 'SecurityContextConstraints', ui('평가')], ['PodSecurityPolicySelfSubjectReview', 'SecurityContextConstraints', ui('평가')],
    ['RangeAllocation', 'Namespace', ui('UID 범위 기록')], ['RoleBindingRestriction', 'RoleBinding@' + R, ui('대상 제한')], ['OAuth', 'OAuthAccessToken', ui('토큰 설정')], ['Proxy', 'ConfigMap', ui('신뢰 CA')],
    ['ImageContentSourcePolicy', 'ImageDigestMirrorSet', ui('후속 API')],
    // 클러스터 오퍼레이터 상태 보고
    ['Storage', 'ClusterOperator', ui('상태 보고')], ['ServiceCA', 'ClusterOperator', ui('상태 보고')], ['CSISnapshotController', 'ClusterOperator', ui('상태 보고')], ['KubeStorageVersionMigrator', 'ClusterOperator', ui('상태 보고')],
    ['MachineConfiguration', 'ClusterOperator', ui('상태 보고')], ['InsightsOperator', 'ClusterOperator', ui('상태 보고')], ['OLM', 'ClusterOperator', ui('상태 보고')],
    ['OLMConfig', 'ClusterServiceVersion', ui('복사 CSV 설정')], ['Operator@operators.coreos.com', 'ClusterServiceVersion', ui('구성 요소 집계')], ['Operator@operators.coreos.com', 'Subscription', ui('구성 요소 집계')],
    ['Backup', 'Etcd', ui('정기 백업 설정')], ['EtcdBackup', 'Etcd', ui('백업 대상')], ['ClusterMonitoring', 'Prometheus', ui('설정')], ['ClusterMonitoring', 'Alertmanager', ui('설정')], ['AlertRelabelConfig', 'Prometheus', ui('알림 재레이블')],
    ['ConsoleSample', 'Console@config.openshift.io', ui('표시')], ['ConsoleYAMLSample', 'Console@config.openshift.io', ui('표시')],
  ];

  // 단어 하나짜리 일반 영어와 겹쳐 오탐이 많은 이름은 본문 언급 추출에서 제외
  const EXCLUDE = new Set(['Operator', 'Config', 'Storage', 'Profile', 'Binding', 'Scale', 'Provisioning', 'Network', 'Event', 'Lease', 'Proxy', 'Console', 'Scheduler', 'Authentication', 'Infrastructure', 'Etcd', 'OLM', 'DNS', 'Eviction', 'Metal3Remediation', 'Identity', 'Group', 'OAuth', 'Image', 'Machine', 'Probe']);
  // ↑ 일반 명사로 자주 쓰여 구분이 어려운 이름. '<Kind> object' 처럼 리소스임이 드러날 때만 허용한다.
  const STRICT_OK = /\b(Operator|Config|Storage|Profile|Binding|Scale|Probe|Network|Event|Lease|Proxy|Console|Scheduler|Authentication|Infrastructure|Etcd|DNS|Identity)\s+(object|resource|objects|resources|kind|API)\b/;
  // 그 외 한 단어짜리 이름(Pod, Service, Secret 등)은 문장 중간에 대문자로 나올 때만 언급으로 본다.

  // 본문 언급 중 예시로만 나온 것은 제외 (출발Kind>도착Kind)
  const MENTION_SKIP = new Set(['Event>ReplicaSet']);
  // 동명이인이 있을 때 출발 그룹별로 선호하는 도착 그룹 (예: Probe 의 Ingress 는 networking.k8s.io)
  const MENTION_PREF = { 'monitoring.coreos.com': { Ingress: 'networking.k8s.io' } };

  function create(BOOK) {
    const docs = BOOK.apis;
    const nodes = docs.map((a, i) => ({
      id: a.url.split('#')[1], i, kind: a.kind, group: a.group, version: a.version, book: a.book, url: a.url,
      gv: (a.group ? a.group + '/' : '') + a.version,
    }));
    const byId = new Map(nodes.map(n => [n.id, n]));
    const byKind = new Map();
    nodes.forEach(n => { (byKind.get(n.kind) || byKind.set(n.kind, []).get(n.kind)).push(n); });

    const edges = []; const seen = new Map();
    function add(s, t, type, label, w) {
      if (!s || !t || s === t) return;
      const k = s.id + '>' + t.id + '|' + type;
      const ex = seen.get(k);
      if (ex) { ex.w += w || 1; if (label && !ex.labels.includes(label)) ex.labels.push(label); return; }
      const e = { s: s.id, t: t.id, type, labels: label ? [label] : [], w: w || 1 };
      seen.set(k, e); edges.push(e);
    }
    function pick(kind, from, pref, strict) {   // strict: 'Kind@group' 으로 그룹을 지정한 경우 — 그 그룹에 없으면 null
      const c = byKind.get(kind); if (!c) return null;
      if (strict && pref) return c.find(n => n.group === pref) || null;
      if (c.length === 1) return c[0];
      if (pref) { const p = c.find(n => n.group === pref); if (p) return p; }
      return c.find(n => n.group === from.group) || c.find(n => n.book === from.book) || c.find(n => !n.group) || c[0];
    }
    function resolve(spec, from) {
      const [kind, pref] = spec.split('@');
      return pick(kind, from || {}, pref, true);
    }

    // 1) 일반 관계(큐레이션)
    for (const [a, b, label] of CURATED) {
      const s = resolve(a), t = resolve(b, s);
      if (s && t) add(s, t, 'curated', label, 1);
    }
    // 2) 같은 이름
    for (const [, list] of byKind) for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) add(list[x], list[y], 'same', '', 1);
    // 3) 이름 변형(접미사 포함)
    const kinds = [...byKind.keys()];
    for (const k of kinds) for (const o of kinds) {
      // 접미사가 두 단어 이상(RoleBinding, MachineSet 등)일 때만 변형으로 본다. Service/Operator 같은 한 단어는 오탐이 많다.
      if (k !== o && o.length >= 7 && k.length > o.length + 2 && k.endsWith(o) && (o.match(/[A-Z]/g) || []).length >= 2 && /^[A-Z]/.test(k.slice(0, k.length - o.length))) {
        // 다른 API 계열(authorization.k8s.io ↔ authorization.openshift.io 등)로 넘어가는 변형은 오탐이 많아 같은 그룹 뿌리(끝 두 라벨)에서만 잇는다
        const root = g => (g || '').split('.').slice(-2).join('.');
        byKind.get(k).forEach(n => { const c = byKind.get(o).filter(t => root(t.group) === root(n.group)); const t = c.find(x => x.group === n.group) || c[0]; if (t) add(n, t, 'variant', '', 1); });
      }
    }
    // 4) 문서 본문 언급
    const names = kinds.filter(k => k.length >= 3).sort((a, b) => b.length - a.length);
    const re = new RegExp('(?<![A-Za-z0-9])(' + names.join('|') + ')(?![A-Za-z0-9])', 'g');
    docs.forEach((a, i) => {
      const n = nodes[i], d = a.d; if (!d) return;
      const parts = [{ t: d.desc.replace(/Compatibility level.*$/s, ''), w: 'desc' }].concat(d.props.map(p => ({ t: p.d, w: p.n })));
      for (const part of parts) {
        re.lastIndex = 0; let m;
        while ((m = re.exec(part.t))) {
          const kind = m[1]; if (kind === a.kind) continue;
          const before = part.t.slice(Math.max(0, m.index - 3), m.index);
          const atStart = m.index === 0 || /[.!?:]\s*$/.test(before);
          if (EXCLUDE.has(kind)) {
            const ctx = part.t.slice(m.index, m.index + kind.length + 12);
            if (!STRICT_OK.test(ctx) || atStart) continue;
          } else if (/^[A-Z][a-z]+$/.test(kind) && atStart) continue; // 문장 첫머리의 일반 단어
          if (MENTION_SKIP.has(a.kind + '>' + kind)) continue;
          const t = pick(kind, n, (MENTION_PREF[a.group] || {})[kind]); if (t) add(n, t, 'mention', part.w === 'desc' ? ui('설명에 언급') : ui`${part.w} 필드에 언급`, 1);
        }
      }
    });

    const adj = new Map(nodes.map(n => [n.id, []]));
    edges.forEach(e => { adj.get(e.s).push(e); adj.get(e.t).push(e); });
    return { nodes, edges, byId, adj, TYPES };
  }

  function shortestPath(graph, from, to, types) {
    if (!graph.byId.has(from) || !graph.byId.has(to)) return null;
    const queue = [from], parents = new Map([[from, null]]);
    for (let i = 0; i < queue.length && !parents.has(to); i++) {
      const id = queue[i];
      const edges = graph.adj.get(id).filter(e => types[e.type] && (e.s === id || e.type === 'same'));
      edges.sort((a, b) => Number(b.type === 'curated') - Number(a.type === 'curated'));
      for (const edge of edges) {
        const next = edge.s === id ? edge.t : edge.s;
        if (parents.has(next)) continue;
        parents.set(next, { id, edge }); queue.push(next);
      }
    }
    if (!parents.has(to)) return null;
    const steps = [];
    for (let id = to; id !== from;) {
      const parent = parents.get(id);
      steps.push({ from: parent.id, to: id, edge: parent.edge }); id = parent.id;
    }
    return steps.reverse();
  }
  const api = { create, shortestPath, TYPES, CURATED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ApiGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
