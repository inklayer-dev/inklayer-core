# 架构概览

InkLayer Core 将 PDF 与批注行为从产品界面中分离出来。React、Vue 或原生 JavaScript 负责渲染工具栏、侧边栏、对话框和应用布局；Core 则保证不同接入方式使用相同的文档行为和数据模型。

<div class="architecture-map" role="img" aria-label="InkLayer Core 架构：从应用界面经过公开 API 和内部模块，连接到应用提供的服务">
  <div class="architecture-map__layer architecture-map__layer--app">
    <span>应用界面</span>
    <strong>React · Vue · 原生 JavaScript</strong>
    <small>工具栏 · 侧边栏 · 对话框 · 路由</small>
  </div>
  <div class="architecture-map__arrow" aria-hidden="true">↓ 调用</div>
  <div class="architecture-map__grid architecture-map__grid--two">
    <div class="architecture-map__card">
      <span>Core 实例</span>
      <strong><code>createInkLayer()</code></strong>
      <small>查看器 · Page Flow · 批注 · 批注类型</small>
    </div>
    <div class="architecture-map__card">
      <span>独立功能入口</span>
      <strong>导入 · PDF 导出 · Excel 导出</strong>
      <small>应用需要时才加载</small>
    </div>
  </div>
  <div class="architecture-map__arrow" aria-hidden="true">↓ 内部实现</div>
  <div class="architecture-map__grid architecture-map__grid--three">
    <div class="architecture-map__card architecture-map__card--muted">
      <strong>查看器</strong>
      <small>PDF.js · 加载 · 页面 · 搜索 · 文字层</small>
    </div>
    <div class="architecture-map__card architecture-map__card--muted">
      <strong>批注</strong>
      <small>数据仓库 · 几何计算 · 交互 · Konva 渲染</small>
    </div>
    <div class="architecture-map__card architecture-map__card--muted">
      <strong>导入与导出</strong>
      <small>PDF.js · pdf-lib · ExcelJS</small>
    </div>
  </div>
  <div class="architecture-map__arrow" aria-hidden="true">↑ 可选服务</div>
  <div class="architecture-map__layer architecture-map__layer--services">
    <span>通过能力插件接入的应用服务</span>
    <strong>网络请求 · 日志 · 文字输入 · 数据仓库 · 时钟 · ID</strong>
    <small>打印和下载服务需要由应用主动调用</small>
  </div>
</div>

## 先认识公开接口

大多数应用只需要使用下面这些公开接口：

| 接口 | 用途 |
| --- | --- |
| `createInkLayer()` | 创建一个 Core 实例，并组装查看器、批注引擎、Page Flow 和已安装的能力插件 |
| `core.viewer` | 加载 PDF，处理页面、缩放、导航、搜索、文字选择、目录和缩略图 |
| `core.annotations` | 切换工具、创建和编辑批注，并提供批注数据仓库 |
| `core.annotationTypes` | 注册和查询内置或自定义批注类型 |
| `core.capabilities` | 取得安装到当前实例的服务 |
| 独立的导入与导出入口 | 导入 PDF 原生批注或生成 PDF、Excel；这些较重的依赖不会进入查看器的主要加载路径 |

底层的 PDF.js 和 Konva 对象属于实现细节。应用通过 Core 的公开接口完成操作，得到的是独立、可序列化的数据，而不是渲染节点或可变的内部集合。

## 数据如何流动

1. 应用把 PDF URL 或字节交给 `core.load()`，查看器通过 PDF.js 打开文档。
2. Page Flow 创建页面容器，并按需挂载 PDF 画布、文字层和批注层。
3. 批注操作会更新 `core.annotations.repository`。Konva 只负责把这些规范数据绘制到页面上，Canvas 不是批注数据源。
4. 导入器把 PDF 原生批注转换成相同的数据模型；导出器读取原始 PDF 字节和当前批注，生成新的 PDF 或 Excel 字节。
5. 生成内容是下载、上传还是打印，由应用决定。

正因为数据和渲染彼此分离，应用保存批注时不需要序列化 Canvas 节点，React、Vue 和原生 JavaScript 接入也能共用同一套行为。

## 依赖方向

Core 内部依赖保持单向：

| 分层 | 职责与依赖限制 |
| --- | --- |
| 领域模型与数据仓库 | 定义可序列化的批注数据和存取操作，不依赖 DOM、PDF.js 或 Konva |
| 几何计算 | 处理坐标、变换和颜色，不依赖具体渲染框架 |
| 查看器 | 负责 PDF.js 加载、页面渲染、文字层、搜索、目录、缩略图和文档生命周期 |
| 批注与 Konva 渲染器 | 负责批注交互和视觉呈现，依赖领域模型、几何计算、数据仓库和 Konva |
| 导入与导出 | 在外部文件和规范数据模型之间转换，并通过独立的包入口发布 |
| 浏览器平台与能力插件 | 把特定运行环境的操作和应用提供的服务接入单个实例 |

`npm run check:dependencies` 会检查本地 TypeScript 引用，发现循环依赖、禁止的跨层依赖以及意外引入的框架依赖。

## 实例拥有和清理哪些资源

每个 Core 实例都管理自己的文档加载任务、已渲染页面、文字层、批注层、事件监听以及临时浏览器资源。替换文档时，上一份文档占用的资源会被释放；调用 `core.destroy()` 会释放当前实例拥有的全部资源，而且可以安全地重复调用。

批注数据仓库是主要例外：它既可以由 Core 管理，也可以由应用持有。应用持有的数据仓库不会随着 Core 实例销毁。具体的保存方式见[保存和恢复批注](./guide/persistence)。

## 框架和 Core 在哪里分工

划分依据是职责，而不是功能是否有可见界面。以搜索为例：Core 负责提取文字、查找结果和跳转；应用负责渲染搜索框和结果列表。

下一页的 [Core 边界](./core-boundary)会按功能列出双方职责，并说明新增功能应该放在哪一侧。
