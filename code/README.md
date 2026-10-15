# RESONANCE · Live interaction + Demo

正式代码目录为 `code/`，三个核心文件仍为 `index.html`、`style.css`、`sketch.js`。保留 `../figma-reference`；无需 React、Vite 或 npm 安装。所有应用界面文字为英文，HTML 使用 `lang="en"`。

## 本地打开

在 `D:\Shawna\Resonance` 运行 `node code/serve.cjs`，访问 **http://127.0.0.1:4173**。

真实模式需要 localhost 或 HTTPS；不要双击 HTML 使用 `file://` 启动识别。字体仍从 Google Fonts 加载，断网时使用系统字体回退。启动脚本已为 `.mjs`、`.wasm`、`.task` 配置 MIME。

## 两种模式

首页 → **Meet your creature** → 选择三种形态、八种主题色 → 选择：

- **Start interaction**：点击后才申请摄像头及麦克风权限，加载本站 Face Landmarker；只使用真实音频和面部动作信号。
- **Try demo**：独立的模拟模式，不申请设备权限、不加载模型。保留声音、表情、手势及身体控制，明确标注 Demo。

所有非首页界面均保留 **← Home**。Live 中 **End interaction** 和 Home 都会停止所有媒体轨道、关闭 AudioContext、终止识别 Worker。再次开始重新建立一次会话。取消待决权限请求后，若浏览器稍后返回媒体流，也会立即停止其轨道。

Live 的 **Hide preview** 仅隐藏镜像画面，识别继续。工具栏 **Microphone** 会禁用麦克风轨道并清空声音输入，重新开启后再次校准。设备意外断开、权限拒绝、模型失败会显示英文错误及 **Try again**，同时清理会话。页面进入后台暂停分析，返回时重新校准；离开页面通过 `pagehide` 清理设备。

## 信号处理

### 麦克风

- Web Audio Analyser 获取时域样本并计算 RMS，不连接扬声器，不播放自己的声音。
- 开始或 **Recalibrate room noise** 后约 1.3 秒采样，使用较低分位估计底噪；请在这段时间保持安静。
- **Sensitivity** 范围 0.5–3.0。底噪门限、快速上升/缓慢释放的指数平滑共同驱动粒子颤动与波纹。
- 受惊必须超过绝对响度门限、底噪倍数和近期音量基线，同时出现明显上升。
- 一次突增后至少冷却 3 秒，并需连续安静约 0.4 秒重新准备；持续大声不会周期性重复触发。

### 面部动作

- 使用真正的 **MediaPipe Face Landmarker**，`VIDEO` 模式、单张人脸、输出 blendshape 分数；CPU WASM 在独立 Worker 中执行，最多约 12.5 次/秒，最多一帧在处理中。
- 微笑使用左右 `mouthSmile`；悲伤近似信号使用嘴角下垂 `mouthFrown` 和内眉抬起 `browInnerUp`。
- 惊讶需要 **外眉抬起与眼睛睁大同时出现**。`jawOpen` 只增加少量权重，单独张嘴不会触发惊讶。
- 指数平滑、进入/退出不同阈值、300–500 毫秒候选保持时间，减少颜色跳变。丢失人脸会清空目标表达；陈旧结果超过 1 秒也会清空。
- 这些是面部动作的近似映射，不能识别真实心理情绪。光线、角度、眼镜和个体差异会影响效果，需要真人调试。

两种模式共用既有粒子颜色、位移、恢复过程和熟悉度渲染；输入源严格互斥。本阶段没有真实手势/身体追踪或 ElevenLabs。Capture 只下载粒子图像，不含摄像头。

## 固定的本地资源

官方文档：[Face Landmarker for Web](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)。

| 资源 | 固定版本 / 本地路径 |
| --- | --- |
| Google 发布的 `@mediapipe/tasks-vision` | `0.10.14` |
| JavaScript 模块 | `vendor/mediapipe-0.10.14/vision_bundle.mjs` |
| SIMD WASM loader / binary | `vendor/mediapipe-0.10.14/wasm/vision_wasm_internal.js`、`.wasm` |
| 非 SIMD 后备 loader / binary | `vendor/mediapipe-0.10.14/wasm/vision_wasm_nosimd_internal.js`、`.wasm` |
| Face Landmarker 模型 | `models/face_landmarker.task`，Google `float16/1` |

这些文件已下载。运行时不会从 CDN 下载识别库或模型；资源 URL 以 `sketch.js` 的目录解析，支持 Cloudflare 域名根路径及子目录托管。无需跨域隔离头。

下载与校验清单在 `vendor/manifest.json`，记录来源、版本、字节数及 SHA-256。恢复文件可运行 `node code/download-assets.cjs`；脚本从以下官方来源下载，并校验 npm 包的 SHA-512 完整性，提取所需 JS/WASM：

- npm 官方注册表：[tasks-vision-0.10.14.tgz](https://registry.npmjs.org/@mediapipe/tasks-vision/-/tasks-vision-0.10.14.tgz)
- Google 模型：[face_landmarker.task，float16/1](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)

若下载失败，脚本会列出源链接和缺失文件的放置路径。资源缺失时真实模式显示错误，不会偷偷切换成模拟识别。

## 自动检查与手动验收

```powershell
node code/qa-signals.cjs
node code/qa-live.cjs
node code/qa.cjs
```

后两个浏览器脚本需要预览服务器和 `127.0.0.1:9227` Chrome 调试端口。Live 验收须使用 Chrome 的 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` 测试参数；普通用户预览不要使用这些参数。

- `qa-signals.cjs`：生产代码中的真实过滤算法，使用可重复的人工 RMS 和 blendshape 序列；测试底噪、灵敏度、单次突增、冷却、唱歌张嘴排除、表情切换延迟、失去人脸及核心代码无中文。
- `qa-live.cjs`：真实本地 WASM / 模型加载和推理，输入为 Chrome 虚拟设备；测试点击前零权限请求、重复开始、隐藏预览、模式隔离、设备释放、重新进入、权限/设备失败、实际模型 404 后重试、待决权限/加载期间取消及响应式布局。
- `qa.cjs`：原有 Demo、形态、主题、组合边界、熟悉度、PNG 下载和手机触摸回归。
- 截图和报告在 `code/qa/`。自动验证不是实体摄像头或真人识别准确率验证。

真人简测：

1. 点击 **Start interaction**，允许两项权限，等模型就绪并安静约两秒。
2. 轻声说话或哼唱，观察波纹；调整 **Sensitivity**。保持环境安静时不应持续散开。
3. 突然提高一次音量，观察单次散开及恢复；持续发声不应反复受惊。安静片刻后再试。
4. 分别微笑、嘴角下垂并抬内眉、抬外眉并睁大眼睛，各保持约一秒。唱歌时仅张嘴不应自动变紫。
5. **Hide preview** 后继续试表情；返回 Home，确认浏览器设备使用提示消失，再进入一次。
6. 拒绝权限后检查 **Try again**；修改浏览器站点权限后重试。另在实体手机和正式 HTTPS 域名复测。

## Cloudflare Pages

沿用已有仓库连接：Framework preset **None**，Root directory 留空，Build command **exit 0**，Build output directory **code**。生产分支需包含核心文件以及完整的 `code/vendor/`、`code/models/`；不要只上传三个核心文件。构建监听规则也应覆盖资源子目录。

部署后从正式 HTTPS 域名打开首页，在浏览器 Network 面板确认 `.mjs`、被选中的 WASM 文件和 `.task` 返回实际文件（不是 HTML 或 Git LFS 指针），再允许设备权限。仓库中仍没有 Wrangler 配置；本次没有修改 Cloudflare 账户设置或执行线上部署。自定义 CSP 如有配置，需要允许同源资源、`worker-src 'self' blob:` 及 WASM 执行，否则请先调整 CSP。

参考：[Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)。
