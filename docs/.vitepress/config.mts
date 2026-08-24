import { defineConfig } from 'vitepress'

const base = process.env['DOCS_BASE'] ?? '/'

export default defineConfig({
  title: 'InkLayer Core',
  description: 'Framework-independent PDF viewing and annotation engine.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  locales: {
    root: { label: 'English', lang: 'en' },
    zh: {
      label: '简体中文',
      lang: 'zh-CN',
      link: '/zh/',
      title: 'InkLayer Core',
      description: '与框架无关的 PDF 查看和批注内核。',
      themeConfig: {
        logoLink: '/zh/',
        nav: [
          { text: '指南', link: '/zh/guide/getting-started' },
          { text: 'API', link: '/zh/api' },
          { text: '插件', link: '/zh/guide/plugins' },
          { text: '架构', link: '/zh/architecture' },
          { text: '示例', link: 'https://inklayer-dev.github.io/inklayer-core/demo/' }
        ],
        sidebar: [
          {
            text: '入门',
            items: [
              { text: '什么是 InkLayer Core？', link: '/zh/' },
              { text: '体验在线示例', link: '/zh/guide/try-demo' },
              { text: '5 分钟构建 Viewer', link: '/zh/guide/getting-started' },
              { text: '创建第一个批注', link: '/zh/guide/first-annotation' }
            ]
          },
          {
            text: '常用功能',
            items: [
              { text: '加载 PDF', link: '/zh/guide/loading-pdfs' },
              { text: '页面、缩放与导航', link: '/zh/guide/viewer-and-pages' },
              { text: '搜索与文字选择', link: '/zh/guide/search-and-selection' },
              { text: '批注工具与外观', link: '/zh/guide/annotations' },
              { text: '保存和恢复批注', link: '/zh/guide/persistence' },
              { text: '打印、导出与水印', link: '/zh/guide/output-and-security' }
            ]
          },
          {
            text: '框架接入',
            items: [
              { text: '在 Web 框架中接入', link: '/zh/guide/framework-integration' }
            ]
          },
          {
            text: '插件开发',
            items: [
              { text: '插件概览', link: '/zh/guide/plugins' },
              { text: '第一个能力插件', link: '/zh/guide/capability-plugin' },
              { text: '自定义批注类型', link: '/zh/guide/custom-annotation-type' },
              { text: '生命周期与服务', link: '/zh/guide/plugin-lifecycle' }
            ]
          },
          {
            text: '参考',
            items: [
              { text: '公开 API', link: '/zh/api' },
              { text: '数据模型', link: '/zh/data-model' },
              { text: 'CSS 合约', link: '/zh/css-contract' },
              { text: '错误恢复', link: '/zh/error-recovery' },
              { text: '无障碍', link: '/zh/accessibility' },
              { text: '浏览器支持', link: '/zh/browser-support' },
              { text: '构建工具支持', link: '/zh/consumer-build-matrix' }
            ]
          },
          {
            text: '深入理解',
            items: [
              { text: '架构概览', link: '/zh/architecture' },
              { text: 'Core 边界', link: '/zh/core-boundary' }
            ]
          }
        ],
        outline: { level: [2, 3], label: '本页内容' },
        editLink: {
          pattern: 'https://github.com/inklayer-dev/inklayer-core/edit/main/docs/:path',
          text: '在 GitHub 上编辑此页'
        },
        docFooter: { prev: '上一页', next: '下一页' },
        lastUpdated: { text: '最后更新于' },
        sidebarMenuLabel: '菜单',
        returnToTopLabel: '返回顶部',
        langMenuLabel: '切换语言',
        darkModeSwitchLabel: '外观',
        lightModeSwitchTitle: '切换到浅色主题',
        darkModeSwitchTitle: '切换到深色主题',
        skipToContentLabel: '跳到正文',
        notFound: {
          title: '页面未找到',
          quote: '该页面不存在或已经移动。',
          linkLabel: '返回中文首页',
          linkText: '返回首页'
        },
        footer: {
          message: '基于 MIT License 发布',
          copyright: '版权所有 © 2026 Laomai'
        }
      }
    }
  },
  head: [
    ['meta', { name: 'theme-color', content: '#6e56cf' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}logo.svg` }]
  ],
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'InkLayer Core' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'Plugins', link: '/guide/plugins' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Demo', link: 'https://inklayer-dev.github.io/inklayer-core/demo/' }
    ],
    sidebar: [
      {
        text: 'Get started',
        items: [
          { text: 'What is InkLayer Core?', link: '/' },
          { text: 'Try the live demo', link: '/guide/try-demo' },
          { text: 'Build a viewer in 5 minutes', link: '/guide/getting-started' },
          { text: 'Create your first annotation', link: '/guide/first-annotation' }
        ]
      },
      {
        text: 'Everyday tasks',
        items: [
          { text: 'Load PDFs', link: '/guide/loading-pdfs' },
          { text: 'Pages, zoom, and navigation', link: '/guide/viewer-and-pages' },
          { text: 'Search and text selection', link: '/guide/search-and-selection' },
          { text: 'Annotation tools and appearance', link: '/guide/annotations' },
          { text: 'Save and restore annotations', link: '/guide/persistence' },
          { text: 'Print, export, and watermarks', link: '/guide/output-and-security' }
        ]
      },
      {
        text: 'Framework integration',
        items: [
          { text: 'Integrate with a web framework', link: '/guide/framework-integration' }
        ]
      },
      {
        text: 'Plugin development',
        items: [
          { text: 'Plugin overview', link: '/guide/plugins' },
          { text: 'Your first Capability plugin', link: '/guide/capability-plugin' },
          { text: 'Custom annotation type', link: '/guide/custom-annotation-type' },
          { text: 'Lifecycle and services', link: '/guide/plugin-lifecycle' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Public API', link: '/api' },
          { text: 'Data model', link: '/data-model' },
          { text: 'CSS contract', link: '/css-contract' },
          { text: 'Error recovery', link: '/error-recovery' },
          { text: 'Accessibility', link: '/accessibility' },
          { text: 'Browser support', link: '/browser-support' },
          { text: 'Build-tool support', link: '/consumer-build-matrix' }
        ]
      },
      {
        text: 'Deep dive',
        items: [
          { text: 'Architecture overview', link: '/architecture' },
          { text: 'Core boundary', link: '/core-boundary' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/inklayer-dev/inklayer-core' }
    ],
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
              modal: {
                displayDetails: '显示详细列表',
                resetButtonTitle: '重置搜索',
                backButtonTitle: '关闭搜索',
                noResultsText: '没有找到相关结果',
                footer: {
                  selectText: '选择',
                  selectKeyAriaLabel: '回车',
                  navigateText: '切换结果',
                  navigateUpKeyAriaLabel: '上箭头',
                  navigateDownKeyAriaLabel: '下箭头',
                  closeText: '关闭',
                  closeKeyAriaLabel: 'Esc'
                }
              }
            }
          }
        }
      }
    },
    outline: { level: [2, 3] },
    editLink: {
      pattern: 'https://github.com/inklayer-dev/inklayer-core/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Laomai'
    }
  }
})
