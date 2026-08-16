import type { Watermark } from '@tunarr/types';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import path from 'node:path';
import type { FfmpegVersionResult } from '../../../../ffmpeg/ffmpegInfo.ts';
import { FileStreamSource } from '../../../../stream/types.ts';
import {
  averageLumaAt,
  createTempWorkdir,
  probeFile,
  runFfmpegWithPipeline,
} from '../../../../testing/ffmpeg/FfmpegIntegrationHelper.ts';
import {
  binaries,
  deriveVideoStreamForFixture,
  Fixtures,
  qsvInfo,
  qsvTest,
} from '../../../../testing/ffmpeg/FfmpegTestFixtures.ts';
import type { FfmpegCapabilities } from '../../capabilities/FfmpegCapabilities.ts';
import type { QsvHardwareCapabilities } from '../../capabilities/QsvHardwareCapabilities.ts';
import {
  AudioFormats,
  FileOutputLocation,
  VideoFormats,
} from '../../constants.ts';
import {
  PixelFormatYuv420P,
  PixelFormatYuv420P10Le,
} from '../../format/PixelFormat.ts';
import {
  AudioInputFilterSource,
  AudioInputSource,
} from '../../input/AudioInputSource.ts';
import { LavfiVideoInputSource } from '../../input/LavfiVideoInputSource.ts';
import { VideoInputSource } from '../../input/VideoInputSource.ts';
import { WatermarkInputSource } from '../../input/WatermarkInputSource.ts';
import {
  AudioStream,
  StillImageStream,
  VideoStream,
} from '../../MediaStream.ts';
import { AudioState } from '../../state/AudioState.ts';
import {
  DefaultPipelineOptions,
  FfmpegState,
} from '../../state/FfmpegState.ts';
import { FrameState } from '../../state/FrameState.ts';
import { FrameSize } from '../../types.ts';
import { QsvPipelineBuilder } from './QsvPipelineBuilder.ts';

dayjs.extend(duration);

// Limit output to 1 second in all integration tests to keep runs fast
const testDuration = dayjs.duration(1, 'second');

function makeH264VideoInput(inputPath: string, frameSize: FrameSize) {
  return VideoInputSource.withStream(
    new FileStreamSource(inputPath),
    VideoStream.create({
      codec: 'h264',
      displayAspectRatio: '16:9',
      frameSize,
      index: 0,
      pixelFormat: new PixelFormatYuv420P(),
      providedSampleAspectRatio: null,
      colorFormat: null,
    }),
  );
}

function makeHevc10BitVideoInput(inputPath: string, frameSize: FrameSize) {
  return VideoInputSource.withStream(
    new FileStreamSource(inputPath),
    VideoStream.create({
      codec: VideoFormats.Hevc,
      displayAspectRatio: '16:9',
      frameSize,
      index: 0,
      pixelFormat: new PixelFormatYuv420P10Le(),
      providedSampleAspectRatio: null,
      colorFormat: null,
    }),
  );
}

function make43VideoInput(inputPath: string) {
  return VideoInputSource.withStream(
    new FileStreamSource(inputPath),
    VideoStream.create({
      codec: 'h264',
      profile: 'main',
      displayAspectRatio: '4:3',
      frameSize: FrameSize.withDimensions(640, 480),
      index: 0,
      pixelFormat: new PixelFormatYuv420P(),
      providedSampleAspectRatio: null,
      colorFormat: null,
    }),
  );
}

function makeAudioInput(inputPath: string) {
  return AudioInputSource.withStream(
    new FileStreamSource(inputPath),
    AudioStream.create({ channels: 2, codec: 'aac', index: 1 }),
    AudioState.create({
      audioEncoder: AudioFormats.Aac,
      audioChannels: 2,
      audioBitrate: 192,
      audioBufferSize: 384,
    }),
  );
}

function makeWatermark(
  overrides: Partial<Watermark> = {},
  color: 'white' | 'black' = 'white',
) {
  return new WatermarkInputSource(
    new FileStreamSource(
      color === 'white' ? Fixtures.watermark : Fixtures.blackWatermark,
    ),
    StillImageStream.create({
      frameSize: FrameSize.withDimensions(100, 100),
      index: 0,
    }),
    {
      enabled: true,
      position: 'bottom-right',
      width: 10,
      verticalMargin: 5,
      horizontalMargin: 5,
      duration: 0,
      opacity: 100,
      ...overrides,
    },
  );
}

describe.skipIf(!binaries || !qsvInfo)('QsvPipelineBuilder integration', () => {
  let workdir: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ dir: workdir, cleanup } = await createTempWorkdir());
  });

  afterAll(() => cleanup());

  // QsvPipelineBuilder arg order: hardwareCaps, binaryCaps, video, audio, concat, watermark, subtitle
  qsvTest(
    'basic h264 qsv transcode',
    async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
      const video = makeH264VideoInput(
        Fixtures.video720p,
        FrameSize.withDimensions(1280, 720),
      );
      const audio = makeAudioInput(Fixtures.video720p);

      const builder = new QsvPipelineBuilder(
        resolvedQsv.capabilities,
        binaryCapabilities,
        video,
        audio,
        null,
        null,
        null,
      );

      const frameState = new FrameState({
        isAnamorphic: false,
        scaledSize: FrameSize.withDimensions(1280, 720),
        paddedSize: FrameSize.withDimensions(1280, 720),
      });

      const outputPath = path.join(workdir, 'qsv_transcode.ts');
      const pipeline = builder.build(
        FfmpegState.create({
          version: ffmpegVersion,
          outputLocation: FileOutputLocation(outputPath, true),
          vaapiDevice: resolvedQsv.device,
        }),
        frameState,
        DefaultPipelineOptions,
      );

      const { exitCode, stderr } = runFfmpegWithPipeline(
        binaries!.ffmpeg,
        pipeline.getCommandArgs(),
      );

      expect(
        exitCode,
        `Pipeline command failed: ${pipeline.getCommandArgs().join(' ')}\n${stderr}`,
      ).toBe(0);

      const probe = probeFile(binaries!.ffprobe, outputPath);
      expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
    },
  );

  qsvTest(
    'scale from 1080p to 720p via qsv',
    async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
      const video = makeH264VideoInput(
        Fixtures.video1080p,
        FrameSize.withDimensions(1920, 1080),
      );
      const audio = makeAudioInput(Fixtures.video1080p);

      const builder = new QsvPipelineBuilder(
        resolvedQsv.capabilities,
        binaryCapabilities,
        video,
        audio,
        null,
        null,
        null,
      );

      const frameState = new FrameState({
        isAnamorphic: false,
        scaledSize: FrameSize.withDimensions(1280, 720),
        paddedSize: FrameSize.withDimensions(1280, 720),
      });

      const outputPath = path.join(workdir, 'qsv_scale.ts');
      const pipeline = builder.build(
        FfmpegState.create({
          version: ffmpegVersion,
          outputLocation: FileOutputLocation(outputPath, true),
          vaapiDevice: resolvedQsv.device,
        }),
        frameState,
        DefaultPipelineOptions,
      );

      const { exitCode, stderr } = runFfmpegWithPipeline(
        binaries!.ffmpeg,
        pipeline.getCommandArgs(),
      );

      expect(
        exitCode,
        `Pipeline command failed: ${pipeline.getCommandArgs().join(' ')}\n${stderr}`,
      ).toBe(0);

      const probe = probeFile(binaries!.ffprobe, outputPath);
      expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
    },
  );

  qsvTest(
    'copy mode (qsv pipeline, no hw transcode needed)',
    async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
      const video = makeH264VideoInput(
        Fixtures.video720p,
        FrameSize.withDimensions(1280, 720),
      );
      const audio = makeAudioInput(Fixtures.video720p);

      const builder = new QsvPipelineBuilder(
        resolvedQsv.capabilities,
        binaryCapabilities,
        video,
        audio,
        null,
        null,
        null,
      );

      const frameState = new FrameState({
        isAnamorphic: false,
        scaledSize: FrameSize.withDimensions(1280, 720),
        paddedSize: FrameSize.withDimensions(1280, 720),
        videoFormat: 'copy',
      });

      const outputPath = path.join(workdir, 'qsv_copy.ts');
      const pipeline = builder.build(
        FfmpegState.create({
          version: ffmpegVersion,
          outputLocation: FileOutputLocation(outputPath, true),
          vaapiDevice: resolvedQsv.device,
        }),
        frameState,
        DefaultPipelineOptions,
      );

      const { exitCode, stderr } = runFfmpegWithPipeline(
        binaries!.ffmpeg,
        pipeline.getCommandArgs(),
      );

      expect(
        exitCode,
        `Pipeline command failed: ${pipeline.getCommandArgs().join(' ')}\n${stderr}`,
      ).toBe(0);

      const probe = probeFile(binaries!.ffprobe, outputPath);
      expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
    },
  );

  describe('pixel format fixes', () => {
    let workdir: string;
    let cleanup: () => Promise<void>;

    beforeAll(async () => {
      ({ dir: workdir, cleanup } = await createTempWorkdir());
    });

    afterAll(() => cleanup());

    // Bug 3: after watermark overlay frames are in software (yuv420p); without
    // the fix, bare hwupload would fail format negotiation.
    qsvTest(
      'QSV transcode with watermark (Bug 3: format=nv12 before hwupload)',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const video = makeH264VideoInput(
          Fixtures.video720p,
          FrameSize.withDimensions(1280, 720),
        );
        const audio = makeAudioInput(Fixtures.video720p);
        const watermark = makeWatermark({}, 'black');

        const builder = new QsvPipelineBuilder(
          resolvedQsv.capabilities,
          binaryCapabilities,
          video,
          audio,
          null,
          watermark,
          null,
        );

        const frameState = new FrameState({
          isAnamorphic: false,
          scaledSize: FrameSize.withDimensions(1280, 720),
          paddedSize: FrameSize.withDimensions(1280, 720),
        });

        const outputPath = path.join(workdir, 'qsv_watermark.ts');
        const pipeline = builder.build(
          FfmpegState.create({
            duration: testDuration,
            version: ffmpegVersion,
            outputLocation: FileOutputLocation(outputPath, true),
            vaapiDevice: resolvedQsv.device,
          }),
          frameState,
          DefaultPipelineOptions,
        );

        const { exitCode, stderr } = runFfmpegWithPipeline(
          binaries!.ffmpeg,
          pipeline.getCommandArgs(),
        );

        expect(
          exitCode,
          `Pipeline command failed: ${pipeline.getCommandArgs().join(' ')}\n${stderr}`,
        ).toBe(0);

        const probe = probeFile(binaries!.ffprobe, outputPath);
        expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
      },
    );

    // Bug 3: scaling + padding + watermark path — ensures the format=nv12,hwupload
    // sequence is correct even when scale_qsv and pad filters also run.
    qsvTest(
      'QSV transcode with scaling + padding + watermark (Bug 3)',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const video = makeH264VideoInput(
          Fixtures.video1080p,
          FrameSize.withDimensions(1920, 1080),
        );
        const audio = makeAudioInput(Fixtures.video1080p);
        const watermark = makeWatermark();

        const builder = new QsvPipelineBuilder(
          resolvedQsv.capabilities,
          binaryCapabilities,
          video,
          audio,
          null,
          watermark,
          null,
        );

        const frameState = new FrameState({
          isAnamorphic: false,
          scaledSize: FrameSize.withDimensions(1280, 720),
          paddedSize: FrameSize.withDimensions(1280, 720),
        });

        const outputPath = path.join(workdir, 'qsv_scale_watermark.ts');
        const pipeline = builder.build(
          FfmpegState.create({
            duration: testDuration,
            version: ffmpegVersion,
            outputLocation: FileOutputLocation(outputPath, true),
            vaapiDevice: resolvedQsv.device,
          }),
          frameState,
          DefaultPipelineOptions,
        );

        const { exitCode, stderr } = runFfmpegWithPipeline(
          binaries!.ffmpeg,
          pipeline.getCommandArgs(),
        );

        expect(
          exitCode,
          `Pipeline command failed: ${pipeline.getCommandArgs().join(' ')}\n${stderr}`,
        ).toBe(0);

        const probe = probeFile(binaries!.ffprobe, outputPath);
        expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
      },
    );

    // Bug 3: anamorphic (4:3) source forces scale + pillarbox pad + overlay +
    // hwupload chain — the deepest exercise of the fix.
    qsvTest(
      'QSV transcode of anamorphic content with watermark (Bug 3)',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const video = make43VideoInput(Fixtures.video480p43);
        const audio = makeAudioInput(Fixtures.video480p43);
        const watermark = makeWatermark();

        const builder = new QsvPipelineBuilder(
          resolvedQsv.capabilities,
          binaryCapabilities,
          video,
          audio,
          null,
          watermark,
          null,
        );

        // 4:3 → squarePixelFrameSize gives 1440x1080, padded to 1920x1080
        const frameState = new FrameState({
          isAnamorphic: false,
          scaledSize: video.streams[0]!.squarePixelFrameSize(FrameSize.FHD),
          paddedSize: FrameSize.FHD,
        });

        const outputPath = path.join(workdir, 'qsv_anamorphic_watermark.ts');
        const pipeline = builder.build(
          FfmpegState.create({
            duration: testDuration,
            version: ffmpegVersion,
            outputLocation: FileOutputLocation(outputPath, true),
            vaapiDevice: resolvedQsv.device,
          }),
          frameState,
          DefaultPipelineOptions,
        );

        const { exitCode, stderr } = runFfmpegWithPipeline(
          binaries!.ffmpeg,
          pipeline.getCommandArgs(),
        );

        expect(
          exitCode,
          `Pipeline command failed: ${pipeline.getCommandArgs().join(' ')}\n${stderr}`,
        ).toBe(0);

        const probe = probeFile(binaries!.ffprobe, outputPath);
        const videoOut = probe.streams.find((s) => s.codec_type === 'video');
        expect(videoOut).toBeDefined();
        expect(videoOut!.width).toBe(1920);
        expect(videoOut!.height).toBe(1080);
      },
    );

    // Bug 1: LavfiVideoInputSource sets PixelFormatUnknown(); without the fix
    // this produces vpp_qsv=format=unknown and ffmpeg fails.
    qsvTest(
      'error screen (LavfiVideoInputSource) does not produce format=unknown (Bug 1)',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const audioState = AudioState.create({
          audioEncoder: AudioFormats.Aac,
          audioChannels: 2,
          audioBitrate: 192,
          audioBufferSize: 384,
        });

        const builder = new QsvPipelineBuilder(
          resolvedQsv.capabilities,
          binaryCapabilities,
          LavfiVideoInputSource.errorText(FrameSize.FHD, 'Error', 'Test'),
          AudioInputFilterSource.noise(audioState),
          null,
          null,
          null,
        );

        const outputPath = path.join(workdir, 'qsv_error_screen.ts');
        const pipeline = builder.build(
          FfmpegState.create({
            duration: testDuration,
            version: ffmpegVersion,
            outputLocation: FileOutputLocation(outputPath, true),
            vaapiDevice: resolvedQsv.device,
          }),
          new FrameState({
            isAnamorphic: false,
            scaledSize: FrameSize.FHD,
            paddedSize: FrameSize.FHD,
            videoFormat: VideoFormats.H264,
            pixelFormat: new PixelFormatYuv420P(),
          }),
          DefaultPipelineOptions,
        );

        const args = pipeline.getCommandArgs();
        expect(args.join(' ')).not.toContain('format=unknown');

        const { exitCode, stderr } = runFfmpegWithPipeline(
          binaries!.ffmpeg,
          args,
        );

        expect(
          exitCode,
          `Pipeline command failed: ${args.join(' ')}\n${stderr}`,
        ).toBe(0);

        const probe = probeFile(binaries!.ffprobe, outputPath);
        expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
      },
    );

    // Bug 2: -pix_fmt yuv420p is incompatible with h264_qsv operating on hardware
    // frames; without the fix ffmpeg crashes with a swscaler error.
    qsvTest(
      'no scaling path does not emit -pix_fmt yuv420p for QSV encode (Bug 2)',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const video = makeH264VideoInput(
          Fixtures.video720p,
          FrameSize.withDimensions(1280, 720),
        );
        const audio = makeAudioInput(Fixtures.video720p);

        const builder = new QsvPipelineBuilder(
          resolvedQsv.capabilities,
          binaryCapabilities,
          video,
          audio,
          null,
          null,
          null,
        );

        const frameState = new FrameState({
          isAnamorphic: false,
          scaledSize: FrameSize.withDimensions(1280, 720),
          paddedSize: FrameSize.withDimensions(1280, 720),
          videoFormat: VideoFormats.H264,
          pixelFormat: new PixelFormatYuv420P(),
        });

        const outputPath = path.join(workdir, 'qsv_no_scale_pix_fmt.ts');
        const pipeline = builder.build(
          FfmpegState.create({
            duration: testDuration,
            version: ffmpegVersion,
            outputLocation: FileOutputLocation(outputPath, true),
            vaapiDevice: resolvedQsv.device,
          }),
          frameState,
          DefaultPipelineOptions,
        );

        const args = pipeline.getCommandArgs();
        expect(args).not.toContain('-pix_fmt');

        const { exitCode, stderr } = runFfmpegWithPipeline(
          binaries!.ffmpeg,
          args,
        );

        expect(
          exitCode,
          `Pipeline command failed: ${args.join(' ')}\n${stderr}`,
        ).toBe(0);
        expect(stderr).not.toContain('swscaler');

        const probe = probeFile(binaries!.ffprobe, outputPath);
        expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
      },
    );
  });

  qsvTest(
    'hevc decoding with setpts',
    async ({ binaryCapabilities, resolvedQsv, ffmpegVersion }) => {
      const video = await deriveVideoStreamForFixture(Fixtures.videoHevc1080p);
      const audio = makeAudioInput(Fixtures.videoHevc1080p);

      const builder = new QsvPipelineBuilder(
        resolvedQsv.capabilities,
        binaryCapabilities,
        video,
        audio,
        null,
        null,
        null,
      );

      const frameState = new FrameState({
        isAnamorphic: false,
        scaledSize: FrameSize.withDimensions(1280, 720),
        paddedSize: FrameSize.withDimensions(1280, 720),
        pixelFormat: new PixelFormatYuv420P(),
      });

      const outputPath = path.join(workdir, 'qsv_transcode.ts');
      const pipeline = builder.build(
        FfmpegState.create({
          version: ffmpegVersion,
          outputLocation: FileOutputLocation(outputPath, true),
          vaapiDevice: resolvedQsv.device,
          start: dayjs.duration({ seconds: 1 }),
        }),
        frameState,
        DefaultPipelineOptions,
      );

      const { exitCode, stderr } = runFfmpegWithPipeline(
        binaries!.ffmpeg,
        pipeline.getCommandArgs(),
      );

      expect(
        exitCode,
        `Pipeline command failed: ${pipeline.getCommandArgs().join(' ')}\n${stderr}`,
      ).toBe(0);

      const probe = probeFile(binaries!.ffprobe, outputPath);
      expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
    },
  );
});

// ─── Hardware watermark overlay ───────────────────────────────────────────────

describe.skipIf(!binaries || !qsvInfo)(
  'QsvPipelineBuilder hardware watermark overlay integration',
  () => {
    let workdir: string;
    let cleanup: () => Promise<void>;

    beforeAll(async () => {
      ({ dir: workdir, cleanup } = await createTempWorkdir());
    });

    afterAll(() => cleanup());

    const frameSize = FrameSize.withDimensions(1280, 720);

    function runWatermarkPipeline(opts: {
      binaryCapabilities: FfmpegCapabilities;
      ffmpegVersion: FfmpegVersionResult;
      resolvedQsv: { device: string; capabilities: QsvHardwareCapabilities };
      watermark: WatermarkInputSource;
      outputName: string;
      outputSeconds?: number;
    }) {
      const video = makeH264VideoInput(Fixtures.video720p, frameSize);
      const audio = makeAudioInput(Fixtures.video720p);

      const builder = new QsvPipelineBuilder(
        opts.resolvedQsv.capabilities,
        opts.binaryCapabilities,
        video,
        audio,
        null,
        opts.watermark,
        null,
      );

      const outputPath = path.join(workdir, opts.outputName);
      const pipeline = builder.build(
        FfmpegState.create({
          duration: dayjs.duration(opts.outputSeconds ?? 1, 'second'),
          version: opts.ffmpegVersion,
          outputLocation: FileOutputLocation(outputPath, true),
          vaapiDevice: opts.resolvedQsv.device,
        }),
        new FrameState({
          isAnamorphic: false,
          scaledSize: frameSize,
          paddedSize: frameSize,
        }),
        DefaultPipelineOptions,
      );

      const args = pipeline.getCommandArgs();
      const { exitCode, stderr } = runFfmpegWithPipeline(
        binaries!.ffmpeg,
        args,
      );

      expect(
        exitCode,
        `Pipeline command failed: ${args.join(' ')}\n${stderr}`,
      ).toBe(0);

      return { args: args.join(' '), outputPath };
    }

    qsvTest(
      'composites a watermark on the GPU',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const { args, outputPath } = runWatermarkPipeline({
          binaryCapabilities,
          ffmpegVersion,
          resolvedQsv,
          watermark: makeWatermark({ position: 'top-left' }),
          outputName: 'qsv_hw_overlay.ts',
        });

        expect(args).toContain('overlay_qsv');
        expect(args).not.toContain('hwdownload');

        const probe = probeFile(binaries!.ffprobe, outputPath);
        expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
      },
    );

    qsvTest(
      'composites a watermark larger than the frame',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        // A full-width square watermark is taller than a 16:9 frame. The
        // software overlay clips it; a hardware overlay handed a surface that
        // does not fit the destination fails the stream outright.
        const { args, outputPath } = runWatermarkPipeline({
          binaryCapabilities,
          ffmpegVersion,
          resolvedQsv,
          watermark: makeWatermark({ position: 'top-left', width: 100 }),
          outputName: 'qsv_hw_overlay_oversized.ts',
        });

        expect(args).toContain('overlay_qsv');

        const probe = probeFile(binaries!.ffprobe, outputPath);
        expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
      },
    );

    qsvTest(
      'stops compositing a finite watermark once its duration elapses',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const { args, outputPath } = runWatermarkPipeline({
          binaryCapabilities,
          ffmpegVersion,
          resolvedQsv,
          watermark: makeWatermark({ position: 'top-left', duration: 1 }),
          outputName: 'qsv_hw_overlay_finite.ts',
          outputSeconds: 3,
        });

        expect(args).toContain('overlay_qsv');

        // The watermark is white and covers 10% of a 1280x720 frame at 5%
        // margins; the video underneath it is near black at both timestamps.
        const region = { x: 64, y: 36, width: 128, height: 128 };
        const whileVisible = averageLumaAt(binaries!.ffmpeg, outputPath, {
          ...region,
          seconds: 0.5,
        });
        const afterExpiry = averageLumaAt(binaries!.ffmpeg, outputPath, {
          ...region,
          seconds: 2.5,
        });

        expect(whileVisible).toBeGreaterThan(200);
        expect(afterExpiry).toBeLessThan(100);
      },
    );

    qsvTest(
      'falls back to the software overlay for animated watermarks',
      async ({ binaryCapabilities, ffmpegVersion, resolvedQsv }) => {
        const { args, outputPath } = runWatermarkPipeline({
          binaryCapabilities,
          ffmpegVersion,
          resolvedQsv,
          watermark: makeWatermark({ position: 'top-left', animated: true }),
          outputName: 'qsv_sw_overlay_animated.ts',
        });

        expect(args).not.toContain('overlay_qsv');
        expect(args).toContain('overlay=');

        const probe = probeFile(binaries!.ffprobe, outputPath);
        expect(probe.streams.some((s) => s.codec_type === 'video')).toBe(true);
      },
    );
  },
);
