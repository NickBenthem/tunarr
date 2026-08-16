import { KnownFfmpegFilters } from '@/ffmpeg/builder/options/KnownFfmpegOptions.js';
import pino from 'pino';
import { FfmpegInfo } from '../../ffmpeg/ffmpegInfo.ts';
import type { Logger } from '../../util/logging/LoggerFactory.ts';
import {
  discoverFfmpegBinaries,
  discoverNvidiaCapabilities,
  discoverQsvCapabilities,
  discoverVaapiDevice,
  discoverVaapiOpenclSupport,
} from './FfmpegIntegrationHelper.ts';

export const binaries = discoverFfmpegBinaries();

export const vaapiInfo = discoverVaapiDevice();

export const qsvInfo = binaries
  ? discoverQsvCapabilities(binaries.ffmpeg)
  : null;

export const nvidiaCaps = binaries
  ? discoverNvidiaCapabilities(binaries.ffmpeg)
  : null;

export const vaapiOpenclSupported =
  binaries && vaapiInfo
    ? discoverVaapiOpenclSupport(binaries.ffmpeg, vaapiInfo.device)
    : false;

const noopLogger = pino({ level: 'silent' }) as Logger;

export function makeFfmpegInfo(): FfmpegInfo {
  if (!binaries) {
    throw new Error('No ffmpeg binaries were discovered');
  }
  // Instantiate directly, ignoring Inversify DI bindings
  return new FfmpegInfo(binaries.ffmpeg, binaries.ffprobe, noopLogger);
}

// Filter availability is a property of the ffmpeg build, not of the device, so
// a suite needing a specific hardware filter has to check both. FfmpegInfo
// caches by binary path, so the binaryCapabilities fixture reuses this result.
const binaryFilters = binaries
  ? (await makeFfmpegInfo().getCapabilities()).allFilters()
  : new Set<string>();

export const overlayVaapiSupported =
  vaapiInfo !== null && binaryFilters.has(KnownFfmpegFilters.OverlayVaapi);

/**
 * Everything the integration suites gate on, so a run can report which of them
 * this machine is actually able to execute.
 */
export const hardwareSupport = {
  ffmpeg: binaries?.ffmpeg ?? null,
  ffprobe: binaries?.ffprobe ?? null,
  vaapiDevice: vaapiInfo?.device ?? null,
  overlayVaapi: overlayVaapiSupported,
  vaapiOpencl: vaapiOpenclSupported,
  qsvDevice: qsvInfo?.device ?? null,
  nvidia: nvidiaCaps !== null,
} as const;

function formatRow(label: string, value: string): string {
  return `  ${label.padEnd(18)}${value}`;
}

/**
 * Human-readable summary of what this machine can run, printed once per
 * integration run. Without it, a machine missing a device is indistinguishable
 * from one that ran the suites and passed.
 */
export function formatHardwareSupport(): string {
  const lines = [
    'FFmpeg integration hardware',
    formatRow('ffmpeg', hardwareSupport.ffmpeg ?? 'not found'),
    formatRow('ffprobe', hardwareSupport.ffprobe ?? 'not found'),
    formatRow('VAAPI device', hardwareSupport.vaapiDevice ?? 'not detected'),
    formatRow(
      'overlay_vaapi',
      hardwareSupport.overlayVaapi ? 'available' : 'unavailable',
    ),
    formatRow(
      'VAAPI + OpenCL',
      hardwareSupport.vaapiOpencl ? 'available' : 'unavailable',
    ),
    formatRow('QSV device', hardwareSupport.qsvDevice ?? 'not detected'),
    formatRow('NVIDIA', hardwareSupport.nvidia ? 'detected' : 'not detected'),
  ];

  const skipped: string[] = [];
  if (!hardwareSupport.ffmpeg || !hardwareSupport.ffprobe) {
    skipped.push('every integration suite (no ffmpeg/ffprobe on PATH)');
  } else {
    if (!hardwareSupport.vaapiDevice) {
      skipped.push('VAAPI suites (no VAAPI device)');
    } else if (!hardwareSupport.overlayVaapi) {
      skipped.push('VAAPI watermark overlay suite (ffmpeg lacks overlay_vaapi)');
    }
    if (!hardwareSupport.qsvDevice) {
      skipped.push('QSV suites (no QSV device)');
    }
    if (!hardwareSupport.nvidia) {
      skipped.push('NVIDIA suites (no NVIDIA GPU)');
    }
  }

  lines.push(
    '',
    skipped.length === 0
      ? '  All hardware suites will run.'
      : `  Skipping: ${skipped.join(', ')}`,
    '',
  );

  return lines.join('\n');
}
