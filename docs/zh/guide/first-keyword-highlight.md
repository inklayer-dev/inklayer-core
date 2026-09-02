# 创建第一个关键词高亮

接着[快速开始](./getting-started.md)，继续使用其中创建的同一个 `core` 实例。本页假设应用已经准备好一组来自审查规范、业务规则或系统配置的关键词，然后把它们直接交给 Core，在 PDF 中标出所有命中位置。

打开[关键词高亮示例](https://core.inklayer.dev/demo/#highlighter)，可以审核预设规则的命中、打印结果，或导出一份保留可搜索文字并带可编辑 Highlight 批注的 PDF。

> [!IMPORTANT] 注意
> 关键词高亮是临时预览，不会修改 PDF，也不会创建需要保存的批注。

## 准备关键词

先定义应用需要检查的关键词。下面以合同风险词为例；实际项目中，这个数组也可以来自接口或已经保存的系统设置：

```ts
const contractRiskTerms = [
  '违约责任',
  '合同终止',
  '赔偿责任'
]
```

## 高亮这些关键词

创建 Highlighter，传入准备好的关键词，然后扫描已经加载的 PDF：

```ts
import { createKeywordHighlighter } from '@inklayer-dev/core/highlighter'

const highlighter = createKeywordHighlighter({
  viewer: core.viewer,
  annotations: core.annotations
})

highlighter.setRules([{
  id: 'contract-risks',
  label: '合同风险项',
  terms: contractRiskTerms,
  color: '#facc15'
}])

await highlighter.scan()

const { matches } = highlighter.getSnapshot()
console.log(`找到 ${matches.length} 处`)

if (matches[0]) {
  highlighter.activateMatch(matches[0].id)
}
```

`setRules()` 接收准备好的关键词组。`scan()` 会找到所有匹配位置，并立即把它们显示成临时的黄色高亮；`activateMatch()` 随后会让 Viewer 跳到第一处结果。

同一条业务规则重复使用时，应保持 `id` 稳定。`label` 是应用展示给用户的规则名称，`color` 则控制预览颜色。

## 高亮准备好的结构化内容

有些审查规范不是给出固定词语，而是用格式描述需要关注的内容。如果应用已经准备好金额或日期模式，可以在同一套流程中直接把可序列化的 `patterns` 传给 Highlighter：

```ts
import type { KeywordRule } from '@inklayer-dev/core/highlighter'

const structuredReviewRules: readonly KeywordRule[] = [{
  id: 'structured-values',
  label: '日期与金额',
  color: '#8b5cf6',
  patterns: [
    {
      id: 'iso-date',
      kind: 'regex',
      source: '\\b\\d{4}-\\d{2}-\\d{2}\\b',
      flags: 'u'
    },
    {
      id: 'rmb-amount',
      kind: 'regex',
      source: '(?:¥|RMB\\s*)\\d+(?:,\\d{3})*(?:\\.\\d{2})?',
      flags: 'iu'
    }
  ]
}]

highlighter.setRules(structuredReviewRules)
await highlighter.scan()
```

正则 `source` 不要带 `/.../` 分隔符。和规则 ID 一样，每个 pattern 的 `id` 也应保持稳定。Core 会在 `match.matchedText` 中返回 PDF 里的精确原文，因此结果列表可以展示 `RMB 1,200.50`，而不是把表达式本身展示给用户。支持的 flags、结果上限、页面边界和安全行为见[完整的关键词高亮指南](./highlighter.md#使用正则匹配结构化内容)。

## 清理

销毁 Core 前，先释放 Highlighter：

```ts
highlighter.destroy()
await core.destroy()
```

至此，一个由应用规则驱动的关键词高亮已经完成。需要增加多组颜色、结果列表、审核操作、取消扫描或永久批注时，再继续阅读[完整的关键词高亮指南](./highlighter.md)。如果要把审核后的命中转换成不含可提取页面文字的图片型文件，请继续阅读[创建第一个关键词脱敏](./first-keyword-redaction.md)。
