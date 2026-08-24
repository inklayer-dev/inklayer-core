# 创建第一个批注

本教程接着[5 分钟构建 Viewer](./getting-started.md)继续。你会添加矩形按钮、设置外观、观察可保存的批注数据，并从选中的 PDF 文字创建高亮。

## 添加矩形按钮

在 Core 管理的页面元素之外添加产品按钮：

```html
<button id="rectangle" type="button">矩形</button>
```

把按钮连接到批注工具：

```ts
document.querySelector('#rectangle')?.addEventListener('click', () => {
  core.annotations.setTool('rectangle')
})
```

点击按钮并在 PDF 页面拖动。矩形默认是单次工具：创建后 Core 会选中新批注并回到 Select。

## 设置外观

在用户绘制前设置默认值：

```ts
core.annotations.setToolAppearance('rectangle', {
  stroke: { color: '#175cd3', width: 2, dash: [] },
  fill: { color: '#84adff', opacity: 0.18 }
})
```

颜色选择器和数值输入属于产品 UI。Core 验证数值，并保证屏幕渲染、打印和导出结果一致。

## 观察批注数据

```ts
const stop = core.annotations.repository.subscribe(event => {
  if (event.type === 'selection') return
  console.log(core.annotations.repository.getAll())
})
```

`getAll()` 返回分离且可序列化的批注，不会返回 Konva 节点或页面 DOM。

## 从选中文字创建高亮

先让 PDF 文字进入选择模式：

```ts
core.annotations.setTool('text-select')
```

用户选中文字后，产品操作可以创建高亮：

```ts
const selection = core.viewer.getTextSelection()
if (selection?.kind === 'page') {
  core.annotations.createTextMarkup('highlight', selection.selection)
  core.viewer.clearTextSelection()
}
```

跨页选择会包含有序的页内片段，需要为每个片段创建一条规范批注。详见[搜索与文字选择](./search-and-selection.md)。

## 清理

销毁实例前先释放 Repository 订阅：

```ts
stop()
await core.destroy()
```

下一步可以学习[保存和恢复批注](./persistence.md)，或者查看全部[批注工具与外观](./annotations.md)。
