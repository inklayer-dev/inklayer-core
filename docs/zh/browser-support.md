# 浏览器支持

InkLayer Core 将构建工具兼容性与浏览器运行时交互支持分开验证。打包后的 Vite/Webpack 矩阵在 `docs/consumer-build-matrix.md` 中独立说明，参阅[构建工具支持](./consumer-build-matrix.md)；本文记录真正运行过 Viewer 与 Annotation 应用的浏览器。

## 当前声明

| 引擎 | Playwright 构建 | 状态 | 证据 |
|---|---|---|---|
| Chromium | Chromium 1234 | 已验证 | 14 个自动化 Vanilla 场景，以及 Viewer/Worker、Range、恢复、缩放、批注、键盘焦点、长文档和栅格打印检查，均无意外控制台警告或错误。 |
| Firefox | Firefox 1538 | 已验证 | 同一组 14 个场景通过，包括结构化恢复、Range、混合页面几何、长文档生命周期压力、跨页选择、键盘移动/焦点、菜单交接和减弱动态效果。 |
| WebKit | WebKit 2336 | 已验证 | 同一组 14 个场景通过，包括结构化恢复、Range、混合页面几何、长文档生命周期压力、跨页选择、键盘移动/焦点、菜单交接和减弱动态效果。 |

当前声明覆盖 Chromium、Firefox 和 WebKit。这些 Playwright 构建是可复现的发布基线，不代表验证了所有历史浏览器或每个 Safari 厂商版本。

## 运行时覆盖面

三个浏览器项目共享同一组 14 场景测试，覆盖：

- 零配置 PDF.js Worker 加载与页面渲染；
- 生成字节、加密 PDF 密码、本地文件、HTTP Range，以及进度、取消、重试、请求头和反复加载；
- 缩略图、目录、搜索高亮、同页/跨页文字选择和“先选择再创建”文字批注；
- 内置与自定义批注、图片签名/盖章、选择、变换、FreeText、评论、Tag 和原生批注导入；
- 单页/连续布局缩放预设、Ctrl/Meta + 滚轮缩放和双指反向捏合；
- 文档内键盘选择/移动/删除、可见语义焦点、FreeText 焦点恢复、TextLayer 菜单交接和减弱动态效果导航；
- 栅格打印准备、PDF/Excel 导出、多实例隔离、重新挂载清理和移动端断点；
- 确定性的 96 页搜索、虚拟页面挂载、缩略图/object URL 抖动、反复缩放、取消和文档替换；
- URL、Range、密码错误、栅格渲染和主动取消加载的结构化恢复与实例级成功重试；
- 浏览器控制台警告、错误和未捕获页面异常。

## 命令

默认本地发布检查使用已安装的 Chromium 基线：

```sh
npm run test:browser
```

另外两个引擎只需安装一次，然后运行完整声明矩阵：

```sh
npx playwright install firefox webkit
npm run test:browser:matrix
```

CI 会安装全部三个引擎，先通过 `npm run check` 运行 Chromium，再把 Firefox 和 WebKit 项目作为第二道浏览器门禁。
