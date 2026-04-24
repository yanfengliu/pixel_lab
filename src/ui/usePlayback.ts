import { useEffect, useState } from 'react';
import type { Animation } from '../core/types';

export interface PlaybackController {
  playing: boolean;
  setPlaying: (p: boolean) => void;
  frameIdx: number;
  setFrameIdx: (i: number) => void;
}

/**
 * Animation playback driver shared by `PreviewBar` and `FramesStrip`.
 * Returns the current frame index plus a play/pause toggle. Decouples
 * timing from any one component so multiple consumers can share one
 * source-of-truth driver if needed.
 *
 * `framesLength` is passed instead of the full frames array so the
 * effect dep list stays stable across object identity changes.
 */
export function useAnimationPlayback(
  animation: Animation | undefined,
  framesLength: number,
): PlaybackController {
  const [playing, setPlaying] = useState(true);
  const [frameIdx, setFrameIdx] = useState(0);

  useEffect(() => {
    setFrameIdx(0);
  }, [animation?.id]);

  useEffect(() => {
    if (!playing || framesLength === 0 || !animation) return;
    const nextDelayMs = computeFrameDelay(animation, frameIdx);
    const timer = setTimeout(() => {
      setFrameIdx((i) => {
        const nxt = i + 1;
        if (nxt >= framesLength) return animation.loop ? 0 : i;
        return nxt;
      });
    }, nextDelayMs);
    return () => clearTimeout(timer);
  }, [playing, frameIdx, framesLength, animation]);

  return { playing, setPlaying, frameIdx, setFrameIdx };
}

export function computeFrameDelay(anim: Animation, i: number): number {
  if (anim.fps === 'per-frame') {
    return anim.frames[i]?.durationMs ?? 100;
  }
  return Math.max(10, Math.floor(1000 / anim.fps));
}
