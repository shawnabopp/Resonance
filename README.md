# RESONANCE

- `code/`：当前原生 HTML / CSS / JavaScript 网站，含真实麦克风、MediaPipe Face Landmarker、ml5 HandPose、Pose Landmarker 上半身追踪、独立 Demo、本地模型资源与验收脚本。
- `figma-reference/`：保留的 Figma Make 参考项目。

在仓库根目录启动本地预览：

```powershell
node code/serve.cjs
```

打开 http://127.0.0.1:4173 。无需安装依赖或构建。真实模式需要 localhost 或 HTTPS，并在点击 Start interaction 后申请摄像头及麦克风权限；Try demo 无需权限。

Cloudflare Pages：Framework preset 为 `None`，Root directory 留空，Build command 为 `exit 0`，Build output directory 为 `code`。生产分支需包含最新改动以及 `code/vendor/`、`code/models/` 的实际资源文件。

操作、模拟范围、测试和完整部署说明见 [code/README.md](code/README.md)。
