# 自定义批注类型

本教程会增加一个紫色的 **评审区域** 工具。用户可以在 PDF 上拖出矩形，选择、移动和缩放它，保存语义数据，并把它打印或导出到 PDF。

## 定义工具

自定义 ID 使用 `custom:<namespace>/<name>`。下面的 Definition 使用 Core 的 drag-box 手势和受控矩形 renderer：

```ts
import type { AnnotationTypeDefinition } from '@inklayer-dev/core/annotation-types'

export const reviewArea = {
  type: 'custom:acme/review-area',
  apiVersion: 1,
  geometry: 'box',
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
        color: '#7c3aed', width: 2, opacity: 1,
        dash: [6, 4], dashOffset: 0, lineCap: 'butt', lineJoin: 'round'
      },
      fill: { color: '#c4b5fd', opacity: 0.2 },
      text: null
    }
  },
  creation: {
    controller: 'drag-box',
    initialize(input) {
      return {
        bounds: { ...input.bounds },
        content: { text: 'Review area' },
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
} satisfies AnnotationTypeDefinition
```

## 安装并使用

```ts
const core = await createInkLayer({
  root,
  pageFlow: { container },
  annotationTypes: [reviewArea]
})

reviewAreaButton.onclick = () => {
  core.annotations.setTool('custom:acme/review-area')
}
```

用户拖出页面矩形后，新批注会进入普通 Repository，不需要插件专属保存路径。`type`、`typeData`、bounds、appearance 和 renderer state 都随规范批注一起传输。

## 卸载与重新加载

```ts
const remove = core.annotationTypes.register(reviewArea)
remove()
```

移除操作是幂等的，不会删除批注。Core 会保留数据并显示安全 bounds 占位符；重新注册兼容 Definition 后恢复完整渲染。

## 理解安全边界

renderer 只能返回 group、rectangle、ellipse、line、path、text 和 PNG/JPEG image 等公共场景原语。Core 验证后才创建私有 Konva 对象，并继续负责命中测试、变换控件、Tag、快照、销毁、打印和导出。

V1 的 `appearance-stream` PDF 输出支持 rectangle、ellipse 和 line。遇到不支持的输出时会在预检阶段失败，不会静默丢弃批注。

完整合约见[公开 API：Annotation Type Definitions](../api.md#annotation-type-definitions)。
