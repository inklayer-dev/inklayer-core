# 搜索与文字选择

Core 负责提取和搜索 PDF 文字，并把浏览器中的文字选择转换成页面坐标。搜索框、结果列表，以及选择文字后出现的操作菜单，都由应用提供。搜索高亮和文字选择都依赖覆盖在页面画布上方的文字层（TextLayer）。

## 文字层是如何挂载的

### 使用 Page Flow 时

[快速开始](./getting-started.md)中配置的 `pageFlow` 会自动管理文字层。它为每一页创建一个页面容器，其中依次叠放页面画布、文字层和批注层。当页面接近视口时，Page Flow 会渲染画布并挂载另外两层；页面离开较远后，则卸载这些内容，只保留轻量的页面占位。

Viewer 会保留当前搜索状态。因此，即使某个页面在搜索开始后才被挂载，它的文字层也会自动显示相同的搜索高亮。使用 Page Flow 时，应用不需要自行调用 `attachTextLayer()`。

### 自行挂载页面时

如果省略 `pageFlow`，页面 DOM 就由适配器管理。渲染页面画布后，创建一个与画布重合的空白覆盖层，并使用相同的页面索引、缩放比例和旋转角度挂载文字层：

```ts
const textLayer = document.createElement('div')
textLayer.style.position = 'absolute'
textLayer.style.inset = '0'
pageElement.append(textLayer)

await core.viewer.attachTextLayer({
  pageIndex,
  container: textLayer,
  scale,
  rotation
})
```

页面元素必须正确定位，确保文字层覆盖在页面画布正上方。同时需要导入 `@inklayer-dev/core/style`，让生成的文字节点获得选择所需的样式。

移除或复用页面宿主前，应先卸载文字层：

```ts
core.viewer.detachTextLayer(pageIndex)
textLayer.remove()
```

## 搜索文档

执行搜索；只有存在匹配项时才选择第一项，然后把结果列表交给应用渲染：

```ts
const flow = core.getPageFlow()
if (!flow) throw new Error('请先加载 PDF，再搜索 Page Flow。')

const result = await core.viewer.search(query, {
  matchCase: false,
  wholeWord: false,
  matchDiacritics: false,
  maxResults: 500
})

const activeIndex = result.matches.length > 0 ? 0 : null
core.viewer.setSearchHighlights(result.matches, activeIndex)
renderSearchResults(result.matches)
```

用户点击结果列表中的某一项时，把它设为当前高亮，并滚动到对应页面：

```ts
function activateSearchResult(index: number) {
  const match = result.matches[index]
  if (!match) return

  core.viewer.setSearchHighlights(result.matches, index)
  flow.scrollToPage(match.pageIndex, 'smooth')
}
```

搜索高亮只是 Viewer 的临时状态。关闭搜索界面时应将其清除：

```ts
core.viewer.clearSearchHighlights()
```

如果适配器没有使用 Page Flow，而是单独配置了 PDF.js web Viewer，请使用 `core.viewer.goToPage(match.pageIndex)` 跳转。

## 允许用户选择 PDF 文字

添加一个应用按钮，把指针操作切换到文字选择：

```ts
selectTextButton.onclick = () => {
  core.annotations.setTool('text-select')
}
```

监听 Core 保留的选择状态，用它打开或关闭文字操作菜单：

```ts
const stopSelection = core.viewer.subscribe(event => {
  if (event.type !== 'textSelectionChanged') return

  if (event.selection) {
    openSelectionMenu(event.selection)
  } else {
    closeSelectionMenu()
  }
})
```

组件清理时调用 `stopSelection()` 退订。焦点移动到应用菜单后，Core 仍会保留归一化的文字选择，菜单操作可以通过 `core.viewer.getTextSelection()` 读取。操作完成或用户按下 Escape 后，调用 `core.viewer.clearTextSelection()` 清除选择。

需要把保留的文字选择转换成高亮、下划线或删除线批注时，请参阅[创建第一个批注](./first-annotation.md)。该页面已经包含单页和跨页选择的完整创建流程，此处不再重复。

## 正确处理焦点

通过指针选择文字后打开菜单时，不应自动移动焦点；通过键盘选择文字后打开菜单时，应把焦点移到第一个操作。执行操作或按下 Escape 后，需要清除文字选择，并把焦点还给之前的文档元素。详见[无障碍](../accessibility.md)。
