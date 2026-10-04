# 图标与音效来源

正式配对素材为 51 个经典 QQ 连连看图案，未使用 Emoji 或其他图标代替。

- 获取来源：[allfornaruto/ts-kyodai](https://github.com/allfornaruto/ts-kyodai)，一个公开的 QQ 连连看复刻项目。
- 固定版本：`4990ba00e7b796a5a366f7cea78c3bfa8248c15c`。
- 图标：上游 `assets/img/block/icon/1.png` 至 `51.png`，保留原始文件。
- 闪电：上游 `assets/img/lightning_x/lightning_x_1.png` 至 `5.png`，配合 Canvas 绘制合法连接路径、端点光环和粒子。
- 音效：上游 `assets/resources/mp3/` 中的选择、消除、开始、结束、破障和背景音乐素材；使用 Web Audio 与 HTML Audio 播放。
- 每个素材的源地址、文件大小和 SHA-256 校验值见 `public/assets/manifest.json`。
- [图标总览](docs/previews/icons.png)。

视觉核对参考：[QQ 连连看客户端截图](https://github.com/gyk001/QQ_LLK_Cheat/blob/master/raw/llk_demo.png)。企鹅、动物、星星、手势、彩球等图案与参考截图一致。来源为公开复刻项目，不声称这些文件是腾讯官方发布的资源包；音效使用该项目提供的经典素材，尚未通过官方原始包做二进制一致性验证。

背景、障碍物、按钮、布局、登录页和 Logo 在本项目中以 CSS / SVG 实现；界面线性图标使用 Lucide。游戏运行时不依赖外部图片或字体服务。
