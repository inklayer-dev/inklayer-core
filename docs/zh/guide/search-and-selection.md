# 搜索与文字选择

Core 负责提取 PDF 文字、按文档顺序查找、把高亮投影到已挂载 TextLayer，并把浏览器选择转换成页面坐标。应用负责搜索框、结果列表和上下文操作菜单。

## 搜索文档

```ts
const result = await core.viewer.search(query, {
  matchCase: false,
  wholeWord: false,
  matchDiacritics: false,
  maxResults: 500
})

core.viewer.setSearchHighlights(result.matches, 0)
```

在产品结果列表中渲染 `result.matches`。激活某个结果：

```ts
const match = result.matches[index]
core.viewer.setSearchHighlights(result.matches, index)
core.viewer.goToPage(match.pageIndex)
```

关闭搜索面板时清除临时高亮：

```ts
core.viewer.clearSearchHighlights()
```

## 允许用户选择 PDF 文字

Page Flow 会自动挂载 TextLayer。自行挂载页面时，需要为每页调用 `viewer.attachTextLayer()`。然后把指针输入交给文字：

```ts
core.annotations.setTool('text-select')
```

监听保留的选择状态，用来定位产品菜单：

```ts
const stop = core.viewer.subscribe(event => {
  if (event.type === 'textSelectionChanged' && event.selection) {
    openSelectionMenu(event.selection)
  }
})
```

## 创建文字批注

```ts
const active = core.viewer.getTextSelection()
if (active?.kind === 'page') {
  core.annotations.createTextMarkup('highlight', active.selection)
} else if (active?.kind === 'document') {
  for (const fragment of active.selection.fragments) {
    core.annotations.createTextMarkup('highlight', fragment)
  }
}
core.viewer.clearTextSelection()
```

其他文字批注使用 `underline` 或 `strikeout`。即使浏览器选择跨页，Core 中每条持久化批注仍然只属于单页。

## 正确处理焦点

指针选择展示产品菜单时不移动焦点；键盘选择应把焦点交给第一个菜单操作。执行操作或按 Escape 后清除选择，并恢复之前的文档焦点。详见[无障碍](../accessibility.md)。
