/**
 * @file Build-only engine style entry.
 * @description Ensures the public instance-scoped CSS asset is emitted by the
 * library build; consumers import `@inklayer-dev/core/style` rather than this module.
 */

import './styles/engine.css'

/** Version of the public CSS variable and selector contract. */
export const ENGINE_STYLE_VERSION = 1
