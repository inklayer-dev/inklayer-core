# 页面、缩放与导航

本教程控制已经加载的文档。Page Flow 可以把长文档渲染成虚拟化滚动区域；产品工具栏只需调用简单的导航和缩放方法。

## 选择页面布局

```ts
await core.viewer.setLayoutMode('single')
await core.viewer.setLayoutMode('continuous')
await core.viewer.setLayoutMode('facing')
```

布局按钮和外围滚动条样式属于产品 UI。Core 负责页面顺序、可见页状态、Canvas/TextLayer/批注层挂载和离屏资源清理。

## 设置合适的比例

```ts
core.viewer.setScale('page-width')
core.viewer.setScale('page-fit')
core.viewer.setScale('page-actual')
core.viewer.setScale(1.25)
```

自适应预设包括 `auto`、`page-actual`、`page-fit`、`page-width` 和 `page-height`。预设和数值都会产生同一个 `PdfZoomState`，工具栏不需要维护另一套缩放模型。

## 添加缩放按钮

```ts
zoomInButton.onclick = () => core.viewer.zoomIn()
zoomOutButton.onclick = () => core.viewer.zoomOut()
```

Core 还负责有界的 Ctrl/Meta + 滚轮和双指捏合缩放，并保持手势中点不动。只有宿主明确需要禁用时才设置 `enablePinchZoom: false`。

## 跳转页面

```ts
core.viewer.goToPage(7) // 从 0 开始的页面索引
```

需要直接控制 Page Flow 滚动时：

```ts
const flow = core.getPageFlow()
flow?.scrollToPage(7, 'smooth')
```

应订阅 Viewer 或 Page Flow 状态来更新可见页码，不要在框架代码中自己猜测滚动位置。

## 展示目录和缩略图

```ts
const outline = await core.viewer.getOutline()
const destination = await core.viewer.resolveDestination(outline[0]?.destination)

const thumbnail = await core.viewer.renderThumbnail({
  pageIndex: 0,
  maxWidth: 160
})

const thumbnailUrl = URL.createObjectURL(thumbnail.blob)
thumbnailImage.src = thumbnailUrl
```

框架负责渲染目录树和缩略图网格。UI 不再需要自行创建的 object URL 时应将其释放：

```ts
URL.revokeObjectURL(thumbnailUrl)
```

## 自行挂载页面

只有适配器确实需要完全控制页面布局时才省略 `pageFlow`。此时适配器还必须自行渲染页面并挂载 TextLayer 和批注层。没有这一要求时，优先使用 Core 管理的 Page Flow。

文档来源和密码见[加载 PDF](./loading-pdfs.md)，文档文字见[搜索与文字选择](./search-and-selection.md)。
