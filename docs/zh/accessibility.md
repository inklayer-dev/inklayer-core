# 无障碍

InkLayer 以文档区域为边界划分无障碍职责。Core 负责 PDF 文字、批注画布和页面内临时编辑器的键盘操作与辅助技术语义；React、Vue 等应用组件负责工具栏、侧边栏、对话框、上下文菜单、快捷键和应用整体的焦点顺序。

## 配置无障碍名称与键盘移动

默认配置可以直接使用。需要本地化或调整键盘移动距离时，通过批注选项设置：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotation: {
    keyboard: {
      nudgeStep: 1,
      acceleratedNudgeStep: 10
    },
    accessibility: {
      rootLabel: 'PDF 批注',
      pageLabel: pageIndex => `第 ${pageIndex + 1} 页的批注`,
      annotationLabel: annotation =>
        `第 ${annotation.pageIndex + 1} 页的 ${annotation.type} 批注`
    }
  }
})
```

如果应用已经设置了无障碍名称、角色或 Tab 顺序，Core 不会覆盖。

## 批注键盘合约

当 `keyboard.enabled` 不为 `false` 时，如果 Annotation Engine 根节点尚未设置相应属性，Core 会补充 `tabindex="0"`、`role="region"` 和无障碍名称。宿主已有属性不会被覆盖；销毁时 Core 只移除自己添加且未被后来修改的属性。

焦点位于 Core 根节点内、且不在可编辑控件中时：

| 按键 | Core 行为 |
|---|---|
| `ArrowLeft/Right/Up/Down` | 将所有可移动的已选批注移动 `nudgeStep` 个页面单位。 |
| `Shift` + 方向键 | 移动 `acceleratedNudgeStep` 个页面单位。 |
| `Delete` / `Backspace` | 删除当前选择中权限允许删除的批注。 |
| `Escape` | 优先取消正在进行的绘制；否则切回 Select 并清空选择。 |
| 绘制 Polygon/Polyline/Cloud 时按 `Backspace` | 删除最后一个有效顶点。 |
| 按住 `Alt` / `Meta` | 临时显示批注作者/编号 Tag。 |

默认步长为 1，快速步长为 10 个页面单位。步长必须有限、为正且不超过 1,000。移动会限制在页面内，并通过统一的权限、变换、Repository、渲染、打印和导出路径提交。文本输入控件被排除，以保留浏览器原生编辑行为。

点击画布中的批注会选中它，并在不滚动页面的前提下聚焦 Core 根节点。应用侧边栏应把选择来源标记为 `sidebar` 并保留自身焦点，不应仅因选择发生变化就把焦点移入画布。

```ts
core.annotations.setSelection(
  { ids: [annotation.id], primaryId: annotation.id },
  'sidebar'
)
```

## 屏幕阅读器表示

画布像素本身没有屏幕阅读器可以理解的文档语义，因此 Core 会给每个已挂载页面添加 `role="group"`，并为每个批注创建原生按钮。按钮提供简短标签和表示选中状态的 `aria-pressed`，更新时保持节点稳定，避免丢失键盘焦点。获得焦点的按钮会在页面上显示，其余按钮在视觉上隐藏，也不会拦截指针事件。

可通过 `accessibility.rootLabel`、`pageLabel` 和 `annotationLabel` 本地化这些语义。工具栏按钮、评论面板、搜索结果、对话框和菜单仍由适配器负责。Core 使用 `role="region"` 而不是 `role="application"`，让屏幕阅读器保留常规文档导航命令。

## FreeText 与 Note 焦点

默认浏览器 `TextInputProvider` 会在页面覆盖层中打开带标签的 textarea 并聚焦；编辑已有文本时会选中内容。`Control/Meta+Enter` 提交，`Escape` 取消，二者都会在不滚动页面的情况下把焦点还给 Annotation Engine 根节点。失焦会提交但保留用户新选择的焦点；销毁引擎时取消编辑且不抢夺焦点。

替换 Provider 会在 `TextInputRequest` 中收到 `returnFocusTo`，即使编辑器由 React 或 Vue 实现，也应保持相同的提交、取消、失焦与销毁语义。

## TextLayer 上下文菜单交接

Core 负责 PDF.js TextLayer、原生 Range 归一化和选择区域保存。`PdfActiveTextSelection.source` 为 `pointer` 或 `keyboard`：

- 指针选择：展示产品菜单，但不移动焦点；
- 键盘选择：展示菜单并聚焦第一个操作；
- 菜单内方向键：应用可以在菜单项之间循环移动焦点；
- 执行操作或按 `Escape`：调用 `clearTextSelection()`，并恢复此前的文档焦点。

Vanilla 应用是可执行参考。Core 不渲染上下文工具栏，因为操作、复制、本地化和布局属于产品层。

## 减弱动态效果

当 `prefers-reduced-motion: reduce` 生效时，Core CSS 会缩短 `.inklayer-engine` 下的过渡与动画，并强制使用非平滑滚动。Page Flow 也会把平滑导航改成 `auto`，因为 CSS 无法可靠覆盖代码中的 `scrollIntoView({ behavior: 'smooth' })`。指针和键盘状态变化始终立即生效，不依赖动画结束。

## 适配器验收清单

- 导入 `@inklayer-dev/core/style`，确保焦点指示器存在。
- 为每个产品控件提供本地化无障碍名称。
- Canvas 发起的选择保留 Core 焦点；侧边栏发起的选择保留产品焦点。
- 根据 `selection.source` 实现键盘 TextLayer 菜单的焦点交接。
- 自定义 `TextInputProvider` 在明确提交/取消时恢复焦点，失焦或销毁时不抢焦点。
- 事件已属于 Core 根节点时，不要重复实现 Delete、Escape 或方向键处理。
- 至少测试一条纯键盘批注创建/选择/移动/删除路径、一条 FreeText 提交/取消路径，以及减弱动态效果下的页面导航。
