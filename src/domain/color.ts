/**
 * @file Shared annotation color normalization.
 * @description Converts the supported CSS color subset into normalized RGB
 * channels for format exporters without depending on a browser canvas.
 */

/** Normalized red, green, and blue channels in the inclusive zero-to-one range. */
export type NormalizedRgb = readonly [number, number, number]

/** Parses supported hexadecimal and rgb() colors into normalized channels. */
export function parseAnnotationColor(value: string | null | undefined): NormalizedRgb {
  if (value === undefined || value === null || value.trim() === '') return [1, 0, 0]
  const color = value.trim().toLowerCase()
  const shortHex = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(color)
  if (shortHex !== null) {
    return normalizeRgb(
      Number.parseInt(`${shortHex[1]}${shortHex[1]}`, 16),
      Number.parseInt(`${shortHex[2]}${shortHex[2]}`, 16),
      Number.parseInt(`${shortHex[3]}${shortHex[3]}`, 16)
    )
  }
  const longHex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color)
  if (longHex !== null) {
    return normalizeRgb(
      Number.parseInt(longHex[1] ?? '', 16),
      Number.parseInt(longHex[2] ?? '', 16),
      Number.parseInt(longHex[3] ?? '', 16)
    )
  }
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(color)
  if (rgb !== null) {
    const channels = [rgb[1], rgb[2], rgb[3]].map((channel) => Number(channel))
    if (channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
      return normalizeRgb(channels[0] ?? 0, channels[1] ?? 0, channels[2] ?? 0)
    }
  }
  throw new RangeError('Annotation color must be #rgb, #rrggbb, or rgb(r,g,b).')
}

/** Converts byte RGB channels to normalized PDF channels. */
function normalizeRgb(red: number, green: number, blue: number): NormalizedRgb {
  return [red / 255, green / 255, blue / 255]
}
