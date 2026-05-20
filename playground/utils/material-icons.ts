// Material Symbols Outlined — typed helper that returns an inline <svg><use/></svg>
// pointing at the external sprite at /pathogen/assets/material-icons-sprite.svg.
//
// External-URL <use href> is used (rather than an intra-document `#id` reference)
// so the same call site works from inside Shadow DOM components — fragment-only
// references do not cross shadow boundaries.

const SPRITE_URL = '/assets/material-icons-sprite.svg';

export type MaterialIconName =
  | 'more-vert'
  | 'content-copy'
  | 'link'
  | 'code'
  | 'bug-report'
  | 'download'
  | 'image'
  | 'public'
  | 'lock'
  | 'dark-mode'
  | 'light-mode'
  | 'arrow-down'
  | 'add'
  | 'terminal'
  | 'format-left'
  | 'grid'
  | 'list'
  | 'share'
  | 'subtitles'
  | 'edit';

export interface MaterialIconOptions {
  className?: string;
  size?: number;
}

export function materialIcon(name: MaterialIconName, opts: MaterialIconOptions = {}): string {
  const cls = opts.className ?? 'icon';
  const size = opts.size ?? 18;
  return `<svg class="${cls}" width="${size}" height="${size}" aria-hidden="true" focusable="false"><use href="${SPRITE_URL}#mi-${name}"/></svg>`;
}
