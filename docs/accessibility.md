# Keyboard and Accessibility Contract

InkLayer divides accessibility ownership at the document boundary. Core owns
keyboard and assistive semantics for PDF text, annotation Canvas content, and
temporary direct-document editors. React, Vue, and other product adapters own
their labelled toolbars, sidebars, dialogs, contextual menus, shortcuts, and
application-level focus order.

## Annotation keyboard contract

When `keyboard.enabled` is not `false`, Core adds a fallback `tabindex="0"`,
`role="region"`, and accessible name to an otherwise unlabelled Annotation
Engine root. Existing host attributes are never overwritten. Core removes only
attributes it added and only when their values have not subsequently changed.

With focus inside that root and outside an editable control:

| Key | Core behavior |
|---|---|
| `ArrowLeft/Right/Up/Down` | Move every selected, movable annotation by `nudgeStep` page units. |
| `Shift` + arrow | Move by `acceleratedNudgeStep` page units. |
| `Delete` / `Backspace` | Delete the permission-allowed current selection. |
| `Escape` | Cancel the active drawing gesture first; otherwise return to Select and clear selection. |
| `Backspace` during Polygon/Polyline/Cloud creation | Remove the latest usable vertex. |
| `Alt` / `Meta` while held | Temporarily reveal annotation author/reference Tags. |

Defaults are one page unit and ten accelerated page units. Steps must be finite,
positive, and no greater than 1,000. Movement is clamped to the page and commits
through canonical permission, transform, repository, renderer, print, and export
paths. Editable inputs are excluded so text editing keeps native key behavior.

Canvas annotation clicks select the annotation and focus the Core root without
scrolling. A product sidebar should call `setSelection(..., 'sidebar')` and keep
its own focus; it must not move focus into the Canvas merely because selection
state changed.

## Screen-reader representation

Konva Canvas pixels do not expose useful document semantics. Every attached page
therefore receives a Core-owned `role="group"` and one native button per
annotation. Buttons expose a concise label and `aria-pressed` selection state.
They remain stable during updates so keyboard focus is not lost. The focused
button becomes visibly rendered over the page; unfocused buttons remain
visually hidden without intercepting pointer input.

Use `accessibility.rootLabel`, `pageLabel`, and `annotationLabel` to localize
these direct-document semantics. Core defaults remain usable when callbacks are
omitted. Product controls are outside this option: adapters label their own
toolbar buttons, comment panels, search results, dialogs, and menu items.

Core uses `role="region"`, not `role="application"`, so screen readers retain
their normal document-navigation commands.

## FreeText and Note focus

The default browser `TextInputProvider` opens a labelled textarea in the
attached page overlay and focuses it. Existing text is selected for editing.
`Control/Meta+Enter` submits and `Escape` cancels; both restore focus to the
Annotation Engine root without scrolling. Blur submits while preserving the
newly chosen focus target, and engine destruction cancels without stealing
focus.

Replacement providers receive `returnFocusTo` in `TextInputRequest`. They should
follow the same submit/cancel/blur distinction even when their visual editor is
implemented with React or Vue.

## TextLayer contextual menu handoff

Core owns PDF.js TextLayer rendering, native Range normalization, and retained
selection geometry. `PdfActiveTextSelection.source` is either `pointer` or
`keyboard`:

- pointer selection: show the contextual product menu without moving focus;
- keyboard selection: show the menu and move focus to its first action;
- arrow keys inside the menu: the adapter may implement roving focus;
- action or `Escape`: call `clearTextSelection()` and restore the prior
  document focus target.

The Vanilla application is the executable reference. Core does not render the
contextual toolbar because its actions, copy, localization, and layout belong to
the product.

## Reduced motion

Core CSS removes effective transition/animation duration and forces automatic
scroll behavior below `.inklayer-engine` when
`prefers-reduced-motion: reduce` matches. PageFlow also coerces requested smooth
navigation to `auto`, because an inline `scrollIntoView({ behavior: 'smooth' })`
cannot be reliably overridden by CSS alone. Pointer and keyboard state changes
remain immediate and do not depend on animation completion.

## Adapter acceptance checklist

- Import `@inklayer-dev/core/style` so focus indicators are present.
- Give every product control an accessible localized name.
- Preserve Core focus for Canvas-origin selection and product focus for
  sidebar-origin selection.
- Implement the keyboard TextLayer-menu handoff using `selection.source`.
- Make custom `TextInputProvider` implementations restore focus on explicit
  submit/cancel but not on blur or teardown.
- Do not apply a second Delete/Escape/arrow handler when the event already
  belongs to the Core root.
- Test at least one keyboard-only annotation create/select/move/delete path,
  one FreeText submit/cancel path, and reduced-motion page navigation.
