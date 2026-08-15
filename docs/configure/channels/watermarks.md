# Channel Watermarks

Channels can have watermarks to aid in recreating a classic TV experience.

![](/assets/watermark_form.png)

There are many ways to customize watermarks for a channel. Here are some details on specific options:

## Now playing overlays

Set the overlay source to **Now playing** to show the current program's metadata
instead of an image. Every program is drawn with the same **Now playing
format**, which defaults to `{show} · {seasonEpisode} · {title}`. The overlay is
rebuilt for each program, so a total duration of 5 seconds shows the text for
the first five seconds after every cutover. Now playing overlays require a
transcoding stream mode.

### Now playing format

Use **Now playing format** to change what the overlay draws. These tokens are
replaced with the current program's metadata:

| Token             | Value                            |
| ----------------- | -------------------------------- |
| `{show}`          | Show name                        |
| `{season}`        | Season number, e.g. `S01`        |
| `{episode}`       | Episode number, e.g. `E02`       |
| `{seasonEpisode}` | Season and episode, e.g. `S01E02`|
| `{title}`         | Program title                    |
| `{artist}`        | Track artist                     |
| `{album}`         | Track album                      |

Tokens that have no value for a program are dropped, along with any `·`
separator that would be left dangling — a movie drawn with the default format
shows only its title. A format whose tokens are all empty for a program falls
back to the default format, so music channels want a format such as
`{artist} · {album} · {title}`.

The title can span multiple lines: press **Enter** in the field, or write `\n`
where you want the break. For example, `{show}\n{seasonEpisode} · {title}`
renders as:

```
The Simpsons
S08E02 · You Only Move Twice
```

Blank lines are dropped and at most 6 lines are drawn. The overlay canvas grows
taller with each line, so at a fixed width percentage a two line title takes up
roughly 1.6x the vertical space of a single line one.

### Watermark Period

This value can be used to fade a channel's watermark in/out every N minutes.

### Watermark on leading edge

When using intermittent watermarks, use this option to control whether the watermark begins in a visible (true) or hidden (false) state.

### Total watermark duration

This option controls the absolute duration the watermark can be displayed for a given program segment of a channel. Its value takes precedence over the 'watermark period' but does not disable it. For instance, you could configure a watermark period of 5 minutes with total duration of 45 mins. On a show that is one hour, the watermark will fade in/out for the first 45 minutes and then be hidden for the final 15 minutes.

## Overrides

Global settings, such as target resolution, bit rate, and buffer size can be overridden per-channel.
