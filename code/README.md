# RESONANCE · Vanilla Demo

第一阶段原生移植。核心运行文件只有 `index.html`、`style.css`、`sketch.js`，不需要 React、Vite、npm 安装或构建。新版统一位于 `code/`。原始 `../figma-reference` 和 Git 配置保留；仓库根目录原有的三个同名空文件已确认无依赖、无独有内容后删除。

## 打开

在工作区 `D:\Shawna\Resonance` 运行：

```powershell
node code/serve.cjs
```

访问 **http://127.0.0.1:4173**。也可以直接用浏览器打开 `code/index.html`。字体通过 Google Fonts 加载；断网时使用系统字体回退。预览服务器只监听本机。服务器以脚本所在目录为网站根目录，网页中的 CSS、JavaScript 使用相对路径。

首页 → **Meet your creature** → 选择 Seed / Cloud / Bloom 和八种原配色 → **Enter Demo**。每个非首页界面都有左上角 `← Home`。

## 检查反应

| Demo 输入 | 操作与反应 |
| --- | --- |
| 微笑 | 点“微笑”，调整表情强度：暖黄、舒展、轻快起伏并靠近。 |
| 悲伤 | 点“悲伤”：变蓝、明显减速、下沉、聚拢。 |
| 惊讶 | 点“惊讶”：变紫，约 3.5 秒内完成展开与恢复；再次点恢复中性。 |
| 声音 | 音量越高，波纹与颤动越强；“持续声音”模拟周期起伏；“突然大声”或快速拉高音量触发一次散开，约 4.2 秒恢复。 |
| 手势 | 开启跟随，在粒子区慢移鼠标、拖动手指或使用方向键；张开/收拢滑块控制形态。快速移动或“快速挥手”触发短暂退缩，约 2.7 秒恢复。 |
| 身体 | 摇摆幅度增加时，整体平移、摇摆角度和旋转速度同时增加。 |
| 组合 | 表情、声音、手势、身体可以同时生效；表情按钮相互切换。 |
| 熟悉度 | 初始 4%。温和的表情、声音、手势或动作持续后增长；靠近幅度与跟随速度随之增加。空闲不自动增长。 |

`Reset` 清空输入、保留熟悉度；Help 中“重新认识”和返回 Home 会重置熟悉度。形态与主题在返回 Home 后保留。`Demo sound` 只控制模拟声音信号，不播放真实音频。`Capture` 下载当前粒子画面的 PNG，无闪白动画。

手机使用固定粒子区域与独立滚动的控制面板，拖动手指时不会带动页面；在面板内滚动可访问下方控制。系统设置“减少动态效果”时，降低运动幅度和速度。

## 原项目反应偏弱的原因

- `creature.ts` 初始熟悉度为 0.04，手势权重 `0.1 + fam * 0.6` 约为 0.124，随后又经过较慢的位置平滑。
- 悲伤只影响 6% 的扩张比例，没有单独的下沉位移；声音的整体扩张系数仅 0.12。
- 惊讶使用持续的扩张目标，没有独立的一次展开、恢复包络。
- `tracking.ts` 中有表情激活阈值、手/身体采样降频及速度平滑，叠加渲染平滑后反应更弱。
- `App.tsx` 的手机 Demo 浮层覆盖画面；原手势首次位置从 (0,0) 起算，可能产生误触发。

保留原始三种粒子分布、透视与叠加发光的渲染思路。此次增加独立事件包络、明显的中心位移、持续波动与熟悉度反馈，并通过柔和椭圆边界压缩控制最大组合输入。核心更新使用秒制时间与指数平滑，切换形态会插值，切到后台会暂停更新。

## 模拟范围

全部表情、音量、手势开合、身体动作都是 **Demo 模拟输入**。鼠标和触摸是真实浏览器输入，但只用于模拟手的位置。没有调用摄像头、麦克风、MediaPipe、语音识别、ElevenLabs，也没有录音或上传。未来真实输入可映射到 `Creature.s` 信号边界。

## 验证

`qa.cjs` 使用 Chrome DevTools 协议执行页面与反应验收，需已有 `127.0.0.1:9227` Chrome 调试端口和预览服务器。运行 `node code/qa.cjs`。截图及检查报告保存在 `code/qa/`。

已检查桌面、320/375/390 手机宽度、768 平板和横屏布局、真实鼠标与模拟触摸事件、各类反应、组合输入不越界、熟悉度增长、形态/主题切换、帮助对话框及减少动态效果。手机验证为 Chrome 设备模拟，尚未在实体手机上检查。

## Cloudflare Pages 部署

在 Cloudflare 控制台进入 **Workers & Pages → 已连接此仓库的 Pages 项目 → Settings → Build / Builds & deployments → Build configuration**，使用下列同一组设置：

| 设置 | 值 |
| --- | --- |
| Framework preset | `None` |
| Root directory | 留空，使用仓库根目录 |
| Build command | `exit 0` |
| Build output directory | `code` |
| Production branch | 选择包含此次改动的生产分支；本地当前为 `main`，请与线上设置核对 |

以上设置直接发布 `code/` 的内容，因此 `code/index.html` 对应网站的 `/`，不用访问 `/code/`。无需运行本地 `serve.cjs`，也无需运行 Figma 参考项目的 Vite 构建。不要同时将 Root directory 和 Build output directory 都设置为 `code`，否则会查找 `code/code`。

若已设置 Build watch paths，将旧目录的包含规则改为 `code/*`，并确认没有排除该目录；若使用默认包含全部路径，则无需更改。规则路径以仓库根目录为基准。

保存设置后，将此次目录改动提交并推送到对应生产分支，触发一次新的生产部署。确认部署关联的 commit 是新提交，部署成功后打开正式域名根路径，检查 `RESONANCE` 首页、`Enter Demo`，以及 `/style.css`、`/sketch.js` 加载成功。浏览器若仍展示旧内容，可强制刷新后复查。

仓库当前没有 Wrangler 配置文件；本次未修改 Cloudflare 账户设置，也未执行提交、推送或线上部署。直接发布整个 `code/` 也会使其中说明、测试脚本和 QA 图片作为静态文件可访问。

官方参考：[Build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)、[Static HTML](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/)、[Build watch paths](https://developers.cloudflare.com/pages/configuration/build-watch-paths/)。
