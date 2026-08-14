# InkLayer Core 最终完整性检测白皮书

> 实施更新（2026-08-13）：本文识别的六项 P0 已全部落地；P1 的删除撤销、Tag 完整行为、键盘取消/删除/顶点回退、可访问替代树和 Transformer 主题契约也已完成。React 已加入最小真实 Core bridge 并通过生产构建。浏览器自动化当前覆盖 Chromium；Firefox/WebKit 的系统打印与 Acrobat/Safari Preview 外观仍属于发布前人工/CI 环境验收，不能由本地单浏览器结果代替。

> 检测日期：2026-08-12  
> Core 基线：`inklayer-core@e890bcd`（`0.1.0`，`main`）  
> React 基线：`inklayer-react@977fe6b`（`1.2.2`，`main`）  
> 检测性质：V1 发布前的最终能力审计，不是实现进度自述  
> 判定对象：Core 是否已经能够承接 React/Vue 共享的 PDF Viewer 与批注行为

## 0. 实施完成状态（2026-08-13）

本轮已经完成本文列出的全部代码级 P0，并完成主要 P1 交互补足：

- 内容更新、现有 FreeText/Note 再编辑及 renderer state 同步；
- Signature image/ink 双形态 V1 模型，Stamp/Signature PDF `/AP /N`；
- 类型、完整 appearance、自有标记与图片载荷的 Core→PDF→Core 回环；
- selection 来源/点击语义与多来源 hover coordinator；
- React 最小真实 `CoreAnnotationBridge`，正式消费 `inklayer-core` 包；
- 删除/评论撤销栈、键盘 Delete/Backspace/Escape、顶点回退；
- Tag 临时快捷键、边缘避让、160px 省略和稳定碰撞消解；
- Canvas 可访问替代树和公开 Transformer 主题契约；
- 公共 annotation contracts、Canonical V1 与 React 迁移指南。

代码级发布检查已通过。仍不能由代码自动化替代的项目是：Acrobat、macOS Preview/Safari 的 PDF 外观和系统打印人工验收，以及 React 本地 `canvas.node` ABI 修复后的完整 Jest 复跑。Firefox/WebKit 浏览器矩阵也应进入发布 CI，而不是被当前 Chromium 结果冒充。

## 1. 最终结论

InkLayer Core 的架构方向成立，Viewer 主链路已经达到框架接入条件，但批注链路仍有发布阻断项。因此当前最准确的结论是：

- **可以开始 React Adapter 的 Viewer 接入和双轨验证；**
- **暂时不能删除 React 旧 Painter、PDF 导出器和签名/印章路径；**
- **不应把当前 Core 作为“批注功能完整替代版”正式发布；**
- 完成本文 6 个 P0 项后，React 和 Vue 才可以真正只负责产品 UI、状态投影和业务工作流。

整体判定如下：

| 领域 | 判定 | 说明 |
|---|---|---|
| PDF 加载与生命周期 | 可接入 | Worker 零配置、URL/Data、Range、进度、密码、权限、竞态和销毁均已形成 Core 契约 |
| Viewer 文档能力 | 可接入 | 缩放、四种 PDF.js 排版、搜索、目录、缩略图、TextLayer、跨页选择均已覆盖 |
| 连续多页页面流 | 可接入但需扩充验证 | 已有虚拟挂载、超扫、当前页、缩放和 Pinch；真实长文档与混合页面仍缺少验证 |
| 批注创建与直接操作 | 部分可接入 | 16 类工具、命中区、变换、Freehand 合并、Free-highlight 修正、多点绘制已具备；资产型签名和若干编辑闭环不完整 |
| 批注协作语义 | 基本可接入 | 用户、权限、评论、状态、编号、引用均已进入 Core；删除撤销仍缺失 |
| 原生 PDF 导入/导出 | **不可最终替换** | 字典和几何覆盖较广，但 Stamp 图片外观、类型/外观回环和跨阅读器可见性未闭环 |
| 打印与水印 | 可接入 | 安全栅格打印可合成 PDF、批注和水印；仍需真实系统打印和浏览器矩阵验证 |
| Adapter 公共契约 | 需收口 | 选择/悬停来源、内容编辑命令、交互主题和稳定导出面仍不完整 |
| 发布验证 | Core 绿灯，产品矩阵未完成 | Core 完整检查通过；React Node 24 测试环境本身失效，且尚无 React→Core 消费者验收 |

## 2. Core 的最终边界

完成后的边界不应是“React/Vue 只画几个按钮”，而应是以下稳定分工。

### Core 必须负责

- PDF.js Worker、文档加载、Range、进度、密码、权限和错误恢复语义；
- PDF 页面、缩放、排版、目的地、目录、搜索、缩略图和 TextLayer；
- 同页与跨页文字选择的归一化、搜索结果的页面定位和文字高亮；
- Konva 批注渲染、命中测试、绘制、选择、拖动、缩放、旋转、端点/顶点编辑；
- Freehand 多笔合并、Free-highlight 自动修正、多边形/云线完成规则；
- FreeText 输入生命周期及可替换的输入 Port；
- 批注模型、仓库、评论、权限、引用、编号、导入导出和生命周期；
- 水印合成、打印产物生成和打印临时资源释放；
- 所有会影响不同框架下坐标、数据、交互结果或输出文件的行为。

### React/Vue 应负责

- 工具栏、侧栏、目录树、缩略图列表、搜索框和搜索结果列表；
- 密码对话框、打印选项、颜色/线宽/透明度控件、评论面板；
- 签名的“手写/键入/上传”制作 UI、印章制作 UI 和文件选择策略；
- 国际化、主题布局、滚动条视觉、路由、后端持久化和业务权限提示；
- 把 Core 的事件投影成框架状态，并把用户命令调用回 Core。

应用可以负责“怎么收集输入”，但 Core 必须负责“输入形成什么批注、如何交互、如何持久化和输出”。例如签名编辑器属于应用 UI，图片型签名的规范数据、渲染、变换和导出仍属于 Core。

## 3. 检测方法与证据等级

本次没有把已有文档中的“Complete”直接视为完成，而是同时使用四类证据：

1. React 公共 Props、Painter、Viewer、编辑器、原生批注转换和导出实现；
2. Core 公共入口、领域模型、Viewer/Annotation Engine、Renderer、Import/Export 和平台 Port；
3. 双方测试文件及本次实际运行结果；
4. 用户可见结果是否可被验证，而不只是底层字典或方法存在。

能力状态使用以下标准：

- **完成**：存在稳定 Core 契约，已有实现，并有相称的自动验证；
- **部分完成**：主路径存在，但缺少语义、回环、真实环境或 Adapter 所需契约；
- **缺失**：React 已有且按边界应属于 Core，但 Core 没有等价能力；
- **应用层**：React 当前拥有，但本就不应搬入 Core。

## 4. 完整能力矩阵

### 4.1 Viewer、文档和安全

| React 能力 | Core 状态 | 最终判断 |
|---|---|---|
| URL、内存数据加载 | 完成 | Core 具有明确 `PdfSource`，并复制可转移字节 |
| Worker 配置 | Core 更强 | 默认捆绑版本匹配 Worker，`workerSrc` 只用于 CSP/自托管覆盖 |
| Range `true/false/auto` | Core 更强 | Core 校验 HEAD、206 和 `Content-Range`，支持 headers、credentials、取消与回退 |
| Loading/进度 | Core 更强 | 有 probing/downloading/parsing、唯一字节计数和结构化快照 |
| 带密码 PDF | Core 更强 | 有 required/incorrect、requestId、防陈旧提交、取消和不泄露密码约束 |
| PDF 权限 | Core 更强 | 归一化打印、复制、修改、批注、表单和页面装配权限 |
| `auto/page-actual/page-fit/page-width` | 完成 | Core 另支持 `page-height`，并暴露数值状态和百分比 |
| 双指、触控板、Ctrl/Meta+wheel | 完成 | Viewer 和 Page Flow 共用 Core 手势控制器并保留锚点 |
| 单页/连续/对开/连续对开 | 完成 | PDF.js owned Viewer 支持四种模式；Page Flow 是独立的连续虚拟页面实现 |
| 页码跳转/当前页 | 完成 | Viewer 与 Page Flow 都有稳定页索引命令 |
| 缩略图 | 完成 | Core 负责渲染、缓存、取消；列表 UI 留给框架 |
| 目录 | 完成 | Core 解析层级、样式、内部目标和外部 URL；树 UI 留给框架 |
| 搜索 | 完成 | Core 负责匹配、排序、限制和 TextLayer 高亮；搜索输入/结果 UI 留给框架 |
| 同页文字选择 | 完成 | Core 自有 PDF.js TextLayer 和 DOM Range 归一化，不依赖 `web-highlighter` |
| 跨页文字选择 | Core 更强 | 输出有序的 page-local fragments，便于每页创建一个规范批注 |
| 原生 PDF 批注显示切换 | 基本完成 | 成功解码 ID 与 PDF.js storage 隐藏动作分离，优于 React 先隐藏全部的做法 |
| 下载原 PDF | 应用层 | Core 已提供 Blob 下载 Port；是否允许原件下载由产品/权限决定 |

结论：Viewer 本身已经不是迁移阻断点。React Adapter 不应继续维护第二套 PDF 加载、Pinch、搜索或 TextLayer 逻辑。

### 4.2 打印、水印和输出

| 能力 | Core 状态 | 最终判断 |
|---|---|---|
| 打开系统打印对话框 | 完成 | 隐藏 iframe、Object URL、`afterprint` 清理均已封装 |
| 受密码保护 PDF 打印 | 完成 | 从已解锁 PDF.js 页面生成临时、非加密栅格打印 PDF |
| 打印权限 | 完成 | 禁止打印会拒绝；低分辨率权限会限制 pixel ratio |
| 批注合入打印 | 完成 | Annotation Engine 页面栅格叠加到 PDF 页面栅格 |
| Viewer Canvas 水印 | 完成 | PDF.js 渲染后合成，不污染规范批注数据 |
| 打印/导出水印 | 完成 | `viewer/print/export/thumbnails` 使用同一目标策略 |
| “Prepare print”与真正 Print Demo | 完成 | Vanilla 同时有 Prepare 和 Print 按钮；浏览器 E2E 只验证 Prepare，未实际唤起系统对话框 |
| 系统打印跨浏览器 | 待验证 | Chromium 单测/浏览器路径不能替代 Chrome、Safari、Firefox 的真实打印验收 |

### 4.3 批注类型与创建交互

| 类型/行为 | Core 状态 | 备注 |
|---|---|---|
| Highlight / Strikeout / Underline | 完成 | 同时支持先选择文字再创建；当前 selection 可被 Adapter 读取和清除 |
| FreeText 创建 | 完成 | 默认 textarea 属于 Core，可由 React/Vue 通过 `TextInputProvider` 替换视觉实现 |
| Rectangle / Circle | 完成 | 绘制、命中、拖动、框变换和页面边界限制 |
| Freehand | 完成 | 默认 1000ms 内多笔合为同一批注，保留独立 strokes |
| Free-highlight | 完成 | 接近水平/垂直时自动修正；阈值当前为 Core 固定策略 |
| Note | 完成 | 点击创建、移动和内容语义均有模型 |
| Line / Arrow | 完成 | Core 比 React 工具栏多出独立 Line，使用端点编辑 |
| Polygon / Polyline | 完成 | Core 比 React 工具栏多出类型；绘制中保持开放，双击后完成 |
| Cloud | 完成 | 绘制中开放，完成后生成云线路径 |
| Stamp | **部分完成** | Viewer 内可显示图片 Stamp，但原生 PDF 导出保真未完成 |
| Signature | **语义不一致** | React 签名是图片资产；Core 当前把 Signature 建成 Line/Ink 路径，图片签名无法按签名类型创建 |

Core 工具集合不是简单照搬 React。它增加了 Line、Polygon 和 Polyline，这是合理增强；但 `signature` 不能因名称相同就判定为功能相同。

### 4.4 选择、变换、悬停和 Tag

| 能力 | Core 状态 | 最终判断 |
|---|---|---|
| 细线易选中 | 完成 | `hitStrokeWidth` 至少保持 16 CSS px，并且不写入持久化快照 |
| 类型化 Transformer | 完成 | box、uniform、move、endpoints、vertices 分开处理 |
| 页面边界限制 | 完成 | 拖动、框变换和点控制均约束在页内 |
| Tag 随缩放和拖动定位 | 基本完成 | 已按 Stage scale 投影并在变换中更新 |
| Tag auto/always/hidden | 完成 | auto 为选中或 hover 显示 |
| Tag 临时快捷键显示 | 缺失 | React 支持 macOS Command、其他平台 Alt 临时显示全部 |
| Tag 边缘避让 | 缺失 | React 会在上方空间不足时放到下方，并限制在页面内 |
| 多 Tag 碰撞消解 | 缺失 | React 有稳定碰撞算法；Core 的 always 模式会发生重叠 |
| Tag 最大宽度/省略 | 缺失 | React 约束 160px；Core 长用户名可能遮挡内容 |
| 无变换权限视觉 | 部分完成 | Core 禁用 Transformer，但没有 React 的标签/控制器弱化视觉契约 |
| 多来源 Hover 协调 | 缺失 | React 区分 sidebar pointer/focus、canvas、passive；Core 只有单个 ID，来源之间可能互相清空 |
| Hover Preview | 缺失或需重新定界 | React 从侧栏 hover 时绘制独立预览；Core 仅降低原节点 opacity |
| 选择来源与点击语义 | 缺失 | React 回调带 `isClick`；Core `selectionChanged` 不含 canvas/sidebar/navigation/programmatic 来源 |
| Transformer 主题 | 部分完成 | 控制器颜色在 Painter 内硬编码为 `#1677ff`，尚未成为 Engine 配置或 CSS/主题契约 |

Tag 的坐标 bug 已修复，但“坐标正确”不等于 React 的完整 Tag 行为已经迁移。

### 4.5 内容、评论、协作与撤销

| 能力 | Core 状态 | 最终判断 |
|---|---|---|
| 批注作者和当前用户 | 完成 | 规范 `User` 模型和运行时切换 |
| Owner-only/自定义权限 | 完成 | create/transform/edit/delete/comment/status/comment edit/delete 均有动作契约 |
| 评论增删改 | 完成 | Core 负责规范变更，框架负责面板和输入 UI |
| 评论状态 | 完成 | 状态变化进入权限和领域模型 |
| 稳定编号与 `#N` 引用 | 完成 | 编号、引用校验和标签同步在 Core |
| 引用候选、Hover Card | 应用层 | React 组件可继续保留，通过 Core 仓库和导航命令获取数据 |
| 删除后撤销 | **缺失** | React 有 8 秒窗口、批注/评论批量撤销和暂停；Core 尚无命令历史或删除事务 |
| 现有 FreeText 文字再编辑 | **缺失** | Core 只有创建输入，没有 `requestEditFreeText` 或重建文字节点的内容命令 |
| 批注正文编辑 | **数据/渲染风险** | `updateAnnotation` 可修改 `content`，但不会重建 `rendererState`；FreeText/Note 可能出现侧栏文字与 Canvas 文字不一致 |

最后一项是模型级问题：当前 `content` 和 `rendererState.serialized` 都可以表达文字，却没有统一的更新命令保证二者同步。V1 发布前必须确定唯一事实来源并封装内容更新，而不是要求 Adapter 同时手工修改两份数据。

### 4.6 原生 PDF 导入、导出和回环

Core 当前 PDF 测试证明了：16 个规范类型可以写出字典、基础几何、作者、日期和回复，旋转页坐标也经过低层检查。它没有证明所有批注在 Acrobat、Chrome PDF Viewer、Safari Preview 或其他阅读器中都能以正确外观看见。

已确认的关键缺口：

1. **Stamp 没有图片 Appearance Stream。** Core 创建 Stamp 时要求 `content.image`，Renderer 也显示图片，但 PDF 导出只写 `Subtype /Stamp` 和普通字典，没有嵌入图片或 `/AP`。React 的 Stamp 导出会嵌 PNG 并写 `/AP /N`。
2. **图片签名没有规范路径。** React 的手写、键入、上传最终都会形成图片签名；Core Signature 目前是 Line，且 PDF 导出为 Ink。
3. **自有类型不能完整回环。** Core importer 不支持 PDF.js Stamp（type 13）；Free-highlight 与 Signature 导出为 Ink 后再次导入会退化为 Freehand；Stamp 无法回到 Stamp。
4. **外观不能完整回环。** 导出会写部分颜色、透明度、`BS` 和 `IC`，导入主要读取颜色、总 opacity 和 FreeText 字号，没有恢复 stroke width、dash、line cap/join、fill opacity 等 V1 appearance。
5. **缺少 Appearance Stream/跨阅读器视觉测试。** Rectangle、Circle、Ink、Markup 等可能依赖阅读器自行生成外观；不同阅读器行为并不一致。
6. **测试 Fixture 的 Stamp 没有图片。** 当前 PDF 导出测试为 Stamp 构造空文本内容，只断言 Stamp 字典存在，因此没有覆盖真实用户数据。
7. **FreeText 的 PDF 策略有意使用 Text + 私有标记。** 这是为避免未嵌字体导致 CJK 消失，React 也采用类似策略；该策略可以保留，但必须通过 Core→PDF→PDF.js→Core 的中英文回环测试固化。

Excel 导出方面，Core 已比 React 的扁平行模型更结构化：批注和评论分表，保留 ID、编号、作者、原文、状态和引用。本次未发现发布阻断问题。

### 4.7 兼容、安全和生命周期

| 能力 | Core 状态 | 最终判断 |
|---|---|---|
| 旧 React/Vue 数据转换 | 基本完成 | Legacy parser/serializer 隔离良好，但只支持旧 1–13 工具，不覆盖新 Line/Polygon/Polyline |
| 未知旧字段保留 | 完成 | 写入 `extensions.legacyUnknown` 并发出警告 |
| 非颜色 Appearance 回写旧格式 | 有损且已警告 | 正确行为；新 Adapter 不应继续使用旧持久化格式 |
| 不可信 Konva JSON | 完成 | 白名单、深度、节点、点数、字符串、data URL 和危险 key 限制 |
| 图片来源安全 | 需收紧 | 目前允许普通 URL 和 data URL；发布前需明确 URL scheme、跨域、凭证和 SVG/脚本风险策略 |
| 多实例隔离 | 完成 | Root、Stage、监听器、输入和临时资源按实例拥有 |
| Load/Render 取消与销毁 | 完成 | Generation、AbortController、任务释放和幂等销毁均有覆盖 |
| 长文档/内存压力 | 部分验证 | 有 benchmark 和 100-cycle 压力，但缺少真实 500+ 页、多尺寸、持续滚动场景 |
| SSR/Node 根入口 | 完成 | 重运行时动态加载，根入口无浏览器副作用 |

## 5. Core 已经超过 React 的部分

迁移时不应为了“保持一致”退回旧实现。以下能力应以 Core 为新标准：

- Worker 自动捆绑和冲突管理；
- 经过响应校验、可取消且能准确计数的 Range transport；
- 结构化加载进度、密码请求和 PDF 权限；
- `page-height` 与统一的 Viewer/Page Flow 缩放模型；
- 跨页 DOM selection 和 page-local fragment；
- 虚拟连续页面的可见页资源挂载/释放；
- 密码安全的栅格打印、批注和水印合成；
- 严格/宽松的不可信快照加载策略；
- 原生批注“先成功解码、后隐藏”的安全顺序；
- 未知 legacy 字段保留、稳定引用和结构化 Excel；
- 实例级资源拥有和无共享全局 Painter 状态。

## 6. 发布阻断项（P0）

以下 6 项必须在宣布 Core V1 批注完整、开始移除 React 旧引擎前完成。

### P0-1：统一内容与 Renderer State 的更新闭环

- 增加类型化的内容更新命令，至少覆盖 FreeText、Note 和普通批注正文；
- 内容变化时由 Core 重建或精确更新渲染快照；
- 增加现有 FreeText 的打开、提交、取消和权限检查；
- 禁止 Adapter 直接拼接 Konva JSON；
- 增加“编辑后重挂载、打印、PDF 导出内容一致”的测试。

### P0-2：把 Signature 定义为资产型批注并兼容路径签名

- 明确 V1 Signature 支持 image、ink strokes，或使用显式变体；
- React 的 Draw/Enter/Upload 可以留在 UI，但结果必须能无损传入 Core；
- Renderer、Legacy、PDF export/import、Excel 和打印必须使用同一语义；
- 不允许图片签名在 Core 中被误建为默认矩形折线路径。

### P0-3：完成 Stamp/Signature 的 PDF 可见外观

- 对图片资产做格式、尺寸和字节限制；
- PDF 导出嵌入 PNG/JPEG 并生成旋转正确的 `/AP /N`；
- 覆盖 0/90/180/270 度、透明 PNG、缩放、裁剪和不同页面 box；
- Acrobat、Chrome、Safari/Preview 至少人工验收一次，并保留 fixture。

### P0-4：完成 Core PDF 类型与 Appearance 回环

- 覆盖 Stamp、Signature、Free-highlight 和所有私有类型标记；
- 导入恢复 stroke/fill/text 的可表达 V1 字段；
- 建立 `Core → PDF bytes → PDF.js annotations + metadata → Core` 测试；
- 对无法无损表达的字段发出结构化 warning，而不是静默退化。

### P0-5：补齐 Adapter 所需交互事件契约

- Selection 事件至少携带来源与触发方式，替代 React 的模糊 `isClick`；
- Hover 需要 source-aware coordinator，避免侧栏、焦点和 Canvas 互相清空；
- 明确外部 hover preview 是 Core overlay 还是 Adapter 请求 Core 预览；
- Transformer/点控制器主题色和只读视觉成为公共配置，不保留硬编码。

### P0-6：建立 React→Core 真实消费者验收

- 新建最小 React Adapter，不复制 Loader、Painter、Pinch、TextLayer 或 Store；
- 用 React 现有产品 UI 驱动 Core 的全部 16 类工具；
- 验证加载、密码、Range、搜索、跨页选择、评论、权限、打印、导入导出和销毁；
- 验证 legacy 数据加载后保存为 canonical V1；
- 在验收通过前保留旧 Painter 作为对照，不立即删除。

## 7. 重要改进项（P1）

P1 不必阻塞最小 Adapter 开工，但应在正式稳定版前完成：

- Core 级删除撤销/命令历史，UI Snackbar 继续由框架负责；
- Tag 快捷键临时显示、页面边缘避让、160px 截断和碰撞消解；
- 键盘选择、Delete/Backspace、Escape 取消绘制、顶点回退和焦点所有权；
- Canvas 批注的可访问替代树、ARIA 关系和键盘导航；
- 页面旋转、mixed boxes、mixed sizes 和 500+ 页持续滚动 fixture；
- Chrome、Firefox、WebKit 的 Viewer/Pinch/Selection/Print 矩阵；
- 真实 HTTP Range Server 测试，而不是仅 mock transport；
- URL 加载失败、错误密码、Range 失败和渲染失败的产品级 retry 示例；
- 搜索/缩略图/页面栅格的并发和缓存上限策略；
- 收口公共 API：不要从 `internal/painter` 重新导出公共类型，冻结稳定入口；
- 生成 API 文档、升级指南和 canonical/legacy 数据迁移说明；
- 拆分示例中的大型 export chunks，确保应用只加载实际使用的 PDF/XLSX 后端。

## 8. 明确属于 React/Vue 的事项

以下内容不应再被列为 Core 缺失：

- Viewer 顶栏、侧栏布局、窄屏抽屉、滚动条样式和主题系统；
- Thumbnail 卡片、页码角标和 Outline 展开/收起视觉；
- Search 输入框、结果 snippet、空状态和快捷键提示 UI；
- 工具图标、颜色面板、线宽面板、批注菜单和 Tooltip；
- 评论列表、引用输入、Hover Card、状态按钮和删除撤销 Snackbar；
- 签名/印章制作器的表单、上传限制提示、字体列表和业务模板；
- 密码 Dialog、打印选项 Dialog、文件名、下载/上传和保存按钮；
- 国际化、品牌色、Radix/shadcn 等组件库选择。

这些 UI 必须通过 Core 公共命令和事件工作，不能借“应用层”名义重新实现坐标、Painter、PDF export 或 Pinch。

## 9. 本次验证结果

### Core

使用 Node `24.18.0` 执行完整检查：

- TypeScript 主代码与测试类型检查通过；
- ESLint 通过；
- 99 个文件的注释/文档规则通过；
- 56 个源文件依赖层级无循环和禁用边；
- Vitest：25 个文件、112 项测试全部通过；
- Playwright Chromium：2 项通过，覆盖完整 Vanilla 主流程和移动断点；
- ESM/CJS 构建、Vanilla 构建和 20 个 package export targets 检查通过；
- 独立消费者打包安装检查通过。

构建仍报告示例中的 PDF/Excel 动态块超过 500 kB，这是性能/按需加载问题，不是正确性失败。

### React

使用同一 Node `24.18.0` 执行 `npm run test:ci -- --silent`：

- 45 个 suites 中 14 个能够运行并通过，共 83 项测试通过；
- 31 个 suites 在启动阶段失败；
- 失败原因不是断言，而是本地 `canvas.node` 使用 ABI 127 编译，Node 24 需要 ABI 137；
- 因此本次不能把 React 测试基线判为功能失败，也不能把它当作可靠绿灯；
- React 测试环境需要在其目标 Node 版本下重新安装/重编 `canvas` 后再执行迁移对照。

本次审计没有修改 React 代码，也没有通过重装依赖改变 React 工作区。

## 10. 推荐执行顺序与最终接入门槛

建议严格按以下顺序收尾：

1. 内容/FreeText 编辑闭环；
2. Signature 规范模型；
3. Stamp/Signature PDF Appearance Stream；
4. 全类型与 Appearance PDF 回环；
5. Selection/Hover/Transformer Adapter 契约；
6. React 最小 Adapter 双轨验收；
7. 删除撤销、Tag 完整行为和键盘/无障碍；
8. 浏览器、Range、旋转、长文档和错误恢复矩阵；
9. 公共 API freeze、文档和正式发布。

满足以下条件时，才可以宣布“React/Vue 只实现 UI 层”：

- React Adapter 不再 import Konva、不再拥有 Painter、不再直接操作 PDF.js annotation storage；
- React Adapter 不再实现 Pinch、TextLayer selection、批注变换或 PDF 字典写入；
- 图片签名/印章在 Viewer、重挂载、打印和三种主流 PDF 阅读器中一致可见；
- 修改 FreeText/Note 后，侧栏、Canvas、保存、打印和导出内容一致；
- Core→PDF→Core 全类型回环没有静默类型退化；
- React 和 Vue 消费相同 canonical V1，不再持久化各自的内部 Store；
- Core 完整检查、React Adapter E2E 和浏览器矩阵全部通过。

## 11. 发布建议

当前版本适合标记为 **V1 Release Candidate 的 Viewer/Engine 基线**，不适合标记为最终稳定版。可以立即开始 React Adapter 的 Viewer 接入，以真实产品 UI 反向验证公共契约；同时应冻结新增范围，优先消除本文 P0。

最重要的判断不是“还有多少功能按钮”，而是剩余问题是否会造成数据、外观或跨框架行为分叉。当前 P0 正好都属于这类问题。完成它们后，Core 才真正成为 React、Vue 和 Vanilla 的唯一 PDF Viewer/Annotation Engine，而不是另一套功能相近的实现。
