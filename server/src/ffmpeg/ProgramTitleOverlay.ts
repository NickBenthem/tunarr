import type { StreamLineupProgram } from '@/db/derived_types/StreamLineup.js';
import { globalOptions } from '@/globals.js';
import { VideoStream } from '@/ffmpeg/builder/MediaStream.js';
import { ColorFormat } from '@/ffmpeg/builder/format/ColorFormat.js';
import { PixelFormatUnknown } from '@/ffmpeg/builder/format/PixelFormat.js';
import { WatermarkInputSource } from '@/ffmpeg/builder/input/WatermarkInputSource.js';
import { LavfiInputOption } from '@/ffmpeg/builder/options/input/LavfiInputOption.js';
import { FrameSize } from '@/ffmpeg/builder/types.js';
import { FilterStreamSource } from '@/stream/types.js';
import { isNonEmptyString } from '@/util/index.js';
import {
  DefaultProgramTitleTemplate,
  programTitleLineCount,
  programTitleOverlayHeight,
  renderProgramTitleTemplate,
  ProgramTitleOverlayFontSize,
  ProgramTitleOverlayWidth,
  type ProgramTitleTemplateToken,
} from '@tunarr/shared/util';
import type { Watermark } from '@tunarr/types';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const ProgramTitleOverlayCacheFolder = 'program-title-overlays';

export function programTitleOverlaySize(lineCount: number): FrameSize {
  return FrameSize.create({
    width: ProgramTitleOverlayWidth,
    height: programTitleOverlayHeight(lineCount),
  });
}

function episodeNumberLabel(
  seasonNumber: number | null | undefined,
  episodeNumber: number | null | undefined,
): string | undefined {
  const season =
    typeof seasonNumber === 'number' && Number.isInteger(seasonNumber)
      ? `S${seasonNumber.toString().padStart(2, '0')}`
      : '';
  const episode =
    typeof episodeNumber === 'number' && Number.isInteger(episodeNumber)
      ? `E${episodeNumber.toString().padStart(2, '0')}`
      : '';
  const label = `${season}${episode}`;
  return label.length > 0 ? label : undefined;
}

function seasonNumberLabel(
  seasonNumber: number | null | undefined,
): string | undefined {
  return typeof seasonNumber === 'number' && Number.isInteger(seasonNumber)
    ? `S${seasonNumber.toString().padStart(2, '0')}`
    : undefined;
}

function episodeIndexLabel(
  episodeNumber: number | null | undefined,
): string | undefined {
  return typeof episodeNumber === 'number' && Number.isInteger(episodeNumber)
    ? `E${episodeNumber.toString().padStart(2, '0')}`
    : undefined;
}

export function formatProgramTitle(
  program: StreamLineupProgram,
  template?: string,
): string | undefined {
  const seasonNumber = program.season?.index ?? program.seasonNumber;
  const values: Record<ProgramTitleTemplateToken, string> = {
    album: program.album?.title ?? program.albumName ?? '',
    artist: program.artist?.title ?? program.artistName ?? '',
    episode: episodeIndexLabel(program.episode) ?? '',
    season: seasonNumberLabel(seasonNumber) ?? '',
    seasonEpisode: episodeNumberLabel(seasonNumber, program.episode) ?? '',
    show: program.show?.title ?? program.showTitle ?? '',
    title: program.title ?? '',
  };

  if (isNonEmptyString(template)) {
    const rendered = renderProgramTitleTemplate(template, values);
    if (isNonEmptyString(rendered)) {
      return rendered;
    }
  }

  // No template, or one whose tokens are all empty for this program.
  const rendered = renderProgramTitleTemplate(
    DefaultProgramTitleTemplate,
    values,
  );
  return isNonEmptyString(rendered) ? rendered : undefined;
}

export function escapeDrawtextFilePath(filePath: string): string {
  return filePath
    .replaceAll('\\', '/')
    .replaceAll("'", "\\'")
    .replaceAll(':', '\\:')
    .replaceAll(',', '\\,')
    .replaceAll(';', '\\;')
    .replaceAll('[', '\\[')
    .replaceAll(']', '\\]');
}

export function programTitleLavfiSource(
  textFilePath: string,
  size: FrameSize = programTitleOverlaySize(1),
): string {
  const escapedPath = escapeDrawtextFilePath(textFilePath);
  return [
    `color=c=black@0.0:s=${size.width}x${size.height}`,
    'format=rgba',
    `drawtext=textfile='${escapedPath}':expansion=none:fontsize=${ProgramTitleOverlayFontSize}:fontcolor=white:borderw=3:bordercolor=black:x=8:y=(h-text_h)/2`,
  ].join(',');
}

async function cacheProgramTitleText(
  title: string,
  databaseDirectory: string,
): Promise<string> {
  const cacheDirectory = path.join(
    databaseDirectory,
    'cache',
    ProgramTitleOverlayCacheFolder,
  );
  const cacheKey = createHash('sha256').update(title).digest('hex');
  const titleFilePath = path.join(cacheDirectory, `${cacheKey}.txt`);

  await fs.mkdir(cacheDirectory, { recursive: true });
  await fs.writeFile(titleFilePath, title, 'utf8');
  return titleFilePath;
}

export async function createProgramTitleOverlayInput(
  program: StreamLineupProgram,
  watermark: Watermark,
  databaseDirectory = globalOptions().databaseDirectory,
): Promise<WatermarkInputSource | undefined> {
  const title = formatProgramTitle(program, watermark.programTitleTemplate);
  if (!title) {
    return;
  }

  const titleFilePath = await cacheProgramTitleText(title, databaseDirectory);
  const overlaySize = programTitleOverlaySize(programTitleLineCount(title));
  const stream = VideoStream.create({
    codec: 'generated',
    colorFormat: ColorFormat.unknown,
    displayAspectRatio: `${overlaySize.width}:${overlaySize.height}`,
    frameSize: overlaySize,
    index: 0,
    inputKind: 'filter',
    pixelFormat: PixelFormatUnknown(),
    providedSampleAspectRatio: '1:1',
  });
  const input = new WatermarkInputSource(
    new FilterStreamSource(programTitleLavfiSource(titleFilePath, overlaySize)),
    stream,
    { ...watermark, animated: false },
  );
  input.addOption(new LavfiInputOption());
  return input;
}
