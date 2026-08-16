import { FilterOption } from '@/ffmpeg/builder/filter/FilterOption.js';

/**
 * Shrinks a watermark, preserving its aspect ratio, until it fits the area its
 * margins leave inside the frame.
 *
 * A hardware overlay rejects a watermark that extends past the destination
 * surface and fails the whole stream, where the software overlay clips it. The
 * scaled height is not knowable when the pipeline is built — the watermark's
 * configured width is a percentage and its height is left for ffmpeg to derive
 * from the source image — so the bound has to be carried in the filter graph
 * rather than checked up front.
 */
export class WatermarkBoundsFilter extends FilterOption {
  constructor(
    private availableWidth: number,
    private availableHeight: number,
  ) {
    super();
  }

  get filter() {
    // min() keeps this a no-op for a watermark that already fits, so only an
    // oversized one is resized.
    return (
      `scale=w='min(iw,${this.availableWidth})':h='min(ih,${this.availableHeight})'` +
      `:force_original_aspect_ratio=decrease:force_divisible_by=2`
    );
  }
}
