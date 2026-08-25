import { FilterOption } from '@/ffmpeg/builder/filter/FilterOption.js';

/**
 * Rebases a watermark input onto the main video's timeline.
 *
 * Text subtitle burn-in adds `-copyts`, so a stream joined mid-program carries
 * source timestamps starting at the seek offset. A watermark input starts at
 * zero regardless, and `overlay` pairs its two inputs by presentation
 * timestamp, so without this the two never line up.
 */
export class WatermarkTimelineOffsetFilter extends FilterOption {
  constructor(private startSeconds: number) {
    super();
  }

  get filter() {
    return `setpts=PTS-STARTPTS+${this.startSeconds}/TB`;
  }
}
