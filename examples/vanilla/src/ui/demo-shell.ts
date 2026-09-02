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
      <nav class="demo-feature-tabs" aria-label="Core demos">
        <a href="#viewer" data-demo-route="viewer" aria-current="page">Viewer</a>
        <a href="#annotations" data-demo-route="annotations">Annotations</a>
        <a href="#stamp-sign" data-demo-route="stamp-sign">Stamp &amp; Sign</a>
        <a href="#highlighter" data-demo-route="highlighter">Keyword Highlighter</a>
        <a href="#redaction" data-demo-route="redaction">Redaction</a>
        <a href="#watermark" data-demo-route="watermark">Watermark</a>
        <a href="#custom-annotations" data-demo-route="custom-annotations">Custom Annotations</a>
      </nav>
      <section id="instance-grid" class="instance-grid" aria-label="InkLayer Core workspace" data-demo-route-panel></section>
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
        <button class="show-code quiet-action" type="button" aria-label="Show code" aria-haspopup="dialog"><span class="code-action-symbol" aria-hidden="true">&lt;/&gt;</span><span class="code-action-label">Show code</span><span class="code-action-label-mobile">Code</span></button>
        <label class="file-control primary-action">${toolIcon('note')}<span>Open PDF</span><input class="pdf-file" type="file" accept="application/pdf,.pdf"></label>
        <div class="output-menu-wrap">
          <button class="print quiet-action" type="button">Print</button>
          <button class="export-redacted primary-action" type="button" disabled><span class="export-redacted-label">Export redacted copy</span><span class="export-redacted-label-mobile">Export redacted</span></button>
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
        <button class="single segmented" type="button" aria-pressed="false">Single</button>
        <button class="continuous segmented active" type="button" aria-pressed="true">Continuous</button>
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
        <section class="side-panel highlighter-panel" data-side-panel="highlighter" hidden></section>
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
          <section class="stamp-sign-panel" aria-labelledby="${label}-stamp-sign-title">
            <div class="stamp-sign-heading">
              <div><strong id="${label}-stamp-sign-title">Stamp &amp; Sign</strong><span>Place once or repeat across pages</span></div>
              <span class="stamp-sign-kind">Image annotations</span>
            </div>
            <div class="stamp-sign-assets" role="group" aria-label="Default stamp and signature">
              <button class="stamp-sign-asset active" type="button" data-stamp-sign-type="stamp" aria-pressed="true">
                <span class="stamp-sign-preview"><img class="stamp-sign-stamp-preview" alt=""></span>
                <span><strong>Approved stamp</strong><small>Default demo asset</small></span>
              </button>
              <button class="stamp-sign-asset" type="button" data-stamp-sign-type="signature" aria-pressed="false">
                <span class="stamp-sign-preview"><img class="stamp-sign-signature-preview" alt=""></span>
                <span><strong>Demo signature</strong><small>Visual signature image</small></span>
              </button>
            </div>
            <section class="stamp-sign-section">
              <div class="stamp-sign-section-heading"><strong>Appearance</strong><span>Also updates a selected mark</span></div>
              <label class="stamp-sign-field"><span>Opacity</span><input class="stamp-sign-opacity" type="range" min="0.05" max="1" step="0.05" value="0.8"><output class="stamp-sign-opacity-value">80%</output></label>
              <label class="stamp-sign-field"><span>Width</span><input class="stamp-sign-width" type="range" min="60" max="220" step="10" value="140"><output class="stamp-sign-width-value">140 pt</output></label>
              <button class="stamp-sign-manual primary-action" type="button">Place manually</button>
            </section>
            <section class="stamp-sign-section stamp-sign-batch-section">
              <div class="stamp-sign-section-heading"><strong>Batch placement</strong><span>One mark per selected page</span></div>
              <label class="stamp-sign-control"><span>Pages</span><input class="stamp-sign-pages" value="all" placeholder="all or 1-3, 5" aria-describedby="${label}-stamp-pages-help"></label>
              <p id="${label}-stamp-pages-help" class="stamp-sign-help">Use all, current, odd, even, or ranges such as 1-3, 5.</p>
              <label class="stamp-sign-control"><span>Position</span><select class="stamp-sign-position"><option value="bottom-right" selected>Bottom right</option><option value="bottom-left">Bottom left</option><option value="top-right">Top right</option><option value="top-left">Top left</option><option value="center">Center</option></select></label>
              <button class="stamp-sign-batch primary-action" type="button">Apply to pages</button>
            </section>
            <button class="stamp-sign-remove quiet-action" type="button">Remove selected</button>
            <p class="stamp-sign-disclaimer">A visual signature is not a certificate-backed PDF digital signature.</p>
          </section>
          <section class="watermark-panel" aria-labelledby="${label}-watermark-title">
            <div class="watermark-heading">
              <div><strong id="${label}-watermark-title">Document watermark</strong><span>One policy across viewer, print and export</span></div>
              <span class="watermark-kind">Viewer policy</span>
            </div>
            <div class="watermark-controls">
              <label class="watermark-control"><span>Text</span><input class="watermark-text" value="Demo · InkLayer Core"></label>
              <label class="watermark-control"><span>Layout</span><select class="watermark-layout"><option value="repeated" selected>Repeated</option><option value="center">Centered</option></select></label>
              <label class="watermark-field"><span>Opacity</span><input class="watermark-opacity" type="range" min="0.05" max="0.5" step="0.05" value="0.1"><output class="watermark-opacity-value">10%</output></label>
              <label class="watermark-field"><span>Rotation</span><input class="watermark-rotation" type="range" min="-90" max="90" step="1" value="-28"><output class="watermark-rotation-value">−28°</output></label>
              <fieldset class="watermark-targets"><legend>Output targets</legend><label><input class="watermark-target-viewer" type="checkbox" checked><span>Viewer</span></label><label><input class="watermark-target-print" type="checkbox" checked><span>Print</span></label><label><input class="watermark-target-export" type="checkbox" checked><span>Export</span></label></fieldset>
              <label class="check-field watermark-enabled-field"><input class="watermark-enabled" type="checkbox" checked><span>Watermark enabled</span></label>
              <p class="watermark-help">Watermarks discourage casual redistribution; they are not access control or tamper-proof signatures.</p>
            </div>
          </section>
          <select class="tool-select sr-only" aria-label="Annotation tool">${tools}</select>
          <section class="plugin-showcase" data-state="installed" aria-labelledby="${label}-plugin-title">
            <div class="plugin-heading">
              <div><strong id="${label}-plugin-title">Custom annotation types</strong><span>Application-owned Definitions</span></div>
              <span class="plugin-state">3 registered</span>
            </div>
            <p class="plugin-description">Each tool owns semantic <code>typeData</code> while Core supplies gestures, transforms, persistence, print, and export.</p>
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
          <section class="selection-actions"><button class="comment" type="button">Add comment</button><button class="delete danger-action" type="button">Delete</button></section>
        </section>
        <section class="right-panel" data-right-panel="annotations" hidden>
          <div class="panel-heading"><strong>Annotations</strong><span>Repository-backed review list</span></div>
          <div class="annotation-list" aria-live="polite"><p class="empty-message">No annotations yet. Select text or choose a tool.</p></div>
        </section>
      </aside>
    </div>

    <footer class="status-bar">
      <button class="capability-toggle" type="button" aria-expanded="false">${toolIcon('note')}<span>Capability Lab</span></button>
      <span class="status-divider"></span><span class="status-page">Page 1</span><span class="status-divider"></span><span class="status-scale">100%</span><span class="status-divider"></span><span class="status-layout">Continuous scroll</span>
      <span class="status-spacer"></span><p class="instance-status" role="status" aria-live="polite">Idle</p><span class="status-divider annotation-status-divider"></span><span class="status-annotations">0 annotations</span>
    </footer>

    <dialog class="code-dialog" aria-labelledby="${label}-code-title">
      <div class="code-shell">
        <header class="code-header">
          <div><span class="code-eyebrow">COPYABLE TYPESCRIPT</span><h2 id="${label}-code-title" class="code-title">Minimal Core example</h2></div>
          <button class="code-close icon-button" type="button" aria-label="Close code example">×</button>
        </header>
        <div class="code-intro"><p class="code-summary"></p><p class="code-requirement"></p></div>
        <div class="code-source-controls">
          <div class="code-toolbar"><span>TypeScript</span><button class="code-copy quiet-action" type="button">Copy code</button></div>
          <div class="code-variants" role="tablist" aria-label="Code examples" hidden></div>
        </div>
        <pre class="code-block" tabindex="0"><code></code></pre>
        <footer class="code-footer"><a class="code-guide primary-action" target="_blank" rel="noreferrer">Read full guide</a><a class="code-source quiet-action" target="_blank" rel="noreferrer">View demo source</a></footer>
      </div>
    </dialog>

    <dialog class="capability-dialog" aria-labelledby="${label}-lab-title">
      <div class="lab-shell">
        <header><div><h2 id="${label}-lab-title">Capability Lab</h2><p>Exercise production behaviors without crowding the review workspace.</p></div><button class="capability-close icon-button" type="button" aria-label="Close Capability Lab">×</button></header>
        <div class="lab-grid">
          <section><h3>Loading & security</h3><p>Password lifecycle, HTTP Range and cancellation.</p><div class="lab-actions"><button class="password-sample" type="button">Password PDF</button><button class="range-sample" type="button">URL Range PDF</button><button class="cancel-load" type="button">Cancel load</button><button class="reload" type="button">Reload</button></div></section>
          <section><h3>Page flow</h3><p>Mixed geometry and bounded long-document virtualization.</p><div class="lab-actions"><button class="mixed-sample" type="button">Mixed PDF</button><button class="long-sample" type="button">Long PDF</button></div></section>
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
