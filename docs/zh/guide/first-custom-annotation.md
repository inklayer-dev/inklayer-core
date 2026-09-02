# 创建第一个自定义批注

内置批注覆盖常见的 PDF 标记场景。自定义批注定义（Annotation Type Definition）可以加入应用自己的工具和业务数据，同时继续由 Core 负责指针手势、变换、持久化、打印和导出。

打开[自定义批注示例](https://core.inklayer.dev/demo/#custom-annotations)，可以体验独立的应用自定义工具，并通过 **Show code** 查看每个 Definition。

下面创建一个业务审查区域。所有字段和生命周期规则见[自定义批注类型](./custom-annotation-type.md)。

## 定义类型

```ts
import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

export const reviewArea: AnnotationTypeDefinition = {
  type: 'custom:acme/review-area',
  apiVersion: 1,
  geometry: 'box',
  data: {
    supportedSchemaVersions: [1],
    validate(payload) {
      if (typeof payload !== 'object' || payload === null) {
        throw new Error('审查区域数据必须是对象')
      }
    }
  },
  capabilities: {
    creation: 'drag-box',
    creationMode: 'one-shot',
    transform: {
      move: true, resize: true, rotate: false,
      endpoints: false, vertices: false
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
        color: '#f59e0b', width: 2, opacity: 1,
        dash: [], dashOffset: 0, lineCap: 'butt', lineJoin: 'round'
      },
      fill: { color: '#fbbf24', opacity: 0.18 },
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
          payload: { category: 'legal-risk', severity: 'high', status: 'pending' }
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

## 注册并激活

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container: pages },
  annotationTypes: [reviewArea]
})

await core.load({ url: '/documents/review.pdf' })

reviewAreaButton.onclick = () => {
  core.annotations.setTool('custom:acme/review-area')
}
```

创建结果保存在普通批注仓库中。保存时应保留包括 `typeData` 在内的完整批注，不需要再维护一套插件专用存储。

[自定义批注示例](https://core.inklayer.dev/demo/#custom-annotations)还提供 Measurement 和 Issue Marker。打开 Show code 后可以分别查看并复制每个 Definition。
