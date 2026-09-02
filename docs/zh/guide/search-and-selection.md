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

## 一次搜索多个关键词

产品需要搜索多个关键词时使用 `searchMany()`。Core 在一次批次中只提取每页文字一次，查询结果保持输入顺序，每个查询内部的命中则按页码和原文偏移排序：

```ts
const searchController = new AbortController()
const batch = await core.viewer.searchMany([
  { id: 'risk', query: '自动续约', options: { wholeWord: true } },
  { id: 'payment', query: '付款期限' },
  { id: 'liability', query: '违约责任', options: { maxResults: 200 } }
], {
  signal: searchController.signal,
  maxTotalResults: 2_000,
  onProgress: ({ completedPages, totalPages }) => {
    updateSearchProgress(completedPages, totalPages)
  }
})

for (const query of batch.queries) {
  renderKeywordMatches(query.id, query.matches, query.truncated)
}
```

查询 ID 必须唯一。每个查询都接受普通的 `PdfSearchOptions`，默认最多返回 1,000 个结果；整个批次默认最多返回 100,000 个结果。查询自身的 `truncated` 表示达到了该查询的限制，顶层 `truncated` 则表示批次总限制中止了后续扫描。

进度从零开始，在每页完成后更新。空批次或者只有空查询的批次会立即返回，不触发进度回调。调用 `searchController.abort()` 会以 `PDF_FEATURE_CANCELLED` 拒绝，但已加载文档仍保持可用，可以继续执行其他操作。

## 将原文范围解析为页面几何

搜索结果通过从零开始的页码和 UTF-16 原文偏移标识文字。在创建文字标记批注或其他依赖几何坐标的功能前，可以解析这些范围：

```ts
const search = await core.viewer.search('termination clause')
const ranges = await core.viewer.resolveTextRanges(search.matches, {
  signal: geometryController.signal
})

for (const range of ranges) {
  console.log(range.text, range.rects)
}
```

结果保持调用方输入顺序。每项结果包含精确的原文子串，以及一个或多个采用 scale-one 页面坐标、左上角原点的矩形。坐标已经反映 PDF 页面旋转，不依赖 Viewer 当前缩放，也不要求目标页挂载 TextLayer。一个范围可以跨越多个 PDF.js TextItem 和换行符，但必须完整位于同一页。

偏移越界、拆开 UTF-16 代理对、只包含换行符，或者文字项没有可用几何时，操作会返回 `PDF_FEATURE_FAILED`，不会退化成不精确的整行矩形。调用方取消或文档被替换时返回 `PDF_FEATURE_CANCELLED`。`search()`、`searchMany()` 和 `resolveTextRanges()` 共享当前文档 generation 的页面文字缓存。

## 分层显示临时文字高亮

多个规则组需要独立颜色或审核状态时，可以使用临时图层。这些状态属于 Viewer，不会创建批注：

```ts
core.viewer.setTextHighlightLayers([
  {
    id: 'risk',
    ranges: riskMatches,
    style: { color: '#ef4444', activeColor: '#b91c1c' },
    activeRangeIndex: 2
  },
  {
    id: 'dates',
    ranges: dateMatches,
    style: { color: '#f59e0b' },
    visible: true
  }
])
```

每次调用都会原子替换完整且有序的图层集合。范围重叠时，靠后的图层位于靠前图层之上。`activeRangeIndex` 对应原始 `ranges` 顺序。设置 `visible: false` 会保留图层状态，但不投影 DOM 标记。

```ts
core.viewer.clearTextHighlightLayers(['dates']) // 保留其他图层
core.viewer.clearTextHighlightLayers()          // 清除全部临时图层
```

Core 会深度脱离调用方传入的对象，并在完整替换通过验证后才改变状态。虚拟化 TextLayer 重新挂载时，保留的图层会自动恢复；替换 PDF 文档则会随旧 generation 的 TextLayer Controller 一起清除。调用方图层可以和原有的 `setSearchHighlights()` 装饰共存。

投影后的 mark 提供 `data-inklayer-highlight-layer`、`data-inklayer-highlight-range` 和 `data-inklayer-highlight-state`，供功能测试和应用选择器使用。其引擎内部 class 与自定义属性属于实现细节；应用应通过公共图层 style 设置颜色。

这些 Viewer 方法属于底层能力。要完成“规则 → 扫描 → 预览 → 审核 → 永久批注”的完整产品流程，请阅读独立的[关键词高亮指南](./highlighter.md)。

## 从范围创建永久文字批注

审核结束后，可以把已解析范围转换成普通的 Annotation Engine 记录。调用方应提供文档级确定性 ID；再次应用时，已经存在的批注会被跳过：

```ts
const created = core.annotations.createTextMarkupsFromRanges(
  'highlight',
  ranges.map((range, index) => ({
    id: deterministicAnnotationId(documentFingerprint, ruleId, index),
    range,
    extensions: {
      highlighter: { ruleId, matchId: `${ruleId}:${index}` }
    }
  })),
  { appearance: { fill: { color: '#f59e0b' } } }
)
```

一个跨行范围会创建一个包含多个文字矩形的批注。输入顺序决定仓库顺序和引用编号顺序。仓库中已有的 ID，以及同一次调用前面已经创建的重复 ID，都会跳过且不出现在返回值中。新批注复用引擎当前用户、时钟、外观、权限策略和仓库行为；应用元数据会先经过边界校验并深度脱离，再进入仓库。

P0 按顺序提交，而不是把整个批次包装成一个仓库事务。权限或校验失败时，调用会抛错并停止，之前成功的批注仍是规范仓库变更。创建操作不会进入删除撤销历史，也不会改变选中状态或当前工具；后续删除与恢复仍需显式调用 Annotation Engine。

PDF 导出会把稳定批注 ID 写入 `/NM`，带元数据的 PDF.js 导入会在重载后恢复该 ID，因此同一个确定性 ID 仍可防止重复应用。任意 `extensions` 目前只保证保留在规范仓库中；PDF 导出重载当前只保证稳定 ID。

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
