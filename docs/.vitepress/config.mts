import { defineConfig } from 'vitepress'

const base = process.env['DOCS_BASE'] ?? '/'

export default defineConfig({
  title: 'InkLayer Core',
  description: 'Framework-independent PDF viewing and annotation engine.',
  base,
  cleanUrls: true,
  lastUpdated: true,
  head: [
    ['meta', { name: 'theme-color', content: '#175cd3' }]
  ],
  themeConfig: {
    logo: { src: '/logo.svg', alt: 'InkLayer Core' },
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'Architecture', link: '/architecture' },
      { text: 'Demo', link: 'https://inklayer-dev.github.io/inklayer-core/demo/' }
    ],
    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is InkLayer Core?', link: '/' },
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Framework integration', link: '/guide/framework-integration' }
        ]
      },
      {
        text: 'Build a viewer',
        items: [
          { text: 'Viewer and page flow', link: '/guide/viewer-and-pages' },
          { text: 'Annotations', link: '/guide/annotations' },
          { text: 'Output and security', link: '/guide/output-and-security' },
          { text: 'Error recovery', link: '/error-recovery' },
          { text: 'Accessibility', link: '/accessibility' }
        ]
      },
      {
        text: 'Reference',
        items: [
          { text: 'Public API', link: '/api' },
          { text: 'Data model', link: '/data-model' },
          { text: 'CSS contract', link: '/css-contract' },
          { text: 'Legacy data', link: '/legacy-data' },
          { text: 'Browser support', link: '/browser-support' },
          { text: 'Build-tool support', link: '/consumer-build-matrix' }
        ]
      },
      {
        text: 'Architecture',
        items: [
          { text: 'Architecture overview', link: '/architecture' },
          { text: 'Core boundary', link: '/core-boundary' },
          { text: 'Decision records', link: '/adr/' }
        ]
      }
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/inklayer-dev/inklayer-core' }
    ],
    search: { provider: 'local' },
    outline: { level: [2, 3] },
    editLink: {
      pattern: 'https://github.com/inklayer-dev/inklayer-core/edit/main/docs/:path',
      text: 'Edit this page on GitHub'
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © InkLayer contributors'
    }
  }
})
