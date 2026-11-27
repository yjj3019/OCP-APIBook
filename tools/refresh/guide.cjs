// SPDX-License-Identifier: Apache-2.0
// Render the overview assemblies from a single documentation revision.
const fs = require('node:fs');
const path = require('node:path');
const asciidoctor = require('@asciidoctor/core')();
const sanitize = require('sanitize-html');
const [root, version, overview] = process.argv.slice(2);
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const topics = read('_topic_maps/_topic_map.yml').split('Dir: rest_api\n')[1].split('  Dir: overview\n')[1].split('\n- Name:')[0];
const chapters = Array.from(topics.matchAll(/^    File: ([\w-]+)$/gm), m => m[1]).filter(name => name !== 'index');
if (!chapters.length) throw Error('API overview has no chapters');
const guides = [];

// Expand only local documentation includes, then render in SECURE mode without file access.
function expand(file, stack = []) {
  if (stack.includes(file)) throw Error('Recursive include: ' + file);
  return read(file).replace(/^include::([^\[]+)\[([^\]]*)\]$/gm, (_, name, options) => {
    if (!/^(?:modules|_attributes)\/[\w-]+\.adoc$/.test(name)) throw Error('Unexpected include: ' + name);
    const body = expand(name, [...stack, file]);
    if (!options) return body;
    if (options !== 'leveloffset=+1') throw Error('Unexpected include options: ' + options);
    return '\n:leveloffset: +1\n\n' + body + '\n\n:leveloffset: -1\n';
  });
}

function collect(node, level) {
  const blocks = node.getBlocks();
  const content = blocks.filter(b => b.getContext() !== 'section').map(b => b.convert()).join('\n');
  const html = sanitize(content, {
    allowedTags: [...sanitize.defaults.allowedTags, 'aside'],
    allowedAttributes: { a: ['href', 'rel', 'target'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
    transformTags: { a: (_, a) => {
      const href = a.href || '';
      const url = href.startsWith('#') ? overview + href : href;
      return { tagName: 'a', attribs: /^https?:\/\//i.test(url) ? { href: url, target: '_blank', rel: 'noopener' } : {} };
    } }
  });
  const id = node.getId() || node.getAttribute('id');
  if (!id) throw Error('Guide section lacks an ID: ' + node.getTitle());
  guides.push({ id, level, title: sanitize(node.getTitle(), { allowedTags: [], allowedAttributes: {} }), html });
  for (const b of blocks.filter(b => b.getContext() === 'section')) collect(b, level + 1);
}
for (const name of chapters) {
  const doc = asciidoctor.load(expand('rest_api/overview/' + name + '.adoc'), {
    safe: 'secure', attributes: { 'openshift-enterprise': '', 'product-title': 'OpenShift Container Platform', 'product-version': version, 'showtitle': '' }
  });
  collect(doc, 2);
}
process.stdout.write(JSON.stringify(guides));
