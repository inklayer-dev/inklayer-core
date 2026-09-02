# 文档水印

打开[水印示例](https://core.inklayer.dev/demo/#watermark)，可以在与其他示例相同的 Continuous PDF 工作区里调整文字、布局、透明度、旋转角度和输出目标。

水印属于 Viewer 策略，不是批注。应用只需配置一次，再分别决定它是否出现在预览、打印和导出结果中。

## 在加载前配置

在 `load()` 前设置策略，首次渲染的 Continuous 页面就会带上水印：

```ts
core.viewer.setWatermark({
  text: `${currentUser.name} · ${documentId}`,
  layout: 'repeated',
  opacity: 0.12,
  rotation: -28,
  targets: {
    viewer: true,
    print: true,
    export: true,
    thumbnails: false
  }
})

await core.load({ url: '/documents/review.pdf' })
```

`layout: 'center'` 表示页面中央只显示一个水印。审核副本通常更适合重复水印，因为裁掉局部区域不能移除全部标记。

## 更新或移除策略

`setWatermark()` 会替换完整策略。修改后，需要让应用重新渲染或重新加载当前已经显示的页面：

```ts
core.viewer.setWatermark({
  text: '内部审核',
  layout: 'center',
  opacity: 0.18,
  rotation: -20,
  targets: { viewer: true, print: true, export: false }
})

core.viewer.setWatermark(null) // 移除水印
```

`getWatermark()` 返回一个独立快照，可以继续交给 PDF 输出构建器。

## 让导出文件也带水印

Viewer Canvas 和生成的 PDF 是两条不同输出路径。导出时需要显式传入当前策略：

```ts
import { buildAnnotatedPdf } from '@inklayer-dev/core/export/pdf'

const watermark = core.viewer.getWatermark()
const output = await buildAnnotatedPdf(sourceBytes, annotations, {
  annotationTypes: core.annotationTypes,
  ...(watermark === null ? {} : { watermark })
})
```

示例中的 **Print** 使用 `print` 目标；**Export** 使用 `export` 目标，并下载 `inklayer-watermarked.pdf`。

## 安全边界

水印可以降低随意传播的概率，也可以标识用户或审核副本，但它不会加密 PDF、阻止编辑、证明文件真实性，也不能替代访问控制和证书数字签名。

字体嵌入、密码文档、栅格打印和安全脱敏的完整说明见[打印、导出与水印](./output-and-security.md)。
