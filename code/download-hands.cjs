// Official ml5 npm release + Google-hosted TensorFlow hand models. No npm install.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const version = '1.4.0';
async function download(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`${r.status}: ${url}`);
  return Buffer.from(await r.arrayBuffer());
}
async function main() {
  if (process.argv.includes('--fixture')) {
    const source = 'https://raw.githubusercontent.com/tensorflow/tfjs-models/master/hand-pose-detection/test_data/hands.jpg';
    const bytes = await download(source), folder = path.join(__dirname, 'qa/fixtures');
    fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, 'hands.jpg'), bytes);
    fs.writeFileSync(path.join(folder, 'hands-source.json'), JSON.stringify({ source, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), purpose: 'Official TensorFlow test image; never used as production input' }, null, 2));
    console.log('Saved official hand test image (' + bytes.length + ' bytes)'); return;
  }
  const files = [];
  const save = (file, bytes, source) => {
    const target = path.join(__dirname, file);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    files.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), source });
  };
  const meta = JSON.parse(await download(`https://registry.npmjs.org/ml5/${version}`));
  const archive = await download(meta.dist.tarball);
  const integrity = 'sha512-' + crypto.createHash('sha512').update(archive).digest('base64');
  if (integrity !== meta.dist.integrity) throw new Error('ml5 package integrity mismatch');
  const tar = zlib.gunzipSync(archive);
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString().replace(/\0.*$/, '').replace(/^package\//, '');
    const size = parseInt(tar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
    if (['dist/ml5.min.js', 'dist/ml5.min.js.LICENSE.txt', 'LICENSE.md', 'package.json'].includes(name)) {
      save(`vendor/ml5-${version}/${path.basename(name)}`, tar.subarray(offset + 512, offset + 512 + size), meta.dist.tarball);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!files.some(f => f.file.endsWith('/ml5.min.js'))) throw new Error('Missing ml5.min.js');
  // Matches the TensorFlow.js 4.22.0 bundled in this pinned ml5 release.
  const wasmVersion = '4.22.0';
  const wasmMeta = JSON.parse(await download(`https://registry.npmjs.org/@tensorflow/tfjs-backend-wasm/${wasmVersion}`));
  const wasmArchive = await download(wasmMeta.dist.tarball);
  if ('sha512-' + crypto.createHash('sha512').update(wasmArchive).digest('base64') !== wasmMeta.dist.integrity) throw new Error('WASM package integrity mismatch');
  const wasmTar = zlib.gunzipSync(wasmArchive);
  for (let offset = 0; offset + 512 <= wasmTar.length;) {
    const name = wasmTar.subarray(offset, offset + 100).toString().replace(/\0.*$/, '').replace(/^package\//, '');
    const size = parseInt(wasmTar.subarray(offset + 124, offset + 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
    if (['dist/tf-backend-wasm.min.js', 'dist/tf-backend-wasm.es2017.js', 'dist/tf-backend-wasm.es2017.min.js', 'dist/tfjs-backend-wasm.wasm', 'dist/tfjs-backend-wasm-simd.wasm', 'dist/tfjs-backend-wasm-threaded-simd.wasm', 'LICENSE'].includes(name)) {
      save(`vendor/tfjs-wasm-${wasmVersion}/${path.basename(name)}`, wasmTar.subarray(offset + 512, offset + 512 + size), wasmMeta.dist.tarball);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  for (const kind of ['detector', 'landmark']) {
    const base = `https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/${kind}/lite/1/`;
    const bytes = await download(base + 'model.json?tfjs-format=file');
    const model = JSON.parse(bytes);
    save(`models/handpose-${kind}/model.json`, bytes, base + 'model.json?tfjs-format=file');
    for (const group of model.weightsManifest) for (const shard of group.paths) {
      if (path.basename(shard) !== shard) throw new Error('Unexpected weight path');
      save(`models/handpose-${kind}/${shard}`, await download(base + shard + '?tfjs-format=file'), base + shard + '?tfjs-format=file');
    }
  }
  fs.writeFileSync(path.join(__dirname, 'vendor/hand-manifest.json'), JSON.stringify({ package: 'ml5', version, integrity, wasmVersion, wasmIntegrity: wasmMeta.dist.integrity, modelVersion: 'lite/1', files }, null, 2) + '\n');
  console.log(JSON.stringify(files.map(({ file, bytes }) => ({ file, bytes })), null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
