import { describe, expect, it } from 'vitest';
import {
  MaxProgramTitleLines,
  programTitleLineCount,
  programTitleOverlayHeight,
  renderProgramTitleTemplate,
  type ProgramTitleTemplateToken,
} from './programTitleOverlay.js';

const values: Record<ProgramTitleTemplateToken, string> = {
  album: 'Songs in the Key of Springfield',
  artist: 'The Simpsons',
  episode: 'E02',
  season: 'S08',
  seasonEpisode: 'S08E02',
  show: 'The Simpsons',
  title: 'You Only Move Twice',
};

describe('renderProgramTitleTemplate', () => {
  it('substitutes tokens and cleans up empty middle-dot sections', () => {
    expect(
      renderProgramTitleTemplate('{show} · {seasonEpisode} · {title}', {
        ...values,
        seasonEpisode: '',
      }),
    ).toBe('The Simpsons · You Only Move Twice');
  });

  it('keeps line breaks written as real newlines', () => {
    expect(
      renderProgramTitleTemplate('{show}\n{seasonEpisode} · {title}', values),
    ).toBe('The Simpsons\nS08E02 · You Only Move Twice');
  });

  it('treats the \\n escape sequence as a line break', () => {
    expect(
      renderProgramTitleTemplate('{show}\\n{seasonEpisode}\\n{title}', values),
    ).toBe('The Simpsons\nS08E02\nYou Only Move Twice');
  });

  it('drops lines which render to nothing', () => {
    expect(
      renderProgramTitleTemplate('{show}\n{seasonEpisode}\n\n  \n{title}', {
        ...values,
        seasonEpisode: '',
      }),
    ).toBe('The Simpsons\nYou Only Move Twice');
  });

  it('collapses whitespace within each line', () => {
    expect(renderProgramTitleTemplate('  {show}   —   {title}  ', values)).toBe(
      'The Simpsons — You Only Move Twice',
    );
  });

  it('caps the number of rendered lines', () => {
    const template = new Array(MaxProgramTitleLines + 3)
      .fill('{show}')
      .join('\n');

    expect(
      programTitleLineCount(renderProgramTitleTemplate(template, values)),
    ).toBe(MaxProgramTitleLines);
  });
});

describe('programTitleOverlayHeight', () => {
  it('matches the historical single line canvas', () => {
    expect(programTitleOverlayHeight(1)).toBe(96);
    expect(programTitleOverlayHeight(0)).toBe(96);
  });

  it('grows by one line height per additional line', () => {
    expect(programTitleOverlayHeight(2)).toBe(156);
    expect(programTitleOverlayHeight(3)).toBe(216);
  });
});
