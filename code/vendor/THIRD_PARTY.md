# MediaPipe assets

`mediapipe-0.10.14/` contains selected, unmodified files from Google's official
`@mediapipe/tasks-vision` npm package, version **0.10.14**.

- Package: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.14
- Source: https://github.com/google-ai-edge/mediapipe/tree/v0.10.14
- Upstream license: Apache-2.0, https://github.com/google-ai-edge/mediapipe/blob/v0.10.14/LICENSE
- Model: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
- Model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker

The source URLs, package integrity, file sizes and SHA-256 hashes are recorded in
`manifest.json`. Both WASM variants and their loaders come from the same package
as `vision_bundle.mjs`. Runtime loading uses these local files exclusively.

# HandPose assets

`ml5-1.4.0/ml5.min.js` is the unmodified ml5 **1.4.0** npm release, including
its TensorFlow.js runtime. The original license is included in `ml5-1.4.0/LICENSE.md`.
Package: https://registry.npmjs.org/ml5/-/ml5-1.4.0.tgz
Source: https://github.com/ml5js/ml5-next-gen
Documentation: https://docs.ml5js.org/#/reference/handpose

The two unmodified Google TFJS hand model graphs and weight files use the official
lite version 1 endpoints, documented by TensorFlow's hand-pose-detection package:

- https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/detector/lite/1
- https://tfhub.dev/mediapipe/tfjs-model/handpose_3d/landmark/lite/1
- https://github.com/tensorflow/tfjs-models/tree/master/hand-pose-detection

`tfjs-wasm-4.22.0/` contains the unmodified official TensorFlow.js WASM backend,
matching TFJS 4.22.0 bundled in ml5. Runtime uses the ES2017 loader (required for
native class compatibility) and selects the SIMD or baseline binary locally.
The backend runs with one thread in the hand Worker; no cross-origin isolation
configuration is required.

- Package: https://registry.npmjs.org/@tensorflow/tfjs-backend-wasm/-/tfjs-backend-wasm-4.22.0.tgz
- Source/license (Apache-2.0): https://github.com/tensorflow/tfjs/blob/tfjs-v4.22.0/LICENSE
- Documentation: https://github.com/tensorflow/tfjs/tree/master/tfjs-backend-wasm

Local paths, source URLs, sizes, SHA-256 hashes and npm SHA-512 integrity are in
`hand-manifest.json`. Restore using `node code/download-hands.cjs`. Runtime uses
local files only.

The optional QA-only image `../qa/fixtures/hands.jpg` is from TensorFlow's official
hand-pose-detection test data. Its original URL and SHA-256 are recorded beside it
in `hands-source.json`. It is never loaded by the production application.

# Body pose assets

Pose Landmarker reuses the unmodified tasks-vision **0.10.14** JS/WASM above.
The official Google lite model is pinned to **float16/1**:

- https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
- Documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js
- QA-only official photo: https://storage.googleapis.com/mediapipe-assets/pose.jpg

The original assets, sizes and SHA-256 hashes are recorded in `body-manifest.json`.
Restore with `node code/download-body.cjs`. The photo is only used by tests.
Runtime loads the model locally in a dedicated worker and shares the existing camera.
