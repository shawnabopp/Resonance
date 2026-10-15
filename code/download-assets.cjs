// Fetch the exact Google-published package and model; no npm install required.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const version = '0.10.14';
const packageUrl = `https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-${version}.tgz`;
const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const files = ['vision_bundle.mjs', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm'];
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
async function main() {
  const metadata = JSON.parse((await download(`https://registry.npmjs.org/@mediapipe/tasks-vision/${version}`)).toString());
  const archive = await download(packageUrl);
  const integrity = 'sha512-' + crypto.createHash('sha512').update(archive).digest('base64');
  if (integrity !== metadata.dist.integrity) throw new Error('Package integrity mismatch');
  const tar = zlib.gunzipSync(archive), found = new Set(), manifest = [];
  const save = (relative, bytes, source) => {
    const target = path.join(__dirname, relative); fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes); manifest.push({ file: relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), source });
  };
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/, '').replace(/^package\//, '');
    const size = parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
    if (files.includes(name) || /^(LICENSE|NOTICE)(\..*)?$/.test(name)) {
      save(`vendor/mediapipe-${version}/${name}`, tar.subarray(offset + 512, offset + 512 + size), packageUrl); found.add(name);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  for (const file of files) if (!found.has(file)) throw new Error(`Missing package file: ${file}`);
  save('models/face_landmarker.task', await download(modelUrl), modelUrl);
  fs.writeFileSync(path.join(__dirname, 'vendor', 'manifest.json'), JSON.stringify({ package: '@mediapipe/tasks-vision', version, integrity, modelVersion: 'float16/1', files: manifest }, null, 2) + '\n');
  console.log(JSON.stringify(manifest.map(({ file, bytes }) => ({ file, bytes })), null, 2));
}
main().catch(error => { console.error(error); console.error('Required assets:', files.map(f => `code/vendor/mediapipe-${version}/${f}`).join(', '), 'code/models/face_landmarker.task'); console.error(packageUrl, modelUrl); process.exitCode = 1; });
