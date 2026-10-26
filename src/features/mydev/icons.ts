import { svg } from '../../core/dom.ts';

/**
 * Check-mark icon (SPEC §4): outline when unchecked, filled when checked. Built from bundled paths
 * only; nothing here comes from page data. Colours come from `mydev.css`.
 */
export function checkIcon(checked: boolean): SVGElement {
  return svg(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: 24,
      height: 24,
      class: checked ? 'crayons-icon mydev-icon mydev-icon--checked' : 'crayons-icon mydev-icon',
      'aria-hidden': 'true',
      focusable: 'false',
    },
    [
      svg('circle', { cx: 12, cy: 12, r: 9, class: 'mydev-icon__ring' }),
      svg('path', { d: 'M7.5 12.5l3 3 6-6.5', class: 'mydev-icon__check' }),
    ],
  );
}
