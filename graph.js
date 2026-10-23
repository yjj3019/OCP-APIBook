/* API 관계 그래프 데이터. 브라우저(window.ApiGraph)와 Node 양쪽에서 동작 */
(function (root) {
  // 관계 종류. src: 'doc' = 이 문서의 텍스트에서 추출, 'name' = 이름 규칙, 'curated' = 일반적인 구조(문서 밖 지식)
  const TYPES = {
    mention: { label: '문서에서 언급', src: 'doc' },
    curated: { label: '일반 관계', src: 'curated' },
    same:    { label: '같은 이름', src: 'name' },
    variant: { label: '이름 변형', src: 'name' },
  };

  // [출발, 도착, 라벨]  — 'Kind@group' 으로 같은 이름 중 대상을 지정
  const R = 'rbac.authorization.k8s.io';
  const CURATED = [
    // 네트워크 노출
    ['Route', 'Service', '트래픽 전달'], ['Service', 'Pod', '선택'], ['Service', 'Endpoints', '엔드포인트 생성'], ['Service', 'EndpointSlice', '슬라이스 생성'],
    ['IngressController', 'Route', '처리'], ['IngressController', 'Service', 'LB 서비스 생성'], ['IngressController', 'DNSRecord', 'DNS 레코드 생성'],
    ['Ingress@networking.k8s.io', 'Service', '전달'], ['Ingress@networking.k8s.io', 'IngressClass', '사용'],
    ['Gateway', 'GatewayClass', '사용'], ['HTTPRoute', 'Gateway', '연결'], ['GRPCRoute', 'Gateway', '연결'], ['HTTPRoute', 'Service', '전달'], ['GRPCRoute', 'Service', '전달'], ['BackendTLSPolicy', 'Service', 'TLS 정책'], ['ReferenceGrant', 'Gateway', '교차 참조 허용'],
    ['NetworkPolicy', 'Pod', '선택'], ['AdminNetworkPolicy', 'Namespace', '적용'], ['BaselineAdminNetworkPolicy', 'Namespace', '적용'], ['MultiNetworkPolicy', 'NetworkAttachmentDefinition', '적용'],
    ['EgressFirewall', 'Namespace', '적용'], ['EgressIP', 'Namespace', '선택'], ['EgressIP', 'Pod', '선택'], ['EgressService', 'Service', '이그레스 지정'], ['EgressQoS', 'Namespace', '적용'],
    ['UserDefinedNetwork', 'Namespace', '네트워크 제공'], ['ClusterUserDefinedNetwork', 'Namespace', '네트워크 제공'],
    // 워크로드
    ['Deployment', 'ReplicaSet', '생성'], ['ReplicaSet', 'Pod', '생성'], ['StatefulSet', 'Pod', '생성'], ['DaemonSet', 'Pod', '생성'], ['DaemonSet', 'ControllerRevision', '리비전 기록'],
    ['Job', 'Pod', '생성'], ['CronJob', 'Job', '주기 생성'], ['DeploymentConfig', 'ReplicationController', '생성'], ['ReplicationController', 'Pod', '생성'],
    ['HorizontalPodAutoscaler', 'Scale', '조정'], ['PodDisruptionBudget', 'Pod', '보호'],
    ['Pod', 'PersistentVolumeClaim', '볼륨 마운트'], ['Pod', 'ConfigMap', '설정 사용'], ['Pod', 'Secret', '비밀 사용'], ['Pod', 'ServiceAccount', '실행 계정'], ['Pod', 'Node', '스케줄됨'],
    ['DeploymentLog', 'DeploymentConfig', '로그'], ['DeploymentRequest', 'DeploymentConfig', '배포 요청'], ['DeploymentConfigRollback', 'DeploymentConfig', '롤백'],
    // 스토리지
    ['PersistentVolumeClaim', 'PersistentVolume', '바인딩'], ['PersistentVolumeClaim', 'StorageClass', '클래스 사용'], ['PersistentVolume', 'StorageClass', '클래스 지정'], ['StorageClass', 'CSIDriver', '프로비저너'],
    ['CSINode', 'CSIDriver', '드라이버 정보'], ['ClusterCSIDriver', 'CSIDriver', '관리'], ['VolumeSnapshot', 'VolumeSnapshotClass', '클래스 사용'], ['VolumeSnapshot', 'PersistentVolumeClaim', '원본'],
    ['VolumeSnapshotContent', 'VolumeSnapshot', '실제 스냅샷'], ['VolumeAttachment', 'PersistentVolume', '노드에 연결'],
    // 권한·인증
    ['RoleBinding@' + R, 'Role@' + R, '역할 부여'], ['ClusterRoleBinding@' + R, 'ClusterRole@' + R, '역할 부여'],
    ['RoleBinding@' + R, 'ServiceAccount', '주체'], ['RoleBinding@' + R, 'User', '주체'], ['RoleBinding@' + R, 'Group', '주체'],
    ['ClusterRoleBinding@' + R, 'ServiceAccount', '주체'], ['ClusterRoleBinding@' + R, 'User', '주체'], ['ClusterRoleBinding@' + R, 'Group', '주체'],
    ['SecurityContextConstraints', 'ServiceAccount', '허용 대상'], ['SecurityContextConstraints', 'User', '허용 대상'], ['SecurityContextConstraints', 'Group', '허용 대상'],
    ['Identity', 'User', '사용자 매핑'], ['UserIdentityMapping', 'User', '매핑'], ['UserIdentityMapping', 'Identity', '매핑'], ['Group', 'User', '구성원'],
    ['OAuthAccessToken', 'OAuthClient', '발급 클라이언트'], ['OAuthAccessToken', 'User', '사용자'], ['OAuthAuthorizeToken', 'OAuthClient', '발급 클라이언트'],
    ['OAuthClientAuthorization', 'OAuthClient', '승인'], ['OAuthClientAuthorization', 'User', '승인 사용자'], ['UserOAuthAccessToken', 'OAuthAccessToken', '조회'],
    ['ServiceAccount', 'Secret', '토큰'], ['TokenRequest', 'ServiceAccount', '토큰 발급'],
    // 프로젝트·쿼터
    ['Project@project.openshift.io', 'Namespace', '1:1 대응'], ['ProjectRequest', 'Project@project.openshift.io', '생성'], ['ProjectHelmChartRepository', 'Project@project.openshift.io', '소속'],
    ['ResourceQuota', 'Namespace', '제한'], ['LimitRange', 'Namespace', '제한'], ['ClusterResourceQuota', 'Namespace', '여러 네임스페이스 제한'], ['AppliedClusterResourceQuota', 'ClusterResourceQuota', '적용 결과'],
    // 머신·노드
    ['MachineSet', 'Machine', '생성'], ['ControlPlaneMachineSet', 'Machine', '생성'], ['Machine', 'Node', '대응'], ['MachineAutoscaler', 'MachineSet', '크기 조정'], ['ClusterAutoscaler', 'MachineAutoscaler', '연동'],
    ['MachineHealthCheck', 'Machine', '감시'], ['MachineHealthCheck', 'Node', '감시'],
    ['MachineConfigPool', 'MachineConfig', '선택'], ['MachineConfigPool', 'Node', '대상'], ['KubeletConfig', 'MachineConfigPool', '대상'], ['ContainerRuntimeConfig', 'MachineConfigPool', '대상'],
    ['MachineConfigNode', 'Node', '노드 상태'], ['MachineConfigNode', 'MachineConfigPool', '풀 소속'], ['ControllerConfig', 'MachineConfig', '렌더링'],
    ['MachineOSConfig', 'MachineConfigPool', '대상'], ['MachineOSBuild', 'MachineOSConfig', '빌드 결과'], ['PinnedImageSet', 'MachineConfigPool', '대상'], ['PerformanceProfile', 'MachineConfigPool', '대상'],
    ['Tuned', 'Profile', '생성'], ['Profile', 'Node', '적용'],
    ['BareMetalHost', 'Machine', '호스트 매칭'], ['Provisioning', 'BareMetalHost', '프로비저닝'], ['BareMetalHost', 'HostFirmwareSettings', '펌웨어 설정'], ['BareMetalHost', 'HardwareData', '하드웨어 정보'],
    ['BareMetalHost', 'FirmwareSchema', '펌웨어 스키마'], ['BareMetalHost', 'HostFirmwareComponents', '펌웨어 구성'], ['BareMetalHost', 'PreprovisioningImage', '부팅 이미지'], ['BareMetalHost', 'DataImage', '데이터 이미지'],
    ['BMCEventSubscription', 'BareMetalHost', '이벤트 구독'], ['HostUpdatePolicy', 'BareMetalHost', '업데이트 정책'], ['Metal3RemediationTemplate', 'Metal3Remediation', '템플릿'],
    // 클러스터·OLM
    ['ClusterVersion', 'ClusterOperator', '관리'], ['Etcd', 'ClusterOperator', '상태 보고'], ['KubeAPIServer', 'ClusterOperator', '상태 보고'], ['KubeControllerManager', 'ClusterOperator', '상태 보고'],
    ['KubeScheduler', 'ClusterOperator', '상태 보고'], ['OpenShiftAPIServer', 'ClusterOperator', '상태 보고'], ['OpenShiftControllerManager', 'ClusterOperator', '상태 보고'], ['Scheduler', 'KubeScheduler', '설정'],
    ['Subscription', 'CatalogSource', '소스'], ['Subscription', 'InstallPlan', '생성'], ['InstallPlan', 'ClusterServiceVersion', '설치'], ['ClusterServiceVersion', 'CustomResourceDefinition', '제공'],
    ['ClusterServiceVersion', 'OperatorGroup', '소속'], ['OperatorGroup', 'Namespace', '대상'], ['OperatorCondition', 'ClusterServiceVersion', '상태'], ['PackageManifest', 'CatalogSource', '출처'],
    ['OperatorHub', 'CatalogSource', '기본 소스'], ['ClusterExtension', 'ClusterCatalog', '카탈로그'], ['CloudCredential', 'CredentialsRequest', '처리'], ['CredentialsRequest', 'Secret', '생성'],
    // 이미지·빌드
    ['ImageStream', 'ImageStreamTag', '태그'], ['ImageStreamTag', 'ImageStreamImage', '가리킴'], ['ImageStreamImage', 'Image@image.openshift.io', '메타데이터'], ['ImageStreamImport', 'ImageStream', '가져오기'],
    ['ImageStreamMapping', 'ImageStream', '매핑'], ['ImageStreamLayers', 'ImageStream', '레이어'], ['ImageSignature', 'Image@image.openshift.io', '서명'], ['ImageTag', 'ImageStream', '태그'],
    ['BuildConfig', 'Build@build.openshift.io', '실행 생성'], ['BuildConfig', 'ImageStream', '결과 푸시'], ['BuildLog', 'Build@build.openshift.io', '로그'], ['BuildRequest', 'BuildConfig', '실행 요청'],
    ['DeploymentConfig', 'ImageStream', '이미지 트리거'], ['ImageDigestMirrorSet', 'MachineConfig', '노드 설정 반영'], ['ImageTagMirrorSet', 'MachineConfig', '노드 설정 반영'], ['ImagePruner', 'ImageStream', '정리'],
    // 템플릿
    ['TemplateInstance', 'Template', '원본'], ['BrokerTemplateInstance', 'TemplateInstance', '대응'],
    // 모니터링
    ['Prometheus', 'ServiceMonitor', '수집 대상'], ['Prometheus', 'PodMonitor', '수집 대상'], ['Prometheus', 'Probe', '수집 대상'], ['Prometheus', 'PrometheusRule', '규칙'], ['Prometheus', 'Alertmanager', '알림 전송'],
    ['Alertmanager', 'AlertmanagerConfig', '설정'], ['ThanosRuler', 'PrometheusRule', '규칙'], ['ServiceMonitor', 'Service', '모니터링'], ['PodMonitor', 'Pod', '모니터링'], ['AlertingRule', 'PrometheusRule', '규칙 생성'],
    // 콘솔
    ['ConsolePlugin', 'Console@operator.openshift.io', '확장'], ['ConsoleLink', 'Console@config.openshift.io', '표시'], ['ConsoleCLIDownload', 'Console@config.openshift.io', '표시'],
    ['ConsoleNotification', 'Console@config.openshift.io', '표시'], ['ConsoleQuickStart', 'Console@config.openshift.io', '표시'], ['ConsoleExternalLogLink', 'Console@config.openshift.io', '표시'],
    // 어드미션·확장
    ['ValidatingAdmissionPolicyBinding', 'ValidatingAdmissionPolicy', '정책 연결'], ['ValidatingWebhookConfiguration', 'Service', '웹훅 호출'], ['MutatingWebhookConfiguration', 'Service', '웹훅 호출'],
    ['APIService', 'Service', '요청 위임'],
    // 확장 네트워크·IPAM
    ['AdminPolicyBasedExternalRoute', 'Namespace', '적용'], ['AdminPolicyBasedExternalRoute', 'Pod', '게이트웨이 선택'], ['CloudPrivateIPConfig', 'EgressIP', '클라우드 IP 할당'], ['EgressRouter', 'Pod', '라우터 생성'], ['EgressFirewall', 'DNSNameResolver', '도메인 해석'],
    ['NetworkAttachmentDefinition', 'IPPool@whereabouts.cni.cncf.io', 'IP 할당 기록'], ['NodeSlicePool', 'NetworkAttachmentDefinition', '노드별 슬라이스'], ['OverlappingRangeIPReservation', 'IPPool@whereabouts.cni.cncf.io', '중복 범위 예약'],
    ['IPAMClaim', 'NetworkAttachmentDefinition', '고정 IP 예약'], ['IPAddress@ipam.cluster.x-k8s.io', 'IPAddressClaim', '요청 충족'], ['Service', 'IPAddress@networking.k8s.io', '클러스터 IP 할당'],
    // DRA(동적 리소스 할당)
    ['Pod', 'ResourceClaim', '장치 요청'], ['Pod', 'ResourceClaimTemplate', '장치 요청 템플릿'], ['ResourceClaim', 'DeviceClass', '장치 클래스 사용'], ['ResourceClaim', 'ResourceSlice', '장치 할당'], ['ResourceSlice', 'Node', '노드 장치 목록'],
    // 코어 부가 리소스
    ['Binding', 'Pod', '바인딩'], ['Binding', 'Node', '스케줄 대상'], ['Eviction@policy', 'Pod', '축출'], ['Eviction@policy', 'PodDisruptionBudget', '예산 확인'],
    ['Pod', 'PriorityClass', '우선순위'], ['Pod', 'RuntimeClass', '런타임 클래스'], ['FlowSchema', 'PriorityLevelConfiguration', '우선순위 지정'], ['Lease@coordination.k8s.io', 'Node', '노드 하트비트'],
    ['NodeMetrics', 'Node', '지표'], ['PodMetrics', 'Pod', '지표'], ['PersistentVolumeClaim', 'VolumePopulator', '데이터 소스'], ['TokenReview', 'User', '토큰 검증'],
    ['StorageVersionMigration', 'StorageState', '상태 기록'], ['KubeStorageVersionMigrator', 'StorageVersionMigration', '관리'],
    // 보안·설정
    ['PodSecurityPolicyReview', 'SecurityContextConstraints', '평가'], ['PodSecurityPolicySubjectReview', 'SecurityContextConstraints', '평가'], ['PodSecurityPolicySelfSubjectReview', 'SecurityContextConstraints', '평가'],
    ['RangeAllocation', 'Namespace', 'UID 범위 기록'], ['RoleBindingRestriction', 'RoleBinding@' + R, '대상 제한'], ['OAuth', 'OAuthAccessToken', '토큰 설정'], ['Proxy', 'ConfigMap', '신뢰 CA'],
    ['ImageContentSourcePolicy', 'ImageDigestMirrorSet', '후속 API'],
    // 클러스터 오퍼레이터 상태 보고
    ['Storage', 'ClusterOperator', '상태 보고'], ['ServiceCA', 'ClusterOperator', '상태 보고'], ['CSISnapshotController', 'ClusterOperator', '상태 보고'], ['KubeStorageVersionMigrator', 'ClusterOperator', '상태 보고'],
    ['MachineConfiguration', 'ClusterOperator', '상태 보고'], ['InsightsOperator', 'ClusterOperator', '상태 보고'], ['OLM', 'ClusterOperator', '상태 보고'],
    ['OLMConfig', 'ClusterServiceVersion', '복사 CSV 설정'], ['Operator@operators.coreos.com', 'ClusterServiceVersion', '구성 요소 집계'], ['Operator@operators.coreos.com', 'Subscription', '구성 요소 집계'],
    ['Backup', 'Etcd', '정기 백업 설정'], ['EtcdBackup', 'Etcd', '백업 대상'], ['ClusterMonitoring', 'Prometheus', '설정'], ['ClusterMonitoring', 'Alertmanager', '설정'], ['AlertRelabelConfig', 'Prometheus', '알림 재레이블'],
    ['ConsoleSample', 'Console@config.openshift.io', '표시'], ['ConsoleYAMLSample', 'Console@config.openshift.io', '표시'],
  ];

  // 단어 하나짜리 일반 영어와 겹쳐 오탐이 많은 이름은 본문 언급 추출에서 제외
  const EXCLUDE = new Set(['Operator', 'Config', 'Storage', 'Profile', 'Binding', 'Scale', 'Probe', 'Provisioning', 'Network', 'Event', 'Lease', 'Proxy', 'Console', 'Scheduler', 'Authentication', 'Infrastructure', 'Etcd', 'OLM', 'DNS', 'Eviction', 'Metal3Remediation', 'Identity', 'Group', 'OAuth', 'Image', 'Machine', 'Probe']);
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
        byKind.get(k).forEach(n => add(n, pick(o, n), 'variant', '', 1));
      }
    }
    // 4) 문서 본문 언급
    const names = kinds.filter(k => k.length >= 4).sort((a, b) => b.length - a.length);
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
          const t = pick(kind, n, (MENTION_PREF[a.group] || {})[kind]); if (t) add(n, t, 'mention', part.w === 'desc' ? '설명에 언급' : `${part.w} 필드에 언급`, 1);
        }
      }
    });

    const adj = new Map(nodes.map(n => [n.id, []]));
    edges.forEach(e => { adj.get(e.s).push(e); adj.get(e.t).push(e); });
    return { nodes, edges, byId, adj, TYPES };
  }

  const api = { create, TYPES, CURATED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ApiGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
