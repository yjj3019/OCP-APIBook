// SPDX-License-Identifier: Apache-2.0
// Match each operation against the documented paths of this resource.
(function (root) {
  function operations(api) {
    const prefix = api.group ? '/apis/' + api.group + '/' + api.version + '/' : '/api/' + api.version + '/';
    const paths = (api.d?.eps || []).filter(e => !e.p.includes('/watch/'));
    const own = paths.filter(e => e.p.startsWith(prefix));
    const candidates = own.length ? own : paths;
    const segments = e => e.p.replace(/^\/apis\/[^/]+\/[^/]+\/|^\/api\/[^/]+\//, '')
      .replace(/^namespaces\/\{namespace\}\//, '').split('/');
    const collections = candidates.filter(e => segments(e).length === 1);
    const items = candidates.filter(e => segments(e).length === 2 && segments(e)[1] === '{name}');
    // Some resources, such as Scale and Eviction, are documented solely as subresources.
    const subresources = collections.length || items.length ? [] : candidates.filter(e => e.p.includes('/{name}/'));
    const withMethod = (records, method) => records.find(e => e.ms.some(m => m.m === method));
    const namespaced = collections.filter(e => e.p.includes('{namespace}'));
    const writeCollections = namespaced.length ? namespaced : collections;
    const single = items.concat(subresources);
    return {
      list: withMethod(collections, 'GET'), get: withMethod(single, 'GET'),
      create: withMethod(writeCollections.concat(subresources), 'POST'),
      replace: withMethod(single, 'PUT'), patch: withMethod(single, 'PATCH'), delete: withMethod(single, 'DELETE')
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { operations };
  else root.ApiEndpoints = { operations };
})(typeof window !== 'undefined' ? window : globalThis);
