import type { CSSProperties } from 'react';
const assets = {
  briefcase: '2-4842-imgBriefcaseBusiness.svg',
  search: '2-4830-imgSearch.svg',
  down: '2-4829-imgChevronDown.svg',
  right: '2-4850-imgChevronRight.svg',
  left: '2-4851-imgChevronLeft.svg',
  download: '7-113-imgDownload.svg',
  status: '2-4864-imgStatusIndicator.svg',
  sort: '2-4874-imgArrowUpDown.svg',
  empty: '2-4877-imgListFilter.svg',
  loading: '2-4878-imgLoaderCircle.svg',
  check: '2-4833-imgCheck.svg',
} as const;
export function Icon({ name, small = false }: { name: keyof typeof assets; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={'figma-icon' + (small ? ' small' : '')}
      style={{ '--asset-url': 'url("/figma/' + assets[name] + '")' } as CSSProperties}
    />
  );
}
