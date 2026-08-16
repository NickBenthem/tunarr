import { OverlayWatermarkFilter } from '@/ffmpeg/builder/filter/watermark/OverlayWatermarkFilter.js';
import { PixelFormatUnknown } from '@/ffmpeg/builder/format/PixelFormat.js';
import type { FrameState } from '@/ffmpeg/builder/state/FrameState.js';
import type { FrameSize } from '@/ffmpeg/builder/types.js';
import { FrameDataLocation } from '@/ffmpeg/builder/types.js';
import type { Watermark } from '@tunarr/types';

export class OverlayWatermarkQsvFilter extends OverlayWatermarkFilter {
  constructor(watermark: Watermark, resolution: FrameSize) {
    super(watermark, resolution, resolution, PixelFormatUnknown());
  }

  nextState(currentState: FrameState): FrameState {
    return currentState.updateFrameLocation(FrameDataLocation.Hardware);
  }

  public get filter() {
    // The watermark input never ends, so shortest=1 bounds the output by the
    // main input; without it encoding runs past the end of the video.
    return `overlay_qsv=${this.getPosition()}:shortest=1`;
  }
}
