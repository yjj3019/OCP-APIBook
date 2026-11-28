// SPDX-License-Identifier: MIT
const fs = require('node:fs');
const path = require('node:path');

function query([name, ...pairs]) {
  const root = process.env.OCP_API_BOOK_ROOT || path.resolve(__dirname, '../../..');
  const server = path.resolve(root, 'mcp/server.js');
  if (!fs.existsSync(server)) throw new Error('OCP_API_BOOK_ROOT를 API Book 저장소 루트로 지정하세요.');
  const { TOOLS } = require(server);
  if (name === '--list') return TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) throw new Error('조회할 도구 이름을 지정하세요. --list로 도구와 인자를 확인할 수 있습니다.');

  const args = Object.create(null);
  for (const pair of pairs) {
    const split = pair.indexOf('=');
    if (split < 1) throw new Error('인자는 key=value 형식으로 전달하세요.');
    const key = pair.slice(0, split), value = pair.slice(split + 1);
    const schema = tool.inputSchema.properties;
    if (!Object.hasOwn(schema, key)) throw new Error(name + '에서 지원하지 않는 인자: ' + key);
    if (Object.hasOwn(args, key)) throw new Error('중복된 인자: ' + key);
    if (name === 'validate_manifest' && key === 'manifest' && value === '-') {
      args[key] = fs.readFileSync(0, 'utf8');
    } else if (schema[key].type === 'integer') {
      if (!/^-?\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(key + '에는 정수를 입력하세요.');
      args[key] = Number(value);
    } else {
      args[key] = value;
    }
  }
  return tool.run(args);
}

try {
  console.log(JSON.stringify(query(process.argv.slice(2)), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
