import type { StreamLineupProgram } from '@/db/derived_types/StreamLineup.js';
import { FrameSize } from '@/ffmpeg/builder/types.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createProgramTitleOverlayInput,
  escapeDrawtextFilePath,
  formatProgramTitle,
  programTitleLavfiSource,
  programTitleOverlaySize,
} from './ProgramTitleOverlay.ts';

const temporaryDirectories: string[] = [];

function makeProgram(
  overrides: Partial<StreamLineupProgram> = {},
): StreamLineupProgram {
  return {
    duration: 30_000,
    externalIds: [],
    externalKey: 'external-key',
    externalSourceId: 'external-source-id',
    mediaSourceId: 'media-source-id',
    sourceType: 'jellyfin',
    title: 'Episode title',
    type: 'episode',
    uuid: 'program-id',
    ...overrides,
  } as StreamLineupProgram;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { force: true, recursive: true })),
  );
});

describe('formatProgramTitle', () => {
  it('uses the default template when no template is configured', () => {
    const title = formatProgramTitle(
      makeProgram({
        episode: 7,
        seasonNumber: 8,
        showTitle: 'The Simpsons',
        title: "Lisa's Date with Density",
      }),
    );

    expect(title).toBe("The Simpsons · S08E07 · Lisa's Date with Density");
  });

  it('uses joined grouping metadata when it is available', () => {
    const title = formatProgramTitle(
      makeProgram({
        episode: 2,
        season: { index: 11 },
        show: { title: 'Bob’s Burgers' },
        showTitle: 'Stale show title',
        title: 'The Belchies',
      }),
    );

    expect(title).toBe('Bob’s Burgers · S11E02 · The Belchies');
  });

  it('drops tokens which have no value for the program', () => {
    expect(
      formatProgramTitle(makeProgram({ title: 'Alien', type: 'movie' })),
    ).toBe('Alien');
    expect(
      formatProgramTitle(
        makeProgram({
          albumName: 'Nevermind',
          artistName: 'Nirvana',
          title: 'In Bloom',
          type: 'track',
        }),
      ),
    ).toBe('In Bloom');
  });

  it('renders a custom template with program metadata tokens', () => {
    const title = formatProgramTitle(
      makeProgram({
        episode: 7,
        seasonNumber: 8,
        showTitle: 'The Simpsons',
        title: "Lisa's Date with Density",
      }),
      '{seasonEpisode} — {title} ({show})',
    );

    expect(title).toBe("S08E07 — Lisa's Date with Density (The Simpsons)");
  });

  it('falls back to the default template when a template renders empty', () => {
    const movie = makeProgram({ title: 'Alien', type: 'movie' });

    expect(
      formatProgramTitle(movie, '{show} · {seasonEpisode} · {title}'),
    ).toBe('Alien');
    expect(formatProgramTitle(movie, '{show}')).toBe('Alien');
  });

  it('has no title when even the default template renders empty', () => {
    expect(
      formatProgramTitle(makeProgram({ title: '', type: 'movie' })),
    ).toBeUndefined();
  });

  it('renders a multi-line template', () => {
    const program = makeProgram({
      episode: 7,
      seasonNumber: 8,
      showTitle: 'The Simpsons',
      title: "Lisa's Date with Density",
    });

    expect(
      formatProgramTitle(program, '{show}\n{seasonEpisode} · {title}'),
    ).toBe("The Simpsons\nS08E07 · Lisa's Date with Density");
    expect(formatProgramTitle(program, '{show}\\n{title}')).toBe(
      "The Simpsons\nLisa's Date with Density",
    );
  });

  it('drops lines of a multi-line template which render to nothing', () => {
    expect(
      formatProgramTitle(
        makeProgram({ title: 'Alien', type: 'movie' }),
        '{show}\n{seasonEpisode}\n{title}',
      ),
    ).toBe('Alien');
  });
});

describe('program title input', () => {
  it('escapes a textfile path for the drawtext filter', () => {
    expect(escapeDrawtextFilePath("C:\\Tunarr's,data[1];x\\title.txt")).toBe(
      "C\\:/Tunarr\\'s\\,data\\[1\\]\\;x/title.txt",
    );
  });

  it('disables drawtext expansion and keeps the canvas transparent', () => {
    const source = programTitleLavfiSource('/cache/title.txt');
    expect(source).toContain('color=c=black@0.0:s=1600x96,format=rgba');
    expect(source).toContain("textfile='/cache/title.txt':expansion=none");
  });

  it('sizes the canvas for the number of lines in the title', () => {
    expect(programTitleOverlaySize(1)).toEqual(
      FrameSize.create({ width: 1600, height: 96 }),
    );
    expect(programTitleOverlaySize(3)).toEqual(
      FrameSize.create({ width: 1600, height: 216 }),
    );
    expect(
      programTitleLavfiSource('/cache/title.txt', programTitleOverlaySize(2)),
    ).toContain('color=c=black@0.0:s=1600x156,format=rgba');
  });

  it('writes metadata to a cache file and returns a lavfi watermark input', async () => {
    const temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'tunarr-program-title-test-'),
    );
    temporaryDirectories.push(temporaryDirectory);

    const input = await createProgramTitleOverlayInput(
      makeProgram({
        episode: 7,
        seasonNumber: 8,
        showTitle: 'The Simpsons',
        title: "Lisa's Date with 100% Density",
      }),
      {
        duration: 5,
        enabled: true,
        horizontalMargin: 2,
        opacity: 100,
        position: 'bottom-left',
        programTitleTemplate: '{seasonEpisode} · {title}',
        source: 'program-title',
        verticalMargin: 6,
        width: 75,
      },
      temporaryDirectory,
    );

    expect(input).toBeDefined();
    expect(input?.source.type).toBe('filter');
    expect(input?.streams[0]?.inputKind).toBe('filter');
    expect(input?.getInputOptions()).toEqual(['-f', 'lavfi']);
    expect(input?.path).toContain('expansion=none');

    const cacheDirectory = path.join(
      temporaryDirectory,
      'cache',
      'program-title-overlays',
    );
    const files = await fs.readdir(cacheDirectory);
    expect(files).toHaveLength(1);
    const titleFile = files[0];
    if (!titleFile) {
      throw new Error('Expected a cached program title file');
    }
    expect(
      await fs.readFile(path.join(cacheDirectory, titleFile), 'utf8'),
    ).toBe("S08E07 · Lisa's Date with 100% Density");
  });

  it('caches newlines and grows the canvas for a multi-line title', async () => {
    const temporaryDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'tunarr-program-title-test-'),
    );
    temporaryDirectories.push(temporaryDirectory);

    const input = await createProgramTitleOverlayInput(
      makeProgram({
        episode: 7,
        seasonNumber: 8,
        showTitle: 'The Simpsons',
        title: "Lisa's Date with Density",
      }),
      {
        duration: 5,
        enabled: true,
        horizontalMargin: 2,
        opacity: 100,
        position: 'bottom-left',
        programTitleTemplate: '{show}\n{seasonEpisode} · {title}',
        source: 'program-title',
        verticalMargin: 6,
        width: 75,
      },
      temporaryDirectory,
    );

    expect(input?.streams[0]?.frameSize).toEqual(
      FrameSize.create({ width: 1600, height: 156 }),
    );
    expect(input?.streams[0]?.displayAspectRatio).toBe('1600:156');
    expect(input?.path).toContain('s=1600x156');

    const cacheDirectory = path.join(
      temporaryDirectory,
      'cache',
      'program-title-overlays',
    );
    const files = await fs.readdir(cacheDirectory);
    const titleFile = files[0];
    if (!titleFile) {
      throw new Error('Expected a cached program title file');
    }
    expect(
      await fs.readFile(path.join(cacheDirectory, titleFile), 'utf8'),
    ).toBe("The Simpsons\nS08E07 · Lisa's Date with Density");
  });
});
