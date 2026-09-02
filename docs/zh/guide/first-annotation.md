# 创建第一个批注

接着[快速开始](./getting-started.md)，继续使用其中创建的同一个 `core` 实例。本页会添加几个应用按钮，用它们绘制矩形，并把选中的 PDF 文字变成高亮。

打开[批注示例](https://core.inklayer.dev/demo/#annotations)，可以先体验独立的批注工作区，并通过 **Show code** 查看最小实现。

> [!IMPORTANT] 注意
> InkLayer Core 是无头引擎，不附带固定工具栏或侧边栏。你需要在自己的框架中实现控件，再调用本文展示的相同方法。


## 绘制矩形

先在 Viewer 宿主外添加一个按钮。InkLayer Core 是无头引擎，因此按钮由你的应用提供，摆放位置也由应用决定：

```html
<button id="rectangle" type="button">矩形</button>
```

用户点击按钮时，激活矩形工具：

```ts
const rectangleButton = document.querySelector<HTMLButtonElement>('#rectangle')!

rectangleButton.onclick = () => {
  core.annotations.setTool('rectangle')
}
```

点击“矩形”，然后在 PDF 页面上按住并拖动鼠标。Core 会创建并选中矩形，随后自动切回选择工具，用户可以继续移动或调整它的大小。

### 设置矩形外观（可选）

如果希望新矩形使用不同的默认样式，请在激活工具前设置外观：

```ts
core.annotations.setToolAppearance('rectangle', {
  stroke: {
    color: '#175cd3', // 边框颜色
    width: 2,         // 边框粗细
    dash: []          // 空数组表示实线
  },
  fill: {
    color: '#84adff', // 填充颜色
    opacity: 0.18     // 填充透明度，范围为 0 到 1
  }
})
```

在初始化时调用一次即可，位置应在用户点击“矩形”之前。

## 为选中的文字添加高亮

文字批注分两步创建：先让用户选择 PDF 文字，再通过应用操作把这段选择变成高亮。

分别为两个操作添加按钮：

```html
<button id="select-text" type="button">选择文字</button>
<button id="highlight" type="button">创建高亮</button>
```

把按钮连接到 Core：

```ts
const selectTextButton = document.querySelector<HTMLButtonElement>('#select-text')!
const highlightButton = document.querySelector<HTMLButtonElement>('#highlight')!

selectTextButton.onclick = () => {
  core.annotations.setTool('text-select')
}

highlightButton.onclick = () => {
  const active = core.viewer.getTextSelection()
  if (!active) return

  const selections = active.kind === 'page'
    ? [active.selection]
    : active.selection.fragments

  for (const selection of selections) {
    core.annotations.createTextMarkup('highlight', selection)
  }

  core.viewer.clearTextSelection()
}
```

点击“选择文字”，在 PDF 中拖动选择文字，再点击“创建高亮”。焦点移动到按钮后，Core 仍会保留刚才的 PDF 文字选择。如果选择跨越多页，Core 会在每个涉及的页面分别创建一条批注。

把 `highlight` 换成 `underline` 或 `strikeout`，即可创建下划线或删除线。

## 查看创建结果

Core 会把上面创建的批注保存在 `core.annotations.repository` 中；它是当前实例的批注数据仓库：

```ts
const annotations = core.annotations.repository.getAll()
console.log(annotations)
```

`getAll()` 返回独立且可序列化的批注数据，不包含 Konva 节点或页面 DOM。需要把这些数据保存到后端并在以后恢复时，请继续阅读[保存和恢复批注](./persistence.md)。

页面卸载时，继续沿用[快速开始](./getting-started.md)中的清理方式，并等待 `core.destroy()` 完成。
