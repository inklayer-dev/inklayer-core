/**
 * @file Semantic product shell for the framework-free Core showcase.
 * @description Contains presentation markup only; behavior stays in the session controller.
 */

import { ANNOTATION_TOOL_DEFINITIONS, CORE_VERSION } from '@inklayer-dev/core'
import logoUrl from '../assets/logo.svg?url'
import { DEMO_TOOLS, toolIcon } from './tool-catalog'

const groups = ['Navigate', 'Markup', 'Draw', 'Shapes', 'Content'] as const

/** Renders a compact, accessible toolbar button with a shared label treatment. */
function iconButton(icon: string, label: string, className: string, extra = ''): string {
  return `<button class="icon-button ${className}" type="button" aria-label="${label}" title="${label}" ${extra}>${icon}<span class="control-label">${label}</span></button>`
}

/** Renders the single-instance application frame owned by the demo product. */
export function appMarkup(): string {
  return `
    <main class="demo-shell">
      <header class="demo-header">
        <div class="brand" aria-label="InkLayer Core">
          <img class="brand-mark" src="${logoUrl}" alt="">
          <strong>inklayer <em>core</em></strong>
          <span class="version">v${CORE_VERSION}</span>
        </div>
        <div class="document-identity">
          <span class="document-dot" aria-hidden="true"></span>
          <span class="global-document-name">InkLayer Core sample.pdf</span>
        </div>
        <div class="global-actions">
          <a class="docs-link" href="../guide/getting-started" target="_blank" rel="noreferrer">API guide</a>
          <a class="github-link icon-link" href="https://github.com/inklayer-dev/inklayer-core" target="_blank" rel="noreferrer" aria-label="InkLayer Core on GitHub" title="View InkLayer Core on GitHub">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48v-1.9c-2.78.6-3.37-1.18-3.37-1.18-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.61.07-.61 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.35 1.09 2.92.83.09-.65.35-1.09.64-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0112 6.8c.85 0 1.7.11 2.5.34 1.9-1.29 2.74-1.02 2.74-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.86v2.77c0 .27.18.58.69.48A10 10 0 0012 2z"/></svg>
          </a>
          <button id="destroy-all" class="quiet-action" type="button" title="Destroy and recreate every Core instance">Restart Core</button>
        </div>
      </header>
      <section id="instance-grid" class="instance-grid" aria-label="InkLayer Core workspace"></section>
    </main>`
}

/** Renders one complete workspace host for an InkLayer Core session. */
export function instanceMarkup(label: string): string {
  const tools = ['text-select', 'select', ...Object.keys(ANNOTATION_TOOL_DEFINITIONS)]
    .map((tool) => `<option value="${tool}">${tool}</option>`).join('')
  const toolGroups = groups.map((group) => {
    const buttons = DEMO_TOOLS.filter((item) => item.group === group).map((item) => `
      <button class="tool-button" type="button" data-tool="${item.tool}" aria-label="${item.label}" title="${item.label}">
        ${item.icon}<span>${item.label}</span>
      </button>`).join('')
    return `<section class="tool-group" data-tool-group="${group.toLowerCase()}"><h3>${group}</h3><div class="tool-grid">${buttons}</div></section>`
  }).join('')

  return `
    <div class="mobile-scrim" hidden></div>
    <div class="workspace-bar" aria-label="Document actions">
      <div class="workspace-title">
        <span class="workspace-file-icon" aria-hidden="true">PDF</span>
        <div><strong class="document-name">InkLayer Core sample.pdf</strong><span>Framework-free reference workspace</span></div>
      </div>
      <div class="workspace-actions">
        <label class="file-control primary-action">${toolIcon('note')}<span>Open PDF</span><input class="pdf-file" type="file" accept="application/pdf,.pdf"></label>
        <div class="output-menu-wrap">
          <button class="print quiet-action" type="button">Print</button>
          <button class="output-toggle primary-action" type="button" aria-expanded="false">Export</button>
          <div class="output-menu" hidden>
            <button class="export-pdf" type="button"><strong>Annotated PDF</strong><span>Native, editable annotations</span></button>
            <button class="export-excel" type="button"><strong>Annotation workbook</strong><span>Review data as .xlsx</span></button>
            <button class="prepare-print" type="button"><strong>Prepare secure print</strong><span>Raster-safe printable PDF</span></button>
          </div>
        </div>
        <button class="mobile-panel-toggle quiet-action" data-panel="right" type="button" aria-label="Open annotation tools">Tools</button>
      </div>
    </div>

    <div class="document-toolbar" aria-label="Viewer controls">
      <div class="toolbar-group toolbar-tools">
        ${iconButton(toolIcon('select'), 'Select', 'toolbar-select', 'data-tool-shortcut="select"')}
        ${iconButton(toolIcon('text-select'), 'Select text', 'toolbar-text-select', 'data-tool-shortcut="text-select"')}
        <button class="mobile-panel-toggle icon-button" data-panel="left" type="button" aria-label="Open document navigation">${toolIcon('note')}<span class="control-label">Navigate</span></button>
      </div>
      <div class="toolbar-group page-controls">
        <button class="previous-page icon-button" type="button" aria-label="Previous page">‹</button>
        <label class="page-number-label"><span class="sr-only">Page</span><input class="page-number" type="number" min="1" value="1"><span>/ <output class="page-count">—</output></span></label>
        <button class="next-page icon-button" type="button" aria-label="Next page">›</button>
      </div>
      <div class="toolbar-group zoom-controls">
        <button class="zoom-out icon-button" type="button" aria-label="Zoom out">−</button>
        <output class="scale-value">100%</output>
        <button class="zoom-in icon-button" type="button" aria-label="Zoom +" title="Zoom in">+</button>
        <label class="scale-control"><span class="sr-only">Scale</span><select class="scale-select">
          <option value="auto">Auto</option><option value="page-actual">Actual</option>
          <option value="page-fit">Fit page</option><option value="page-width">Fit width</option>
          <option value="page-height">Fit height</option><option value="0.5">50%</option>
          <option value="0.75">75%</option><option value="1" selected>100%</option>
          <option value="1.25">125%</option><option value="1.5">150%</option>
          <option value="2">200%</option><option value="custom" disabled>Custom</option>
        </select></label>
      </div>
      <div class="toolbar-group layout-controls" role="group" aria-label="Page layout">
        <button class="single segmented active" type="button" aria-pressed="true">Single</button>
        <button class="continuous segmented" type="button" aria-pressed="false">Continuous</button>
      </div>
    </div>

    <div class="workspace-layout">
      <aside class="left-sidebar app-panel" aria-label="Document navigation">
        <div class="panel-tabs" role="tablist" aria-label="Document panels">
          <button type="button" role="tab" aria-selected="true" data-side-tab="pages">Pages</button>
          <button type="button" role="tab" aria-selected="false" data-side-tab="outline">Outline</button>
          <button type="button" role="tab" aria-selected="false" data-side-tab="search">Search</button>
          <button class="mobile-panel-close" type="button" aria-label="Close navigation">×</button>
        </div>
        <section class="side-panel active" data-side-panel="pages">
          <div class="thumbnail-items" aria-label="Page thumbnails"></div>
        </section>
        <section class="side-panel" data-side-panel="outline" hidden>
          <div class="panel-heading"><strong>Document outline</strong><span>Core-resolved destinations</span></div>
          <div class="outline-items empty-message">No outline in this document.</div>
        </section>
        <section class="side-panel" data-side-panel="search" hidden>
          <form class="search-form"><label><span class="sr-only">Search document</span><input class="search-input" type="search" value="Core" placeholder="Search this PDF"></label><button type="submit">Find</button></form>
          <p class="panel-hint">Matches and active highlights are calculated by Core.</p>
          <div class="search-results" aria-live="polite"></div>
        </section>
      </aside>

      <section class="document-stage" aria-label="PDF document">
        <div class="text-selection-menu" role="toolbar" aria-label="Text annotation actions" hidden>
          <button type="button" data-text-markup="highlight">${toolIcon('highlight')}<span>Highlight</span></button>
          <button type="button" data-text-markup="underline">${toolIcon('underline')}<span>Underline</span></button>
          <button type="button" data-text-markup="strikeout">${toolIcon('strikeout')}<span>Strikeout</span></button>
        </div>
        <div class="page-scroll">
          <div class="page-surface"><canvas class="pdf-canvas" aria-label="Rendered PDF page"></canvas><div class="text-layer-host" aria-label="Selectable PDF text"></div><div class="annotation-host" aria-label="Annotation canvas"></div></div>
        </div>
        <div class="flow-scroll" aria-label="Continuous PDF pages" hidden></div>
        <div class="stage-progress" hidden><span class="spinner" aria-hidden="true"></span><div><strong>Opening document</strong><output class="load-progress" aria-label="PDF load progress" aria-live="polite"></output></div></div>
      </section>

      <aside class="right-sidebar app-panel" aria-label="Annotation workspace">
        <div class="panel-tabs" role="tablist" aria-label="Annotation panels">
          <button type="button" role="tab" aria-selected="true" data-right-tab="tools">Tools</button>
          <button type="button" role="tab" aria-selected="false" data-right-tab="annotations">Annotations</button>
          <button class="mobile-panel-close" type="button" aria-label="Close annotation tools">×</button>
        </div>
        <section class="right-panel active" data-right-panel="tools">
          <select class="tool-select sr-only" aria-label="Annotation tool">${tools}</select>
          <section class="plugin-showcase" data-state="uninstalled" aria-labelledby="${label}-plugin-title">
            <div class="plugin-heading">
              <div><strong id="${label}-plugin-title">Annotation plugin</strong><span>Interactive lifecycle demo</span></div>
              <span class="plugin-state">Not installed</span>
            </div>
            <p class="plugin-description">Install a custom Measurement type. It will appear in the tool palette below.</p>
            <div class="plugin-actions">
              <button class="plugin-install primary-action" type="button">Install Measurement plugin</button>
              <button class="plugin-unload quiet-action" type="button" hidden>Unload plugin</button>
              <button class="plugin-reload primary-action" type="button" hidden>Reload plugin</button>
            </div>
            <output class="plugin-result" aria-live="polite">No custom Definition is registered.</output>
          </section>
          <div class="tool-palette">${toolGroups}</div>
          <section class="appearance-panel">
            <div class="panel-heading"><strong>Appearance</strong><span class="appearance-target">Choose a drawing tool</span></div>
            <div class="appearance-grid">
              <label class="appearance-field appearance-primary-field"><span>Primary</span><input class="appearance-color" type="color" value="#ff6b6b"></label>
              <label class="appearance-field appearance-fill-field"><span>Fill</span><input class="appearance-fill-color" type="color" value="#ffffff"></label>
              <label class="appearance-field appearance-width-field"><span>Width</span><input class="appearance-width" type="range" min="1" max="20" step="1" value="2"><output class="appearance-width-value">2 pt</output></label>
              <label class="appearance-field appearance-opacity-field"><span>Opacity</span><input class="appearance-opacity" type="range" min="0.05" max="1" step="0.05" value="1"><output class="appearance-opacity-value">100%</output></label>
              <label class="appearance-field appearance-dash-field"><span>Line</span><select class="appearance-dash"><option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option></select></label>
              <label class="appearance-field appearance-font-field"><span>Text</span><input class="appearance-font-size" type="number" min="8" max="72" value="14"><output>pt</output></label>
              <label class="appearance-field appearance-tag-field"><span>Tags</span><select class="tag-visibility"><option value="auto" selected>Hover / selected</option><option value="always">Always</option><option value="hidden">Hidden</option></select></label>
            </div>
          </section>
          <section class="selection-actions"><button class="add-sample" type="button">Place sample</button><button class="comment" type="button">Add comment</button><button class="delete danger-action" type="button">Delete</button></section>
        </section>
        <section class="right-panel" data-right-panel="annotations" hidden>
          <div class="panel-heading"><strong>Annotations</strong><span>Repository-backed review list</span></div>
          <div class="annotation-list" aria-live="polite"><p class="empty-message">No annotations yet. Select text or choose a tool.</p></div>
        </section>
      </aside>
    </div>

    <footer class="status-bar">
      <button class="capability-toggle" type="button" aria-expanded="false">${toolIcon('note')}<span>Capability Lab</span></button>
      <span class="status-divider"></span><span class="status-page">Page 1</span><span class="status-divider"></span><span class="status-scale">100%</span><span class="status-divider"></span><span class="status-layout">Single page</span>
      <span class="status-spacer"></span><p class="instance-status" role="status" aria-live="polite">Idle</p><span class="status-divider"></span><span class="status-annotations">0 annotations</span>
    </footer>

    <dialog class="capability-dialog" aria-labelledby="${label}-lab-title">
      <div class="lab-shell">
        <header><div><h2 id="${label}-lab-title">Capability Lab</h2><p>Exercise production behaviors without crowding the review workspace.</p></div><button class="capability-close icon-button" type="button" aria-label="Close Capability Lab">×</button></header>
        <div class="lab-grid">
          <section><h3>Loading & security</h3><p>Password lifecycle, HTTP Range and cancellation.</p><div class="lab-actions"><button class="password-sample" type="button">Password PDF</button><button class="range-sample" type="button">URL Range PDF</button><button class="cancel-load" type="button">Cancel load</button><button class="reload" type="button">Reload</button></div></section>
          <section><h3>Page flow</h3><p>Mixed geometry and bounded long-document virtualization.</p><div class="lab-actions"><button class="mixed-sample" type="button">Mixed PDF</button><button class="long-sample" type="button">Long PDF</button></div></section>
          <section><h3>Watermark</h3><p>One policy across viewer, print and export targets.</p><label class="lab-field"><span>Text</span><input class="watermark-text" value="Demo · InkLayer Core"></label><label class="check-field"><input class="watermark-enabled" type="checkbox" checked><span>Show on viewer and print</span></label></section>
          <section><h3>Lifecycle</h3><p>Dispose and rebuild Viewer, Annotation and PageFlow together.</p><div class="lab-actions"><button class="restart-instance" type="button">Restart this workspace</button></div></section>
          <section><h3>Collaboration policy</h3><p>Switch the canonical repository between unrestricted and owner-only editing.</p><label class="check-field"><input class="owner-only" type="checkbox"><span>Owner-only annotation changes</span></label></section>
        </div>
        <section class="recovery-tools" aria-label="${label} error recovery examples">
          <div class="recovery-heading"><div><strong>Error recovery</strong><span>Every failure is intentional and retryable.</span></div><button class="retry-recovery" type="button" disabled>Retry last failure</button></div>
          <div class="recovery-actions"><button class="fail-url" type="button">Fail URL once</button><button class="fail-range" type="button">Fail Range once</button><button class="fail-render" type="button">Fail render once</button></div>
          <p class="recovery-hint">Core emits stable errors and keeps application-owned recovery explicit.</p>
          <div class="recovery-outcome" role="status" aria-live="polite" hidden><p class="recovery-summary"></p><dl><div><dt>Code / event</dt><dd><code class="recovery-code"></code></dd></div><div><dt>Operation</dt><dd><code class="recovery-operation"></code></dd></div><div><dt>Context</dt><dd><code class="recovery-context"></code></dd></div></dl></div>
        </section>
        <section class="event-monitor"><div class="panel-heading"><strong>Core activity</strong><span>Typed events from the current session</span></div><ol class="event-list"><li><time>now</time><span>Workspace composition ready</span></li></ol></section>
      </div>
    </dialog>

    <dialog class="password-dialog" aria-labelledby="${label}-password-title"><form class="password-form"><div class="dialog-icon">${toolIcon('note')}</div><h3 id="${label}-password-title">Open protected PDF</h3><p class="password-message"></p><label>Password<input class="password-input" type="password" autocomplete="current-password" required></label><p class="dialog-hint">Demo fixture password: <code>asdfasdf</code></p><div class="dialog-actions"><button class="cancel-password" type="button">Cancel</button><button class="primary-action" type="submit">Unlock</button></div></form></dialog>
  `
}
