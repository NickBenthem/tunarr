import { FilterOption } from '@/ffmpeg/builder/filter/FilterOption.js';

// overlay_qsv ignores eof_action=pass and truncates the output when its
// secondary input ends, so a finite watermark turns transparent in place.
export class WatermarkHideAfterFilter extends FilterOption {
  constructor(private durationSeconds: number) {
    super();
  }

  get filter() {
    // aa=0 zeroes the alpha-to-alpha coefficient, so every pixel becomes fully
    // transparent; enable= bypasses the filter until the duration has elapsed.
    return `colorchannelmixer=aa=0:enable='gte(t,${this.durationSeconds})'`;
  }
}
