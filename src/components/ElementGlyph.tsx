import type { ElementName } from '@/types';

const PATHS: Record<ElementName, React.ReactNode> = {
  FIRE: <polygon points="24,6 42,40 6,40" />,
  WATER: <polygon points="6,8 42,8 24,42" />,
  AIR: <><polygon points="24,6 42,40 6,40" /><line x1="13" y1="30" x2="35" y2="30" /></>,
  EARTH: <><polygon points="6,8 42,8 24,42" /><line x1="13" y1="20" x2="35" y2="20" /></>,
  ETHER: <><polygon points="24,5 41,38 7,38" /><polygon points="24,43 7,10 41,10" /><circle cx="24" cy="24" r="2.5" /></>,
};

export function ElementGlyph({ element, size = 48 }: { element: ElementName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[element]}
    </svg>
  );
}
