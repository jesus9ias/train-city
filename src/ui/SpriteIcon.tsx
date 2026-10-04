import { useEffect, useState, type ReactNode } from 'react';
import { loadAtlasFrames, type AtlasFrames } from './atlasFrames';

const SIZE = 20;

type Props = {
  readonly atlas: string;
  readonly frame: string;
  /** Clockwise rotation in degrees (multiples of 90 keep pixels crisp). */
  readonly rotation?: number;
  /** Shown until the atlas is loaded, or when the frame does not exist. */
  readonly fallback: ReactNode;
};

/** An atlas frame shown at native resolution (scaled down to fit when larger than a cell). */
export function SpriteIcon({ atlas, frame, rotation = 0, fallback }: Props) {
  const [frames, setFrames] = useState<AtlasFrames | null>(null);
  useEffect(() => {
    let live = true;
    void loadAtlasFrames(atlas).then((loaded) => {
      if (live) setFrames(loaded);
    });
    return () => {
      live = false;
    };
  }, [atlas]);

  const rect = frames?.frames.get(frame);
  if (!frames || !rect) return <>{fallback}</>;
  const scale = SIZE / Math.max(rect.w, rect.h);
  return (
    <span
      className="sprite sprite-icon"
      aria-hidden="true"
      data-testid={`sprite-${frame}`}
      style={{
        width: rect.w * scale,
        height: rect.h * scale,
        backgroundImage: `url(${frames.url})`,
        backgroundSize: `${frames.size.w * scale}px ${frames.size.h * scale}px`,
        backgroundPosition: `${-rect.x * scale}px ${-rect.y * scale}px`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
      }}
    />
  );
}
