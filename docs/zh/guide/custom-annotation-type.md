# 自定义批注类型

这一页会实现一个紫色的“评审区域”工具：用户点击工具栏按钮，在 PDF 上拖出矩形，即可创建支持选中、调整大小、保存、打印和 PDF 导出的批注。

## 定义批注类型

自定义批注需要声明稳定的类型 ID、交互能力、默认外观、创建方式和渲染方式。下面的示例还会通过 `typeData` 保存应用自己的业务数据：

::: code-group

```ts [review-area.ts]
import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

export const reviewArea: AnnotationTypeDefinition = {
  type: 'custom:acme/review-area',
  apiVersion: 1,
  geometry: 'box',

  data: {
    supportedSchemaVersions: [1],
    validate(payload) {
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
        throw new Error('Review area data must be an object')
      }
    }
  },

  capabilities: {
    creation: 'drag-box',
    creationMode: 'one-shot',
    transform: {
      move: true,
      resize: true,
      rotate: false,
      endpoints: false,
      vertices: false
    },
    appearance: { opacity: true, stroke: true, fill: true, text: false },
    comments: true,
    printable: true,
    exportable: true
  },

  appearance: {
    defaults: {
      opacity: 1,
      stroke: {
        color: '#7c3aed',
        width: 2,
        opacity: 1,
        dash: [],
        dashOffset: 0,
        lineCap: 'butt',
        lineJoin: 'round'
      },
      fill: { color: '#c4b5fd', opacity: 0.2 },
      text: null
    }
  },

  creation: {
    controller: 'drag-box',
    initialize({ bounds }) {
      return {
        bounds,
        typeData: {
          schemaVersion: 1,
          payload: { category: 'review' }
        }
      }
    }
  },

  renderer: {
    render(annotation) {
      return {
        children: [{
          kind: 'rectangle',
          bounds: annotation.bounds,
          stroke: annotation.appearance.stroke ?? undefined,
          fill: annotation.appearance.fill ?? undefined
        }]
      }
    }
  },

  pdf: { exportStrategy: 'appearance-stream' }
}
```

:::

`data.supportedSchemaVersions` 必须包含 `typeData` 使用的 `schemaVersion`。如果写入了自定义数据，却没有声明对应的数据版本，Core 无法识别该批注，会将其视为不可用。

## 安装工具并创建批注

在现有查看器旁边增加按钮，创建 Core 时注册批注类型，并在点击按钮时激活工具：

::: code-group

```html [index.html]
<main id="pdf-workspace">
  <button id="review-area">评审区域</button>
  <div id="pages"></div>
</main>
```

```ts [main.ts]
import { createInkLayer } from '@inklayer-dev/core/capabilities'
import { reviewArea } from './review-area'
import '@inklayer-dev/core/style'

const root = document.querySelector<HTMLElement>('#pdf-workspace')!
const pages = document.querySelector<HTMLDivElement>('#pages')!

const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotationTypes: [reviewArea]
})

await core.load({ url: '/documents/review.pdf' })

document.querySelector<HTMLButtonElement>('#review-area')!.onclick = () => {
  core.annotations.setTool('custom:acme/review-area')
}
```

:::

点击“评审区域”，再在 PDF 页面上按住并拖动。Core 会创建紫色矩形、选中该批注，并将其保存在 `core.annotations.repository` 中。

## 读取并保存自定义数据

新批注与内置批注使用相同的数据模型：

```ts
const annotation = core.annotations.repository.getAll()[0]

console.log(annotation.type)
// 'custom:acme/review-area'

console.log(annotation.typeData)
// { schemaVersion: 1, payload: { category: 'review' } }
```

直接通过批注数据仓库保存和恢复完整批注即可，不需要为插件另外设计一套存储格式。详见[保存和恢复批注](./persistence)。

## 动态注册和移除批注类型

如果需要在查看器运行期间安装或移除工具，就不要同时在 `annotationTypes` 配置中注册，而是直接调用注册接口：

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages }
})

const removeReviewArea = core.annotationTypes.register(reviewArea)

removeReviewArea()

core.annotationTypes.register(reviewArea)
```

移除类型定义不会删除已有批注。批注数据会继续保留，Core 会显示占位图形；重新注册兼容的类型定义后，原来的显示和交互能力会恢复。

## 了解渲染与导出限制

渲染函数只能返回 Core 定义的绘图元素：`group`、`rectangle`、`ellipse`、`line`、`path`、`text` 和 PNG/JPEG `image`，不能直接创建 Konva 对象。

当前版本使用 `appearance-stream` 导出 PDF 时，支持 `rectangle`、`ellipse` 和 `line`。遇到暂不支持的绘图元素，导出会在校验阶段报错，不会悄悄丢失批注。

完整字段说明见[公开 API：Annotation Type Definitions](../api#annotation-type-definitions)。
