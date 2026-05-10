/**
 * Collaboration Hall — Pixel Avatar Component
 *
 * Renders a deterministic pixel-art avatar based on participantId and role.
 */
import { useMemo } from 'react';
import { getPixelAvatarDataUrl } from '../utils/pixel-avatar';

interface PixelAvatarProps {
  participantId: string;
  role?: string;
  size?: number;
  className?: string;
}

export function PixelAvatar({ participantId, role, size = 32, className }: PixelAvatarProps) {
  const dataUrl = useMemo(
    () => getPixelAvatarDataUrl(participantId, role, size <= 24 ? 'sm' : size >= 40 ? 'lg' : 'md'),
    [participantId, role, size],
  );

  return (
    <img
      src={dataUrl}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: 'auto' }}
    />
  );
}
