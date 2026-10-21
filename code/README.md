# RESONANCE · Live interaction + Demo

正式代码目录为 `code/`，三个核心文件仍为 `index.html`、`style.css`、`sketch.js`。保留 `../figma-reference`；无需 React、Vite 或 npm 安装。所有应用界面文字为英文，HTML 使用 `lang="en"`。

## 本地打开

在 `D:\Shawna\Resonance` 运行 `node code/serve.cjs`，访问 **http://127.0.0.1:4173**。

真实模式需要 localhost 或 HTTPS；不要双击 HTML 使用 `file://` 启动识别。字体仍从 Google Fonts 加载，断网时使用系统字体回退。启动脚本已为 `.mjs`、`.wasm`、`.task` 配置 MIME。

## 两种模式

首页 → **Meet your creature** → 选择三种形态、八种主题色 → 选择：

- **Start interaction**：点击后才申请一次摄像头及麦克风权限，加载本站 Face Landmarker、ml5 HandPose 和 Pose Landmarker；只使用真实音频、面部、手部和上半身关键点信号。
- **Try demo**：独立的模拟模式，不申请设备权限、不加载模型。保留声音、表情、手势及身体控制，明确标注 Demo。

所有非首页界面均保留 **← Home**。Live 中 **End interaction** 和 Home 都会停止所有媒体轨道、关闭 AudioContext、终止识别 Worker。再次开始重新建立一次会话。取消待决权限请求后，若浏览器稍后返回媒体流，也会立即停止其轨道。

Live 的 **Hide preview** 仅隐藏镜像画面，识别继续。工具栏 **Microphone** 会禁用麦克风轨道并清空声音输入，重新开启后再次校准。设备意外断开、权限拒绝、人脸模型失败显示英文错误及 **Try again**，同时清理会话；手势和身体模型失败则只清理各自任务，保留其他互动，并分别提供重试。页面进入后台暂停分析并清空旧表情，返回时重新校准麦克风；已完成的中性面部校准保留，尚未完成的校准中断。离开页面通过 `pagehide` 清理设备。

## 信号处理

### 麦克风

- Web Audio Analyser 获取时域样本并计算 RMS，不连接扬声器，不播放自己的声音。
- 开始或 **Recalibrate room noise** 后约 1.3 秒采样，使用较低分位估计底噪；请在这段时间保持安静。
- **Sensitivity** 范围 0.5–3.0。底噪门限、快速上升/缓慢释放的指数平滑共同驱动粒子颤动与波纹。
- 受惊必须超过绝对响度门限、底噪倍数和近期音量基线，同时出现明显上升。
- 一次突增后至少冷却 3 秒，并需连续安静约 0.4 秒重新准备；持续大声不会周期性重复触发。

### 面部动作

- 使用真正的 **MediaPipe Face Landmarker**，`VIDEO` 模式、单张人脸、输出 blendshape 分数；CPU WASM 在独立 Worker 中执行，最多约 12.5 次/秒，最多一帧在处理中。
- 微笑保留左右 `mouthSmile` 的原有映射。悲伤外观使用 `mouthFrownLeft`、`mouthFrownRight` 和 `browInnerUp`，名称已与 [MediaPipe 官方 blendshape 列表](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/tasks/cc/vision/face_landmarker/face_blendshapes_graph.cc) 核对。`_neutral` 不覆盖其他分数，不将模型分数当作心理情绪。
- 修正旧算法多次相乘造成的过度抑制：旧算法在左右 frown 都为 .25、inner brow 为 .20 时，组合分数约 .186，过不了 .32 阈值。现在提供两条证据路径：平均 frown ≥ .11、弱侧 ≥ .055 且 inner brow ≥ .13；或平均 frown ≥ .24、弱侧 ≥ .10。根据幅度加权评分，再经平滑后 sad 分数 ≥ .28 才进入；不会仅因不笑、闭眼或低头判为悲伤。
- 张嘴 ≥ .45 时，悲伤路径必须同时满足更强的 frown（平均 ≥ .20）和 inner brow（≥ .23），减少说话、唱歌时嘴形变化误触发。有效微笑、惊讶仍会抑制悲伤，切换竞争余量从 .14 降为 .08，避免残留微笑长时间阻挡新表情。此规则不能保证所有唱歌表情均不误判。
- 惊讶需要 **外眉抬起与眼睛睁大同时出现**。`jawOpen` 只增加少量权重，单独张嘴不会触发惊讶。
- 指数平滑时间常数约 167 ms，smile 候选保持 300 ms、surprise 400 ms、sad 650 ms、neutral 400 ms，保持阈值 .18。进入 sad 后将动画强度适度提升，沿用现有蓝色渐变、缓慢下沉、聚拢和渲染平滑。Demo 的强度控制保持原样。丢失人脸、陈旧结果超过 1 秒或切到后台都会清空旧判断，后台及迟到帧不会参与校准或表情累积。
- 这些是面部动作的近似映射，不能识别真实心理情绪。光线、角度、眼镜和个体差异会影响效果，需要真人调试。

**Expression diagnostics** 默认折叠，在 Live 控制面板中展开。显示原始分数（缺失为 `—`）、扣除中性基线后的 frown / brow、平滑证据、最终及候选表情、候选保持时间、实际判断阈值、动画强度。面板每 250 ms 更新，折叠时不刷新表格；动画强度不是识别置信度。

### 根据五张真人诊断截图调整（2026-10-19）

用户提供了平静、轻微悲伤、惊讶、微笑、张嘴说话五张诊断截图。数值转录到 `qa/fixtures/expression-screenshots.json`，不会作为产品中的个人默认基线。惊讶截图的外眉均值 .1255、睁眼 .030 低于原来的 .22 / .15 门槛，归一化后都为零；悲伤的 frown 均值 .010 低于 .11 门槛。两者 mouthSmile 都为零，因此截图中的失败不是微笑覆盖，而是进入特征组合前就被门槛挡住。截图能证明这些帧的模型输出发生了变化、最终仍为 Neutral；不能证明后续时间稳定性或所有真人动作的分布。

保留上面的较强表情路径，同时增加显式中性校准后的相对路径。微笑公式保持原样。每次进入 Live 后，正对镜头，放松眉毛和嘴角，点击 **Calibrate neutral** 约两秒；程序采集全部 12 个相关分数的中位数，以及 MAD 和 10–90% 分位范围一半中的较大值作为噪声。有效变化门槛取下述最小值与四倍对应噪声的较大者。基线不会随着正在做的表情自动漂移，校准也不根据心理情绪作判断。校准后的较强惊讶路径同样扣除个人基线，避免较高的静态眉眼分数直接触发。

- **相对惊讶 A**：外眉均值增加 ≥ .025、弱侧 ≥ .012，睁眼均值增加 ≥ .012、弱侧 ≥ .007；嘴巴可以闭合或轻微张开。
- **相对惊讶 B**：内眉增加 ≥ .045，外眉均值 ≥ .018，睁眼均值 ≥ .008，张嘴增加 ≥ .12；同样要求外眉/眼睛弱侧的变化。加权组合强度取代多次相乘压低微弱分数；两条路径都不能单凭张嘴触发。说话截图虽然内眉和嘴巴也变化，但睁眼增量不足，仍保持 Neutral。
- **相对悲伤外观**：嘴角下垂均值增加 ≥ .004、弱侧 ≥ .003，内眉增加 ≥ .018，再要求眉毛下压均值增加 ≥ .010，或内眉增量减外眉增量 ≥ .035。嘴巴原始开度 < .25 且增量 < .10。嘴角、内眉、眉形必须共同变化，之后仍需平滑分数越过 .28 并保持候选 650 ms。不是凭不笑、闭眼或低头判断；这些精细阈值需要真实连续视频继续复测。

这一位用户的轻微悲伤相对平静为：frown 均值 +.008、弱侧 +.006、内眉 +.033、眉毛下压均值 +.021、内外眉对比 +.074；惊讶外眉 +.053、睁眼 +.0185。截图值回放已验证新路径能接受这两组值，且微笑、平静及张嘴说话的结果保留。**截图数值被重复作为静态序列回放，校准噪声在此理想序列中为零，绝不等同于修改后的真人摄像头测试。**另用合成噪声验证有效门槛会随波动升高。

面板为 smile / sad / surprise 分别显示特征条件失败、分数不足、竞争抑制、候选确认时间和丢失状态；新增有符号相对变化、当前有效变化门槛和通过的路径。动画栏显示 `target`（传入粒子的表情强度）与 `rendered`（渲染平滑后的强度）、颜色、速度和舒展度，可区分判断与动画响应。`browDownLeft/Right` 参与新的悲伤眉形路径；缺少任何一项相关分数时，相对路径不会运行，面板会提示。

真人采样步骤：刷新本地预览 → Start interaction → 展开 Expression diagnostics。选择 **Expression you are trying** 标签，然后点击 **Sample for 3 seconds** 并保持该表情。先采 Neutral，再采 Slight sad-looking expression、Surprise、Smile 和 Speaking / singing。各标签可重新采样覆盖；保持同一光线、距离和会话。完成后用 **Copy samples** 将文字贴回开发对话；优先给平静与惊讶两组也可以。剪贴板不可用时，直接复制下方文本框。

导出记录包含原始分数均值/范围、相对 Neutral 样本的变化、实际用于分类的中性校准基线、最后一帧的判断理由及动画传递数值。`intended` 是用户选择的动作标签，不能当作模型判定；采样时的 Neutral 对照仅用于诊断，不会自动更改分类器基线。需至少六个新鲜采样点且跨度两秒；人脸丢失、后台或正在校准会中断采样。数据仅留在当前标签页，无照片、无音频、不会自动上传；Home / End interaction 清除。重新校准后建议重新采集全部对照标签。

自动测试覆盖诊断原因、截图值回放、合成分数采样与相对值、动画传递、剪贴板失败时手动复制及丢脸取消。浏览器测试使用真实本地模型、虚拟摄像头与显式替换的分数，**不代表修改后真人惊讶或轻微悲伤的准确率**。下一步需真人复测，尤其是连续说话、唱歌、低头、光线变化和不同人的自然表情，必要时再提供三秒采样数据。

**Calibrate neutral** 至少采集 12 帧连续稳定样本；明显微笑、张嘴、分数波动或超过 350 ms 的采样间隙会重新等待稳定窗口，8 秒无法完成会提示重试。人脸丢失或后台切换会中断未完成的校准；已有基线和噪声估计保留。**Reset calibration** 清除基线；Home / End interaction 自动清除会话基线。无校准时保留较强表情的判断；轻微表情请先校准，光线或镜头角度改变后重做。

真人简测：刷新页面，进入 Live，展开面板并完成中性校准；分别做轻微悲伤、惊讶（可仅轻微张嘴）、微笑，各保持 1–2 秒，中间恢复平静。对照 Raw scores、相对变化、通过路径、Final 与蓝色/紫色行为，再检查张嘴哼唱、闭眼和低头。若仍不响应或误判，请采集三秒数据，尤其保留校准噪声与实际门槛；不同人、弱光、眼镜及实体手机仍需现场验证。

两种模式共用既有粒子颜色、位移、恢复过程和熟悉度渲染；输入源严格互斥。尚未接入音效或 ElevenLabs。Capture 只下载粒子图像，不含摄像头。

### 手势

- 使用固定 **ml5 1.4.0 HandPose**，TFJS runtime、单手、lite 模型。直接复用 `#camera` 的媒体流，将帧传入独立 Worker，完整画面等比例缩小到最长边 320 像素后分析；不会再次申请摄像头。使用官方 `detect(ImageData)`，未开启库内连续循环，不需要 p5.js 或 DOM 模拟。
- 手腕和四个指根的平均位置作为掌心；`1 - x / width` 与镜像预览一致，`y / height` 映射到粒子画布的实际 CSS 尺寸。预览使用 contain，保证完整画面可见；竖屏和横屏均不裁剪关键点来源。
- 由四指伸展比例及弯曲程度计算张开程度，优先使用模型 3D 点。位置和张开程度指数平滑，有置信度进入/保持阈值、死区、两帧确认、异常跳点过滤。手离开后保留最后坐标并逐渐减弱跟随和舒展。
- 速度按实际取帧时间与视频最长边归一化。连续两帧快速移动才触发退缩；至少冷却 3 秒，并需约 0.5 秒慢下来重新准备。连续挥动只触发一次，熟悉程度不减。
- 最多约 8 次/秒单次检测；根据推理耗时延长间隔，每次结果后留出休息时间，始终只允许一帧在处理中。粒子在主线程 requestAnimationFrame 绘制；模型加载和推理均在独立 Worker，避免软件计算阻塞画面。实际识别频率由设备能力决定，需要实体手机复测。
- Home / End interaction 停止调度、终止手势与人脸 Worker、释放摄像头和麦克风；迟到帧也会丢弃。再次进入创建单个新手势任务，上一任务已经释放。隐藏页面不提交新检测，旧结果不会写回。
- 手势加载/检测失败显示独立英文提示与 **Retry hand tracking**，不会停止表情和麦克风。无模拟兜底。只看到手时会唤醒运动；熟悉程度的时间增长仍需人脸在场。

官方接口：[HandPose 文档](https://docs.ml5js.org/#/reference/handpose)、[ml5 HandPose 源码](https://github.com/ml5js/ml5-next-gen/blob/main/src/HandPose/index.js)。

本地资源：`vendor/ml5-1.4.0/ml5.min.js`（内含 TFJS **4.22.0**）、`vendor/tfjs-wasm-4.22.0/`（同版本官方 ES2017 加载器及 WASM）、`models/handpose-detector/` 与 `models/handpose-landmark/`（各包含 `model.json` 和 `group1-shard1of1.bin`）。WASM 加速在独立 Worker 中运行，单线程，无需配置跨域隔离；运行前检查 TFJS 版本一致性。ES5 后端无法继承 ml5 包内的原生类，因此使用官方 `tf-backend-wasm.es2017.js`。

来源、版本、SHA-256 记录于 `vendor/hand-manifest.json`，许可说明见 `vendor/THIRD_PARTY.md`。恢复命令：`node code/download-hands.cjs`。脚本校验 npm SHA-512，从官方 TF Hub 下载 lite/1 模型图与全部权重；运行时仅使用同源相对路径，适用于 Cloudflare Pages。提交代码时一并包含这些 JS、WASM、JSON 和 BIN 资源。

### 身体姿态

采用 **MediaPipe Pose Landmarker Lite**：复用现有 `@mediapipe/tasks-vision` **0.10.14** JS/WASM，新增长度约 5.8 MB 的官方 `lite/float16/1` 模型，不引入另一套前端库。保持原有 ml5 HandPose，不用身体模型替代手势。

- 一个 `#camera` 视频流供三种视觉任务取帧。人脸独立 Worker 保持响应，手势和身体各有一个 Worker，共用单个推理时段：忙时丢弃新帧，不建立等待队列。手势最多约 8 Hz、身体最多约 6 Hz，依耗时自动降频，并在结果后留出间隔；实际频率取决于设备。
- 初次依次启动人脸、手势、身体模型。身体加载不占用推理时段，因此下载缓慢或失败不会阻塞已有互动。身体最多处理一帧，输入保留长宽比并缩小至最长边 384 像素，单人、无分割遮罩。
- 肩、肘、腕先按视频尺寸转为像素，采用肩宽归一化位移和关节变化。进入/保持置信度门限为 0.65/0.5，同时检查可见度、存在概率、是否在画面内及最小肩宽。仅脸部近景、肩膀猜测不足以激活身体互动。
- 以进入画面时的肩膀中心作为摇摆基准，左右方向与镜像预览一致。双臂展开或抬起提供上浮和舒展；单臂丢失不凭空推测另一侧。运动强度来自真实经过时间内的身体平移及相对关节速度，距离变化与异常突跳会过滤。
- 身体摇摆是围绕手势目标的小幅偏移；手在场时削弱身体位置偏移，握拳时削弱身体扩张。身体只控制整体摇摆、上浮、旋转、流动与舒展，不触发受惊；颜色、声音波纹继续独立叠加。
- 停止运动后逐渐恢复；短暂识别失败有容差，超过约一秒无新可靠结果则平滑退回自主状态。身体在场可以唤醒运动；熟悉程度仍按人脸在场的实际时间增长，不改变既有陪伴逻辑。
- Home / End interaction / 离开页面终止所有 Worker 与设备；后台停止送帧并丢弃旧结果，返回后重新建立姿态基准。身体故障显示 **Retry body tracking**，重试不再申请摄像头。
- Demo 增加 **Lean** 和 **Arms**，保留 **Movement** 持续摇摆，可与手势、表情、声音共同验证；真实模式不读取这些模拟输入。

文档：[官方 Web 指南](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js)。模型为 `models/pose_landmarker_lite.task`，来源及 SHA-256 见 `vendor/body-manifest.json`。恢复命令：`node code/download-body.cjs`。`qa/fixtures/pose.jpg` 是 Google 官方测试照片，仅验收脚本使用，产品代码不加载它。Cloudflare Pages 输出目录仍为 `code`，需把新模型一并提交，无需修改构建命令。

### 在场、熟悉度与休息

- 旧版增长只来自表情、声音或动作的加权总和；没有任何动作时为零。现改为 Face Landmarker 持续检测到人脸就增长，不依赖 blendshape 表情分数。
- 安静在场每秒增加 0.006：从 4% 开始，约 60 秒到 40%，120 秒到 76%。微笑、轻声和温和手势可以加速；平静或悲伤不扣进度。
- 大声的散开/恢复事件与关系状态分开；即使受惊，只要仍在场，基础增长继续，不重置进度。
- 丢脸即暂停增长、保留进度。约 8 秒无人后逐渐休息，24 秒左右达到完全休息；休息仍清晰可见。回来后自然醒来，接着已有进度增长。
- 熟悉后体态更靠近、轻微主动摆动，对镜像人脸位置和手势的跟随意愿提高。姿态动作叠加在这个关系状态上，不会重置熟悉程度。
- 关系使用真实时间戳，与动画的限幅步长分离。超过一秒的陈旧识别结果停止贡献；新到场前的空白不补算。后台暂停计时，回来等待新的人脸帧。
- Demo 默认开启 **Face in view**，安静也增长；关闭以验证暂停和休息，**Face position** 可比较跟随意愿。两种模式使用同一个关系计算器。Reset 保留进度；Start fresh 和 Home 与原有行为一致，会重置熟悉度。

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
node code/qa-expressions.cjs
node code/qa-expression-browser.cjs
node code/qa-familiarity.cjs
node code/qa-hands-filter.cjs
node code/qa-hands.cjs
node code/qa-body-filter.cjs
node code/qa-body.cjs
node code/qa-presence.cjs
node code/qa-live.cjs
node code/qa.cjs
```

所有浏览器脚本（qa、qa-live、qa-presence、qa-hands、qa-body）需要预览服务器和 `127.0.0.1:9227` Chrome 调试端口，按顺序运行。Live 验收须使用 Chrome 的 `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` 测试参数；普通用户预览不要使用这些参数。

`qa-expressions.cjs` 用合成 blendshape 序列检查中等/不对称 frown、双侧强 frown、微笑竞争、防误判、时间平滑、校准和丢失；`qa-expression-browser.cjs` 同样需要上述预览与虚拟设备 Chrome，实际加载本地模型，但**显式替换返回的面部分数**以检查 Live → 粒子蓝色/减速/下沉/聚拢、面板、校准、320/390 px 布局及清理。结果见 `qa/expression-*-report.json` 和截图；两者都不能证明真人悲伤表情识别效果。

`qa-familiarity.cjs` 使用生产关系计算器验证 5–144 FPS、不规则时间间隔、1–2 分钟安静陪伴、悲伤不扣进度、受惊不扣进度、离场休息、重返、陈旧数据和后台暂停。`qa-presence.cjs` 验证浏览器连接与 Demo 控件，测试中明确注入人工人脸位置；它同样需要上述预览服务器与虚拟设备 Chrome，不能代表真人识别准确率。

- `qa-signals.cjs`：生产代码中的真实过滤算法，使用可重复的人工 RMS 和 blendshape 序列；测试底噪、灵敏度、单次突增、冷却、唱歌张嘴排除、表情切换延迟、失去人脸及核心代码无中文。
- `qa-live.cjs`：真实本地 WASM / 模型加载和推理，输入为 Chrome 虚拟设备；测试点击前零权限请求、重复开始、隐藏预览、模式隔离、设备释放、重新进入、权限/设备失败、实际模型 404 后重试、待决权限/加载期间取消及响应式布局。
- `qa.cjs`：原有 Demo、形态、主题、组合边界、熟悉度、PNG 下载和手机触摸回归。
- 截图和报告在 `code/qa/`。自动验证不是实体摄像头或真人识别准确率验证。
- `qa-hands-filter.cjs`：生产 HandFilter + 人工关键点，验证张开/握拳、镜像、竖横视频尺寸、连续挥手、冷却/重新准备、丢失和跳点。
- `qa-hands.cjs`：实际 ml5、模型与虚拟摄像头共同推理及动画帧推进；另使用 TensorFlow 官方 `hands.jpg` 验证真实检测模型和关键点模型均能识别张开的手。人工关键点专项验证粒子连接；单摄像头/单手势 Worker/单推理、预览隐藏、独立失败重试、实际模型 404 后恢复、退出丢弃旧结果、重进无重复任务、320/390 宽度及手机横屏。
- 官方照片仅在测试脚本中替换 Worker 输入，不会进入产品互动。文件在 `qa/fixtures/hands.jpg`，来源与校验在 `hands-source.json`；可用 `node code/download-hands.cjs --fixture` 恢复。照片测试仍不等同于真人摄像头测试。

本次身体验收：`qa-body-filter.cjs` 检查尺度归一化、置信度、镜像、远近、抬臂/展开、动态强度、恢复、丢失和共享调度；`qa-body.cjs` 实际加载三套识别模型，用官方姿态照片验证真实关键点，再用明确标注的人工动作序列检查粒子响应、手势/表情组合、后台暂停、设备/Worker 清理、非阻塞故障、实际模型 404 与重试、移动布局和 Demo。报告与截图为 `qa/body-*`。虚拟设备、照片和人工序列不代表真人动作准确率，也未验证实体 iPhone、Android 或 Safari。

身体真人简测：电脑后退到肩、肘、腕可见；手机先放稳，再后退。左右缓慢摆动，双臂分别抬起、展开、收回；持续轻舞 5–10 秒后停下，观察旋转流动是否渐缓。保持类似动作，前后改变距离比较强度。握拳并移动手掌，确认仍能主导跟随/聚合；同时微笑或说话，确认颜色和波纹共存。靠近至仅脸部可见，身体响应应渐退、表情声音继续。最后隐藏预览、切换后台、返回 Home 并重新进入，检查识别恢复与设备指示灯。低光、遮挡、多人、具体设备性能仍需现场测试；程序不识别舞种。

其他真人交互检查：

1. 点击 **Start interaction**，允许两项权限，等模型就绪并安静约两秒。
2. 轻声说话或哼唱，观察波纹；调整 **Sensitivity**。保持环境安静时不应持续散开。
3. 突然提高一次音量，观察单次散开及恢复；持续发声不应反复受惊。安静片刻后再试。
4. 分别微笑、嘴角下垂并抬内眉、抬外眉并睁大眼睛，各保持约一秒。唱歌时仅张嘴不应自动变紫。
5. **Hide preview** 后继续试表情；返回 Home，确认浏览器设备使用提示消失，再进入一次。
6. 拒绝权限后检查 **Try again**；修改浏览器站点权限后重试。另在实体手机和正式 HTTPS 域名复测。
7. 等 HandPose 就绪，将一只完整手掌放进画面，慢慢左右移动，确认粒子与镜像预览同向；张开、握拳各保持 1–2 秒。先安静陪伴 1–2 分钟，再比较跟随距离。
8. 快速挥动一小段应退缩一次，连续挥动不应反复散开；停住至少 3 秒再挥。手离开后应平滑回到自主漂浮，重新出现不应凭空受惊。
9. 边微笑/轻声说话边移动手，检查颜色、波纹与跟随共存；Hide preview 后继续识别，Home 后设备使用提示消失，再进入可恢复。实体手机注意帧率、弱光和侧手误判，这些未由虚拟摄像头验证。

## 独立音效试听

独立音效试听页为 `sound-test.html`：在 VS Code 右键 **Open with Live Server**，或运行现有预览服务器后访问 `http://127.0.0.1:4173/sound-test.html`。此页没有接入主网站，现有 BGM、开启音效与主页面代码不受影响。

试听页最终保留四类声音：**Wake、Curious、Happy、Afraid**。Curious 采用已确认的 Pure 音色，保留原参数：音量 30%、起始音高 280 Hz、上扬 2 半音、波动深度 30%、时长 1.2 秒；原来的另两个候选版本及其控件已移除。Happy 基于同一圆润正弦主音，加入少量二次泛音和更温暖的持续段，以连续平滑的曲线做出两次音高起伏，第二次略高，之后回落并自然淡出；起始音高仍有 1 半音轻微抬升，峰值变化幅度为滑块数值再加 .7 半音。默认设置下，两次峰值约 333 / 346 Hz，中间保持连续声音，轻微水波感来自缓慢的泛音和滤波变化。无分立音符、静音间断或新噪声层。Curious 时长仍为 1–1.5 秒、默认 1.2 秒；Happy 改为 **1.5–2 秒、默认 1.8 秒**，切换声音时自动切换时长滑块范围，Reset 恢复所选声音各自的默认值。Curious / Happy 各自保留音高、上扬、波动、时长的调节值，共享 Volume；调整 Happy 再切回 Curious 不会改掉后者的参数。

Wake 与 Afraid 读取 `sounds/wake.mp3` 和 `sounds/afraid.mp3`，分别提供 **Original / Adjusted**。已确认两份文件含 MPEG Layer III 帧，解码时长约 0.614 / 0.499 秒。原版仅应用公共 Volume；调整版在浏览器内处理，不覆盖原文件，也没有另存修改后的 MP3。选择录音时只启用 Volume，其他合成音滑块保持数值但不影响录音。所有按钮共用一个播放通道，Replay 重播最后选择，Stop 停止，切换时先淡出旧声音。

根据音频数据，两份文件都从非零采样开始，无明显前导静音；末尾低电平区域约 39 / 34 ms，保留，不裁掉中间间隔或尾音。Afraid 加 8 ms 渐入、35 ms 渐出；Wake 为 28 / 55 ms。保持 1× 播放速度、不改音高、不添加滤波或新声音层。对较强瞬态使用联动双声道的平滑增益，最多约 4 dB 衰减，再参考已调好的有效片段 RMS（30% 音量下 .10540948）作近似电平调整；固定保留该参考值，避免删除旧候选音色时改变已经调整过的 MP3。默认 30% 音量的峰值上限为 .45，60% 上限为 .90。

**没有进行直接听音评估，也不是 LUFS 感知响度匹配。**请以 30% Volume 对比 Curious 与 Happy，确认后者是否足够温暖、明亮、愉悦；再交替试听两份录音的 Original / Adjusted，确认音色、退缩感和苏醒感。数据报告在 `qa/source-sound-analysis.json` 与 `qa/sound-test-report.json`；`qa/fixtures/approved-pure.json` 保存重命名前的参数和渲染指标。`node code/tools/analyze-sounds.cjs` 只解码分析、不播放；`node code/qa-sound-test.cjs` 检查 Curious 原参数及指标、Happy 时长与边界、独立调参、实际解码、原版逐采样一致、源文件校验、渐变边界、峰值、互斥播放、失败重试与手机布局。两条命令需要本地服务器与 Chrome `:9227` 调试端口，仍不能替代真人试听或实体手机测试。

## Cloudflare Pages

沿用已有仓库连接：Framework preset **None**，Root directory 留空，Build command **exit 0**，Build output directory **code**。生产分支需包含核心文件以及完整的 `code/vendor/`、`code/models/`；不要只上传三个核心文件。构建监听规则也应覆盖资源子目录。

部署后从正式 HTTPS 域名打开首页，在浏览器 Network 面板确认 `.mjs`、被选中的 WASM 文件和 `.task` 返回实际文件（不是 HTML 或 Git LFS 指针），再允许设备权限。仓库中仍没有 Wrangler 配置；本次没有修改 Cloudflare 账户设置或执行线上部署。自定义 CSP 如有配置，需要允许同源资源、`worker-src 'self' blob:` 及 WASM 执行，否则请先调整 CSP。

参考：[Cloudflare build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)。
