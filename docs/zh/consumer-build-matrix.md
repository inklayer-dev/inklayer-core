# 构建工具支持

InkLayer Core 验证正式打包产物，而不是 workspace alias。`npm run check:consumer` 会创建全新的使用方目录，安装同一个 `npm pack` 产物，并运行以下固定版本的生产构建矩阵。

## 支持矩阵

| 使用方 | 固定工具链 | 目标 | 可执行证据 |
|---|---|---|---|
| Vite | Vite 8.2.1、TypeScript 6.0.3 | 浏览器 ESM + Node import | 对所有公共入口做类型检查、构建生产资源、导入公共 CSS、输出内置 PDF Worker，并在 Node 中导入包根入口。 |
| Webpack | Webpack 5.101.3、webpack-cli 6.0.1、css-loader 7.1.2、mini-css-extract-plugin 2.9.4 | 浏览器 ES2022 | 导入根入口与 Viewer 入口、提取 `@inklayer-dev/core/style`，并把版本匹配的 `pdf.worker.min.mjs` 输出为生产资源。 |
| Webpack SSR | Webpack 5.101.3 | Node 20 target | 打包根入口与 Viewer 入口，在 Node 中执行生产 CommonJS 服务端 bundle，无浏览器全局变量时创建 Viewer、观察到 `idle`，并干净销毁。 |

包的 Node engine 合约为 `^22.13.0 || >=24.0.0`，本地发布证据当前使用 Node 24.18.0。矩阵的精确版本位于 `scripts/check-consumer.mjs`；修改版本是需要评审的支持决策，而不是普通依赖更新。

## 已覆盖合约

该矩阵保证：

- `@inklayer-dev/core` 与 `@inklayer-dev/core/viewer` 可从打包后的 `exports` map 在浏览器和 SSR 生产构建中解析；
- SSR 期间导入或创建 Viewer 不会求值仅浏览器可用的 PDF.js 运行时代码；
- `@inklayer-dev/core/style` 能解析为 CSS 并被 Webpack 提取；
- 默认 PDF.js Worker 直接从包中输出，无需使用方下载或配置 `workerSrc`；
- Worker 保持为大于 1 MB 的独立 `.mjs` 资源，防止被意外内联或替换为空 stub；
- Vite 与 Webpack 使用同一 tarball，因此验证的是发布文件而非源码别名。

## 有意保留的限制

这是构建工具支持声明，不是跨浏览器运行时矩阵。Chromium、Firefox 与 WebKit 交互支持由 `CORE-013` 跟踪，见[浏览器支持](./browser-support.md)。V1 不单独声明 Next.js 支持：其 Webpack 模式预计复用同样的包合约，但框架特有的服务端/客户端边界必须先有可执行使用方，才能成为正式支持目标。

应用仍可为自托管或 CSP 要求覆盖 `workerSrc`；这样做会改变部署责任，不属于这里验证的零配置路径。

## 复现

先构建包，再运行独立矩阵：

```sh
nvm use 24.18.0
npm run build
npm run check:consumer
```

`npm run check` 会在单元、集成、Chromium、类库、示例和包检查之后运行同一矩阵。
