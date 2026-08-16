export const ProgramTitleTemplateTokens = [
  'album',
  'artist',
  'episode',
  'season',
  'seasonEpisode',
  'show',
  'title',
] as const;

export type ProgramTitleTemplateToken =
  (typeof ProgramTitleTemplateTokens)[number];

export const DefaultProgramTitleTemplate = '{show} · {seasonEpisode} · {title}';

// The canvas grows with each line, so cap it to keep a pathological template
// from swallowing the frame.
export const MaxProgramTitleLines = 6;

const TokenPattern =
  /\{(album|artist|episode|season|seasonEpisode|show|title)\}/g;

// Overlay canvas geometry, shared so the channel form's preview matches what
// FFmpeg draws.
export const ProgramTitleOverlayWidth = 1600;
export const ProgramTitleOverlayFontSize = 48;
// drawtext advances lines by the font's own height (~1.15x the font size).
export const ProgramTitleOverlayLineHeight = 60;
// Split evenly above and below the text block.
export const ProgramTitleOverlayPadding = 36;

export function programTitleOverlayHeight(lineCount: number): number {
  return (
    ProgramTitleOverlayLineHeight * Math.max(lineCount, 1) +
    ProgramTitleOverlayPadding
  );
}

export function programTitleLineCount(title: string): number {
  return title.split('\n').length;
}

/**
 * Collapses runs of whitespace and drops middle-dot sections which resolved to
 * nothing, e.g. `The Simpsons ·  · Bart the Genius` -> `The Simpsons · Bart the
 * Genius`.
 */
function normalizeLine(line: string): string {
  return line
    .split('·')
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => part.length > 0)
    .join(' · ');
}

/**
 * Renders a program title template, substituting each `{token}` with the given
 * value. Templates can span multiple lines, either with real newlines or with
 * the `\n` escape sequence. Blank lines are dropped and at most
 * {@link MaxProgramTitleLines} lines are kept.
 */
export function renderProgramTitleTemplate(
  template: string,
  values: Record<ProgramTitleTemplateToken, string>,
): string {
  return template
    .replaceAll('\\n', '\n')
    .replace(
      TokenPattern,
      (_, token: ProgramTitleTemplateToken) => values[token] ?? '',
    )
    .split('\n')
    .map(normalizeLine)
    .filter((line) => line.length > 0)
    .slice(0, MaxProgramTitleLines)
    .join('\n');
}
