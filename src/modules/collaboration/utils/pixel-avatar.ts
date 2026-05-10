/**
 * Collaboration Hall — Pixel Avatar Generator
 *
 * Generates deterministic pixel-art avatars from participantId.
 * Uses a 5x5 symmetric sprite rendered as inline SVG.
 * Color scheme is derived from semanticRole.
 */

export type PixelAvatarSize = 'sm' | 'md' | 'lg';

const ROLE_COLORS: Record<string, { primary: string; secondary: string; bg: string }> = {
  planner:    { primary: '#3b82f6', secondary: '#93c5fd', bg: '#eff6ff' },
  coder:      { primary: '#10b981', secondary: '#6ee7b7', bg: '#ecfdf5' },
  reviewer:   { primary: '#f59e0b', secondary: '#fcd34d', bg: '#fffbeb' },
  manager:    { primary: '#8b5cf6', secondary: '#c4b5fd', bg: '#f5f3ff' },
  generalist: { primary: '#64748b', secondary: '#94a3b8', bg: '#f8fafc' },
};

function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Generate a 5x5 symmetric pixel sprite from a seed string.
 * Returns a 5x5 array where each cell is 0 (empty), 1 (primary), or 2 (secondary).
 */
function generateSprite(seed: string): number[][] {
  const hash = djb2Hash(seed);
  const sprite: number[][] = Array.from({ length: 5 }, () => Array(5).fill(0));

  // Generate left half (columns 0-2) including center
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      const bit = (hash >>> ((y * 3 + x) % 30)) & 1;
      if (bit) {
        const isSecondary = ((hash >>> ((y * 3 + x + 7) % 30)) & 1) === 1;
        const color = isSecondary ? 2 : 1;
        sprite[y][x] = color;
        sprite[y][4 - x] = color; // Mirror
      }
    }
  }

  // Ensure at least one primary pixel exists
  let hasPrimary = false;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (sprite[y][x] === 1) hasPrimary = true;
    }
  }
  if (!hasPrimary) {
    sprite[2][2] = 1;
    sprite[1][2] = 2;
    sprite[3][2] = 2;
  }

  return sprite;
}

/**
 * Build an SVG string for the pixel avatar.
 */
export function buildPixelAvatarSvg(
  participantId: string,
  role?: string,
  size: PixelAvatarSize = 'md',
): string {
  const colors = ROLE_COLORS[role || 'generalist'] || ROLE_COLORS.generalist;
  const sprite = generateSprite(participantId);
  const pixelSize = size === 'sm' ? 6 : size === 'md' ? 8 : 12;
  const viewBoxSize = 5 * pixelSize + 4; // padding

  const colorMap: Record<number, string> = {
    0: 'transparent',
    1: colors.primary,
    2: colors.secondary,
  };

  const rects: string[] = [];
  const offset = 2;

  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      const color = sprite[y][x];
      if (color === 0) continue;
      rects.push(
        `<rect x="${offset + x * pixelSize}" y="${offset + y * pixelSize}" width="${pixelSize}" height="${pixelSize}" rx="1" fill="${colorMap[color]}" />`,
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${viewBoxSize}" height="${viewBoxSize}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="geometricPrecision">`,
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" rx="${pixelSize}" fill="${colors.bg}" />`,
    ...rects,
    `</svg>`,
  ].join('');
}

/**
 * Get an SVG data URL for use in <img> src or CSS background.
 */
export function getPixelAvatarDataUrl(
  participantId: string,
  role?: string,
  size: PixelAvatarSize = 'md',
): string {
  const svg = buildPixelAvatarSvg(participantId, role, size);
  const encoded = encodeURIComponent(svg);
  return `data:image/svg+xml,${encoded}`;
}
