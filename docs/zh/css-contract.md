# 样式与 CSS 变量

在浏览器应用中导入一次引擎样式：

```ts
import '@inklayer-dev/core/style'
```

每个 Annotation Engine 实例只会在传入的根节点上添加 `.inklayer-engine`、`data-inklayer-instance` 和 `data-inklayer-tool`。挂载的页面容器会得到可逆的 `data-inklayer-page` 与实例元数据；销毁时移除该实例拥有的全部元数据。Core 不修改 `body`、`html` 或固定的全局元素 ID。

## 为单个查看器设置样式

在传给 `createInkLayer()` 的根元素上覆盖变量，样式就只会影响当前实例：

```css
.review-viewer.inklayer-engine {
  --inklayer-author-label-background: #7c3aed;
  --inklayer-search-active-background: rgb(124 58 237 / 55%);
  --inklayer-text-input-border: #7c3aed;
  --inklayer-accessibility-focus-ring: #a78bfa;
}
```

Core 会在初始化后自动添加 `.inklayer-engine`，应用只需提前给根元素添加 `review-viewer`。

## 公共变量

所有变量均为可选，并在生成的 CSS 中带独立默认值。请在单个引擎根节点上覆盖，以免影响其他实例。

| 变量 | 默认值 | 用途 |
|---|---:|---|
| `--inklayer-author-label-background` | `#1677ff` | 作者/引用标签背景 |
| `--inklayer-author-label-foreground` | `#fff` | 作者/引用标签文字 |
| `--inklayer-author-label-font-size` | `12px` | 标签字号 |
| `--inklayer-author-label-radius` | `3px` | 标签圆角 |
| `--inklayer-author-label-padding` | `2px 5px` | 标签内边距 |
| `--inklayer-overlay-z-index` | `2` | Konva Canvas 覆盖层 |
| `--inklayer-text-layer-z-index` | `1` | 可选择的 PDF.js TextLayer |
| `--inklayer-selection-z-index` | `3` | 标签与临时输入层 |
| `--inklayer-accessibility-z-index` | `4` | 获得焦点的 Canvas 语义替代层 |
| `--inklayer-accessibility-background` | `#101828` | 焦点批注替代元素背景 |
| `--inklayer-accessibility-foreground` | `#fff` | 焦点批注替代元素文字 |
| `--inklayer-accessibility-focus-ring` | `#84adff` | 引擎与批注的键盘焦点环 |
| `--inklayer-search-highlight-background` | `rgb(250 204 21 / 45%)` | 搜索匹配背景 |
| `--inklayer-search-active-background` | `rgb(249 115 22 / 60%)` | 当前搜索匹配背景 |
| `--inklayer-search-active-outline` | `rgb(194 65 12 / 70%)` | 当前搜索匹配轮廓 |
| `--inklayer-text-input-background` | `#fff` | FreeText 编辑器背景 |
| `--inklayer-text-input-border` | `#1677ff` | FreeText 编辑器边框 |
| `--inklayer-text-input-foreground` | `#111827` | FreeText 编辑器文字 |
| `--inklayer-text-input-focus-ring` | `rgb(22 119 255 / 25%)` | 键盘焦点指示器 |
| `--inklayer-cursor-select` | `default` | 选择已有批注的光标 |
| `--inklayer-cursor-text-markup` | 内嵌 SVG | 高亮/下划线/删除线光标 |
| `--inklayer-cursor-shape` | `crosshair` | 形状、直线与路径光标 |
| `--inklayer-cursor-freehand` | 内嵌 SVG | 手写笔光标 |
| `--inklayer-cursor-free-highlight` | 内嵌 SVG | 自由高亮笔光标 |
| `--inklayer-cursor-note` | `copy` | Note 放置光标 |
| `--inklayer-cursor-free-text` | `text` | FreeText 放置光标 |
| `--inklayer-cursor-signature` | `copy` | 已准备签名图片的放置光标 |
| `--inklayer-cursor-stamp` | `copy` | 已准备盖章图片的放置光标 |
| `--inklayer-cursor-image-missing` | `not-allowed` | 签名/盖章尚未准备图片时的光标 |

## 运行时光标变量

调用 `setImageAsset` 后，Core 会生成实例级 `--inklayer-cursor-signature-asset` 或 `--inklayer-cursor-stamp-asset`。其值是带轮廓、阴影和中心热点的受限尺寸真实图片缩略图；清除资源或销毁引擎时会被移除。这两个变量是运行时状态，不是应用配置。

## Core 样式负责什么

Core CSS 只处理渲染包装层、Konva 定位、作者标签、临时 FreeText 输入、光标状态、指针路由与层叠。工具栏、侧边栏、对话框、应用布局、滚动条外观和品牌主题属于使用方。`.inklayer-page-flow` 是稳定样式钩子，但 Core 不规定滚动条宽度、颜色、hover 或平台主题。

`text-select` 工具会关闭页面 Canvas 命中路由，让 PDF.js TextLayer 创建浏览器原生选择；`select` 会恢复批注操作。Core 决定各交互模式的光标语义，使用方可以通过公开变量换肤，而无需重新实现工具到光标的映射。

## PDF.js 私有变量

PDF.js TextLayer 可能在 `.inklayer-text-layer` 下生成 `--font-height`、`--scale-x`、`--text-scale-factor` 等变量。它们是 PDF.js 的内部兼容细节，不是应用可使用的主题变量。
