# 关键词高亮

第一次使用这个功能？请先阅读[创建第一个关键词高亮](./first-keyword-highlight.md)，把应用已经准备好的关键词直接交给 Highlighter，或者直接打开[关键词高亮示例](https://core.inklayer.dev/demo/#highlighter)。

关键词高亮（Keyword Highlighter）是一套无头工作流，用来把应用定义的关键词规则转换为经过人工审核、可持久化的 PDF 高亮批注。它组合 Viewer 的搜索和预览能力与 Annotation Engine 的持久化能力，同时把按钮、面板、筛选和产品决策全部留给应用。

本指南会完成整个流程：

```text
规则 → 批量扫描 → 临时预览 → 人工审核 → 永久批注 → PDF 导出
```

如果只需要一个带上一条/下一条导航的搜索框，请使用[搜索与文字选择](./search-and-selection.md)。如果用户要手动选择文字再点击“高亮”，请使用[批注工具与外观](./annotations.md)。当一次扫描需要查找多个词、按规则分色预览、让用户审核每个命中，并一次性应用接受的结果时，才应使用 Highlighter。

## Highlighter 负责什么

Controller 负责工作流状态，但不负责产品 UI，也不拥有注入的引擎：

```text
你的面板或组件
      ↓
KeywordHighlighter Controller
      ↓
Viewer：搜索 · 临时高亮层 · 页面导航
Annotation Engine：永久高亮批注 · Repository · 导出
```

| 关注点 | 负责人 |
| --- | --- |
| 规则编辑器、结果列表、按钮、筛选 | 应用 |
| 规则、命中、进度、审核状态、激活命中 | Highlighter Controller |
| PDF 文字提取和临时预览层 | Viewer |
| 永久 Highlight 批注和重复检测 | Annotation Engine |
| 保存应用规则模板或服务端审核状态 | 应用 |

Core 不提供固定的 Highlighter 面板。同一个 Controller 可以驱动侧栏、表格、命令面板、弹窗审核队列或任意框架组件。

## 创建 Controller

先安装 Core 并创建普通的组合式实例。下面使用 Page Flow，因此 Canvas、TextLayer 和批注层会自动挂载：

```ts
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import {
  createKeywordHighlighter,
  type KeywordHighlighterSnapshot
} from '@inklayer-dev/core/highlighter'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages, scale: 'page-width' }
})

await core.load({ url: '/documents/review.pdf', range: 'auto' })

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})
```

`core.viewer` 已经提供批量搜索、文字范围几何、临时高亮层、文档代次跟踪和页面导航。`core.annotations` 提供标准批注查询和批量文字批注创建。直接传入这两个公开引擎即可；不要把 PDF.js、Konva、DOM 节点或框架状态传入 Highlighter。

使用底层引擎时，需要提供满足 `KeywordHighlighterViewerPort` 和 `KeywordHighlighterAnnotationPort` 的对象。仓库维护的 Vanilla 示例就是通过这种方式，把页面导航连接到自己的单页工作区。

## 定义关键词规则

规则是可序列化的应用数据。ID 必须稳定且唯一，因为它会参与命中 ID、预览层 ID、批注来源信息和重复检测。

```ts
import type { KeywordRule } from '@inklayer-dev/core/highlighter'

const rules: readonly KeywordRule[] = [
  {
    id: 'commercial-risk',
    label: 'Commercial risk',
    terms: ['liability', 'indemnity', 'termination'],
    color: '#ef4444',
    wholeWord: true,
    metadata: { category: 'legal-review' }
  },
  {
    id: 'dates',
    label: 'Important dates',
    terms: ['effective date', 'renewal date'],
    color: '#f59e0b',
    matchCase: false,
    maxResultsPerTerm: 250
  }
]

highlighter.setRules(rules)
```

| 字段 | 含义 |
| --- | --- |
| `id` | 稳定且唯一的规则 ID |
| `label` | 面向用户的分组名称 |
| `terms` | 可选；在一次共享批处理中搜索的有序普通文字 |
| `patterns` | 可选；有序且可序列化的正则匹配器 |
| `color` | 临时高亮和永久批注使用的 CSS 颜色 |
| `enabled` | 规则是否参与下一次扫描 |
| `matchCase` | 是否要求 Unicode 大小写完全一致 |
| `wholeWord` | 相邻字符属于单词时是否拒绝匹配 |
| `matchDiacritics` | 是否要求 Unicode 变音符完全一致 |
| `maxResultsPerTerm` | 每个关键词的安全上限 |
| `metadata` | 有大小限制、由应用管理的 JSON 数据 |

`setRules()` 会验证并标准化规则，但不会自动扫描。空关键词会被删除，同一规则中的完全重复词会被合并；无效 ID、颜色、上限或规则数量会抛出结构化 `InkLayerError`。

## 使用正则匹配结构化内容

当准备好的审查规则描述的是值的格式，而不是一个固定短语时，使用 `patterns`。一条规则可以只含普通文字 `terms`、只含正则 `patterns`，也可以同时包含两者。规范化后至少要保留一个匹配器。

```ts
const structuredRules: readonly KeywordRule[] = [{
  id: 'structured-values',
  label: '日期与金额',
  terms: ['付款到期'],
  color: '#8b5cf6',
  patterns: [
    {
      id: 'iso-date',
      kind: 'regex',
      source: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
      flags: 'u',
      maxResults: 250
    },
    {
      id: 'rmb-amount',
      kind: 'regex',
      source: '(?:¥|RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
      flags: 'iu'
    }
  ]
}]

highlighter.setRules(structuredRules)
await highlighter.scan()
```

| Pattern 字段 | 含义 |
| --- | --- |
| `id` | 在所属规则内唯一且稳定的身份 |
| `kind` | 当前固定为 `'regex'` |
| `source` | 不带 `/.../` 分隔符的 ECMAScript source |
| `flags` | 互不重复的 `i`、`m`、`s`、`u`；规范化为 `imsu` 顺序 |
| `maxResults` | 可选的单个 pattern 结果保留上限 |

`matchCase`、`wholeWord`、`matchDiacritics` 和 `maxResultsPerTerm` 等普通文字选项只作用于 `terms`。正则通过 `i` 控制大小写，通过 `maxResults` 控制结果上限。模式可能遇到 Unicode 文字时，建议使用 `u`。

### 匹配语义

正则匹配以单页为边界，一次命中不能跨越两个 PDF 页面。结果是按顺序排列、互不重叠的完整匹配；捕获组不会成为单独结果，产生零长度命中的表达式会让扫描明确失败。

每个 `KeywordMatch` 都同时提供配置值和实际观察值：

```ts
for (const match of highlighter.getSnapshot().matches) {
  console.log(match.pattern.id)       // 稳定的应用 pattern ID
  console.log(match.pattern.source)   // 配置的普通文字或正则 source
  console.log(match.pattern.kind)     // 'text' 或 'regex'
  console.log(match.matchedText)      // PDF 中提取出的精确原文
}
```

为保持兼容，`match.term` 中保存普通文字或正则 source。新的结果界面应该展示 `matchedText`，并使用 `pattern` 进行筛选、标记和诊断。Pattern 身份和语义会参与稳定 Match ID 与永久批注 ID 的生成。

### 校验、执行与 CSP

`setRules()` 会原子校验 pattern ID、flags、语法、source 长度和结果上限。直接调用 Viewer `searchMany()` 时，也会在提取页面前进行相同的正则预检。调用方表达式在专用且可终止的 Worker 中执行，并受单页执行预算保护，因此取消、替换文档或销毁时，不必等待长时间运行的表达式在 UI 线程结束。

正则 Worker 内嵌在发布包中，并通过 Blob URL 创建，因此严格的内容安全策略通常需要允许 `worker-src 'self' blob:`。它与可配置的 PDF.js Worker 相互独立。应把导入的表达式视为类似代码的配置：保留结果上限、展示结构化错误，并且不要静默重试被拒绝的模式。

## 订阅不可变状态

所有 UI 都应该从 `getSnapshot()` 和 `subscribe()` 渲染。Snapshot 是已脱离内部状态的不可变值；不要修改 match，也不要再维护一份可编辑的工作流副本。

```ts
let snapshot: KeywordHighlighterSnapshot = highlighter.getSnapshot()

function render(next: KeywordHighlighterSnapshot) {
  snapshot = next
  status.textContent = next.error?.message
    ?? (next.status === 'scanning'
      ? `Scanning ${next.progress?.percentage ?? 0}%`
      : `${next.includedCount} included · ${next.excludedCount} excluded`)

  progress.hidden = next.status !== 'scanning'
  progress.value = next.progress?.percentage ?? 0
  scanButton.disabled = next.status === 'scanning' || next.status === 'applying'
  cancelButton.disabled = next.status !== 'scanning'
  applyButton.disabled = next.status !== 'ready' || next.includedCount === 0
  renderMatches(next)
}

const unsubscribe = highlighter.subscribe(render)
render(highlighter.getSnapshot())
```

| 状态 | UI 含义 |
| --- | --- |
| `idle` | 可以编辑规则；当前没有待审核结果 |
| `scanning` | 显示进度并允许取消 |
| `ready` | 可以审核、激活和应用命中 |
| `applying` | 解析几何期间禁用冲突操作 |
| `error` | 展示 `snapshot.error` 并允许用户明确重试 |
| `destroyed` | Controller 已不能继续使用 |

工作流状态提交后，`generation` 会递增。渲染结果行时必须使用 `match.id`，不要使用数组下标作为 key。

## 扫描与取消

Viewer 中存在 ready 状态的文档后，启动一次批量扫描：

```ts
scanButton.addEventListener('click', () => {
  void highlighter.scan({ maxTotalResults: 5_000 }).catch(showError)
})

cancelButton.addEventListener('click', () => {
  highlighter.cancelScan()
})
```

Viewer 会让所有普通文字和正则模式共享同一次页面文字提取，而不是每条规则重新扫描一遍文档。新的扫描会取代过期任务；替换或关闭文档也会使未完成任务失效，并清除 Controller 拥有的预览状态。

如果单词上限或批量总上限省略了部分结果，`snapshot.truncated` 会变成 `true`。保留的结果仍然可用，但必须告诉用户本次审核并不完整。取消会以 `PDF_FEATURE_CANCELLED` 拒绝 Promise；它是正常用户操作，不代表文档损坏。

外部 `AbortSignal` 可以和 Controller 自己的取消按钮组合使用：

```ts
const abortController = new AbortController()
const pendingScan = highlighter.scan({ signal: abortController.signal })

abortController.abort()
try {
  await pendingScan
} catch (error) {
  // 取消会以 InkLayer Highlighter 错误拒绝 Promise。
  showError(error)
}
```

## 渲染并审核命中

命中会按页面、规则、匹配器和源文字偏移稳定排序。使用 `ruleId` 分组，用 `preview` 展示上下文，并从产品事件处理器直接调用 Controller 方法。

```ts
function renderMatches(current: KeywordHighlighterSnapshot) {
  results.replaceChildren()

  for (const rule of current.rules) {
    const matches = current.matches.filter(match => match.ruleId === rule.id)
    if (matches.length === 0) continue

    const group = document.createElement('section')
    const heading = document.createElement('h3')
    heading.textContent = `${rule.label} · ${matches.length}`
    group.append(heading)

    for (const match of matches) {
      const row = document.createElement('label')
      const include = document.createElement('input')
      const activate = document.createElement('button')

      include.type = 'checkbox'
      include.checked = match.reviewState === 'included'
      include.addEventListener('change', () => {
        if (include.checked) highlighter.includeMatch(match.id)
        else highlighter.excludeMatch(match.id)
      })

      activate.type = 'button'
      activate.textContent = `Page ${match.range.pageIndex + 1} · ${match.matchedText}`
      activate.title = match.preview
      activate.addEventListener('click', () => highlighter.activateMatch(match.id))

      row.classList.toggle('active', current.activeMatchId === match.id)
      row.append(include, activate)
      group.append(row)
    }

    results.append(group)
  }
}
```

`activateMatch(id)` 会激活该命中，并调用 Viewer Port 的 `goToPage()`。结果列表里的焦点、滚动，以及窄屏下是否关闭导航抽屉，仍然由应用负责。

分组级操作可以调用 `includeRule(rule.id)` 或 `excludeRule(rule.id)`。排除一个命中会把它从临时预览和下一次应用中移除，但不会删除此前已经创建的批注。

## 临时预览与永久批注

两者是刻意分开的状态：

| 行为 | 临时预览 | 永久 Highlight 批注 |
| --- | --- | --- |
| 创建方式 | `scan()` 和审核方法 | `applyMatches()` |
| 所有者 | Viewer 文字高亮层 | Annotation Repository |
| 是否保存或同步 | 否 | 是，由应用持久化 Repository 时保存 |
| 是否进入 PDF 导出 | 否 | 是 |
| 是否被 `clearPreview()` 删除 | 是 | 否 |
| 是否被 `reset()` 删除 | 是 | 否 |

临时层使用带语义的 TextLayer mark，并通过半透明规则颜色保证文字可读。虚拟化 TextLayer 重新挂载时，它们会恢复。永久批注则使用标准页面几何，并获得权限、撤销、Repository 事件、打印和 PDF 导出能力。

## 应用审核结果

只应用当前仍处于 included 状态的命中：

```ts
applyButton.addEventListener('click', () => {
  void highlighter.applyMatches({
    extensions: {
      review: { workflowId: 'contract-review-42' }
    }
  }).then(result => {
    console.log('Created', result.createdAnnotationIds)
    console.log('Already existed', result.skippedMatchIds)
  }).catch(showError)
})
```

Controller 会把源文字范围解析为未缩放的页面矩形，再请求 Annotation Engine 创建标准 `highlight` 批注。它根据文档和命中身份生成确定性的批注 ID；再次执行相同应用操作时，会跳过已存在批注，而不会重复创建。

应用过程有意不提供事务回滚。如果后面的批次失败，而前面的批注已经创建，这些标准批注会继续保留，下一份 Snapshot 会重新关联它们的 ID。当这一区别对用户有意义时，应同时展示 `createdAnnotationIds` 和 `skippedMatchIds`。

## 导出带高亮的 PDF

临时预览层属于 DOM 展示，不会自动进入 PDF。先把审核后的命中转换成标准 Highlight 批注，再使用普通的批注 PDF 构建器：

```ts
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

await highlighter.applyMatches()

const output = await buildAnnotatedPdf(
  sourcePdfBytes,
  core.annotations.repository.getAll(),
  { annotationTypes: core.annotationTypes }
)
```

生成的 PDF 仍然保留可搜索、可选择的原始文字。[关键词高亮示例](https://core.inklayer.dev/demo/#highlighter)会在一个临时导出 Repository 中完成相同转换，因此点击 **Export** 不会向当前审核会话添加永久批注。

## 清除、重置、替换和销毁

根据用户真正想做的事情选择操作：

| 操作 | 规则 | 命中与审核 | 临时预览 | 永久批注 |
| --- | --- | --- | --- | --- |
| `clearPreview()` | 保留 | 保留 | 清除 | 保留 |
| `reset()` | 清除 | 清除 | 清除 | 保留 |
| Viewer 替换文档 | 保留规则 | 清除过期结果 | 清除 | 由 Repository 策略决定 |
| `destroy()` | 释放 | 释放 | 清除自己拥有的层 | 保留 |

按照所有权顺序销毁。Controller 不拥有注入的 Viewer 或 Annotation Engine：

```ts
async function unmountHighlighter() {
  unsubscribe()
  highlighter.destroy()
  await core.destroy()
}
```

一定要先销毁 Highlighter，再销毁引擎。销毁会取消未完成任务，只移除这个 Controller 自己的预览层，并让后续方法调用明确失败。

## 处理错误和结果上限

在 Highlighter 界面内展示结构化失败；只要错误允许重试，就继续保留已加载文档：

```ts
import { InkLayerError } from '@inklayer-dev/core'

function showError(cause: unknown) {
  if (cause instanceof InkLayerError) {
    if (cause.code === 'PDF_FEATURE_CANCELLED') {
      status.textContent = 'Scan cancelled.'
      return
    }
    status.textContent = cause.message
    status.dataset.state = 'error'
    return
  }
  status.textContent = 'Unexpected Highlighter failure.'
}
```

常见应用错误包括：文档 ready 之前开始扫描、使用重复的规则或 pattern ID、没有任何启用的匹配器、传入非法正则语法或 CSS 颜色，以及先于 Controller 销毁 Viewer。对不可信或非常大的规则集使用结果上限，并在 `snapshot.truncated` 为 `true` 时显示警告。

## 在 React 或 Vue 中消费同一个 Controller

不要在框架 Store 里创建第二套工作流模型。直接订阅同一个 Controller 的不可变 Snapshot，并从事件处理器调用 Controller 方法。

### React

```tsx
const controller = useMemo(
  () => createKeywordHighlighter({ viewer, annotations }),
  [viewer, annotations]
)

const snapshot = useSyncExternalStore(
  controller.subscribe,
  controller.getSnapshot,
  controller.getSnapshot
)

useEffect(() => () => controller.destroy(), [controller])
```

保持 `viewer` 和 `annotations` 身份稳定，使用 `match.id` 作为 React key，并在单独的 effect 中更新规则。完整写法见仓库维护的 [React fixture](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/framework-consumers/react-keyword-highlighter.tsx)。

### Vue

```ts
const controller = createKeywordHighlighter({ viewer, annotations })
const snapshot = shallowRef(controller.getSnapshot())
const unsubscribe = controller.subscribe(next => { snapshot.value = next })

onScopeDispose(() => {
  unsubscribe()
  controller.destroy()
})
```

向模板暴露 `readonly(snapshot)`，并单独 watch 应用管理的规则。完整写法见仓库维护的 [Vue fixture](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/framework-consumers/vue-keyword-highlighter.ts)。

## 产品扩展点

无头边界让应用无需 fork Core 就能加入自己的产品行为：

- 在自己的数据库保存和加载规则模板；
- 按规则、页面或审核状态筛选渲染的 Snapshot；
- 围绕 `activateMatch()` 增加键盘导航；
- 在永久应用前后导出命中审核数据；
- 通过规则 `metadata` 和应用 `extensions` 附加业务数据；
- 在同一个 Viewer 上使用多个独立 Controller；
- 用表格、命令面板或引导式审核流程替换侧栏。

不要修改 `KeywordMatch`，不要自己从 DOM 矩形创建永久批注几何，也不要从数组位置推断重复身份。Controller 和两个公开引擎 Port 已经负责这些不变量。

## 接入检查清单

- Viewer 和 Annotation Engine 可用后再创建 Controller。
- 为每条规则提供稳定且唯一的 ID，以及有效 CSS 颜色。
- 只从不可变 Snapshot 渲染，并使用 `match.id` 作为结果行 key。
- 展示扫描、应用、错误、取消和截断状态。
- 把 included/excluded 审核状态与永久批注明确分开。
- 只从明确的产品操作调用 `applyMatches()`。
- 必要时向用户说明新建结果和跳过的重复结果。
- 销毁 Core 前，先销毁订阅和 Controller。

精确方法签名见[关键词 Highlighter API](../api.md#关键词-highlighter)。完整的产品侧面板见仓库维护的 [Vanilla 实现](https://github.com/inklayer-dev/inklayer-core/blob/main/examples/vanilla/src/ui/highlighter-panel.ts)。
