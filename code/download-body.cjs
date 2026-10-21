// Official Google Pose Landmarker lite model; reuse tasks-vision 0.10.14 locally.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assets = [
  { file: 'models/pose_landmarker_lite.task', source: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
  { file: 'qa/fixtures/pose.jpg', source: 'https://storage.googleapis.com/mediapipe-assets/pose.jpg' },
];
async function main() {
  const files = [];
  for (const asset of assets) {
    let bytes;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(asset.source, { signal: AbortSignal.timeout(60000) });
        if (!response.ok) throw new Error(`${response.status}: ${asset.source} -> code/${asset.file}`);
        bytes = Buffer.from(await response.arrayBuffer()); break;
      } catch (error) { if (attempt === 2) throw error; console.log('Retrying official asset:', asset.file); }
    }
    const target = path.join(__dirname, asset.file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, bytes);
    files.push({ ...asset, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
  }
  fs.writeFileSync(path.join(__dirname, 'vendor/body-manifest.json'), JSON.stringify({ runtime: '@mediapipe/tasks-vision', version: '0.10.14', modelVersion: 'lite/float16/1', files }, null, 2) + '\n');
  console.log(JSON.stringify(files.map(({file,bytes})=>({file,bytes})), null, 2));
}
main().catch(error => { console.error(error); console.error('Required assets:', assets); process.exitCode = 1; });
