# 在在线示例中体验 InkLayer Core

在开始接入前，[在线示例](https://inklayer-dev.github.io/inklayer-core/demo/)是了解 Core 能力最快的方式。它是完全使用本文档公共 API 构建的 Vanilla 应用，不是另一套展示专用实现。

## 打开和浏览 PDF

页面会自动打开内置示例。使用 **Open PDF** 选择本地文件，然后体验页码导航、缩放预设、连续滚动、缩略图和目录。**Password PDF** 与 **URL Range PDF** 展示密码请求、分块加载、取消和重试。

## 搜索并创建文字批注

打开 **Search**，搜索 `Core` 并在结果间切换。创建文字批注：

1. 选择文字选择工具；
2. 在 PDF 中选择文字；
3. 从选择操作中点击 **Highlight**、**Underline** 或 **Strikeout**。

这是推荐交互：先选择真实 PDF 文字，再让 Core 根据选择创建页内批注。

## 绘制和编辑批注

选择 **Rectangle**，在页面上绘制，然后拖动或缩放。继续体验 Freehand、Free Highlight、Polygon、Cloud、FreeText、Note、Signature 和 Stamp，观察 Core 为不同类型提供的交互差异。

外围工具面板和属性控件属于示例应用；绘制、命中测试、变换、键盘行为和批注数据属于 Core。

## 体验自定义批注插件

在 **Annotation plugin** 中点击 **Install Measurement plugin**，工具面板会出现 Measurement。绘制一个测量批注，再卸载并重新加载插件：批注数据会一直保留，兼容 Definition 恢复后重新正常渲染。

## 打印和导出

点击 **Print** 打开浏览器打印流程。**Export** 可以生成带批注 PDF 或 Excel。按钮属于产品 UI；Core 负责准备字节并执行批注、水印和权限行为。

## 在本地运行示例

```sh
npm install
npm run dev
```

体验完成后，继续阅读[5 分钟构建 Viewer](./getting-started.md)。
