# TUI 保持零依赖，只借鉴 pi-tui 的渲染思路

pi 的界面由自研库 `@earendil-works/pi-tui` 渲染，它有差分渲染、`requestRender()` 合并重绘、
组件模型与 `MouseRegion`／`ScrollView`。该库随 pi 一起装在本机
（`~/.pi/agent/install/releases/*/node_modules/@earendil-works/pi-tui`），观感上可以直接对齐。

但 `assets/tui.js` 现在最重要的性质是「拷进 `~/.local/bin` 就能跑」：运维命令装在
`~/.local/bin`，没有 `node_modules`，因此它只用 Node 内建模块与手写 ANSI。引入 pi-tui
会破坏这个性质——它是 ESM，且版本与 pi 绑定，必须随包 vendor 一份第三方代码并跟随上游更新。

因此决定：不引入依赖，保持零依赖手写 ANSI；只借鉴 pi-tui 的渲染思路，把 `render()`
从全屏重写改为行级差分。

## Consequences

- 每个 provider 页仍然按 `{status, sections, menu}` 这三个字段组织内容，渲染器不为
  「每个 provider 都有服务面板」这类对称性做抽象——Qoder 没有常驻服务，不该显示一个空面板。
- 宽度跟随终端（上限 160 列），高度按 `process.stdout.rows` 铺满，保持单列；
  终端窄于 76 列时左右分栏退成上下单栏。
- 差分渲染只缓存行数组、重写内容变化的行，不做单元格级 diff：颜色状态跨单元格、CJK 双宽
  字符边界都容易算错，代价是屏幕错位。
- 进入界面时开启 SGR 鼠标追踪（`1000h` + `1006h`）并吃掉鼠标事件。这是必要的：
  备用屏只换了画布，终端的滚动缓冲仍然存在；不接管滚轮的话，滚轮事件由终端自己处理，
  会把整个界面滚出去。pi 的 fullscreen 模式同样自己接管滚轮。
- Ctrl+C 在原始模式下不会产生 SIGINT（Node 文档明确说明），现有代码手工处理 `\x03` 的做法保留。
