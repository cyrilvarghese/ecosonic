'use client';
import { ELEMENTS, type ElementName } from '@/types';
import { useSession } from '@/session/appStore';
import { ElementGlyph } from '@/components/ElementGlyph';

// Quincunx placement (CSS grid areas): Air top, Water left, Ether center, Fire right, Earth bottom.
const AREA: Record<ElementName, string> = {
  AIR: 'air', WATER: 'water', ETHER: 'ether', FIRE: 'fire', EARTH: 'earth',
};

export function ElementChooser() {
  const selectElement = useSession((s) => s.selectElement);

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center gap-10 p-8"
      style={{ background: 'var(--hero-gradient)' }}
    >
      <p className="label">Layer One — Choose an element to begin</p>
      <div
        className="grid gap-6"
        style={{
          gridTemplateAreas: '". air ." "water ether fire" ". earth ."',
        }}
      >
        {ELEMENTS.map((el) => (
          <button
            key={el}
            aria-label={el}
            onClick={() => selectElement(el)}
            data-element={el.toLowerCase()}
            style={{ gridArea: AREA[el], color: 'var(--accent-ink)' }}
            className="flex h-28 w-28 flex-col items-center justify-center gap-2 rounded-[var(--radius)]
                       bg-card backdrop-blur transition hover:scale-105 focus:outline-none
                       focus:ring-2 ring-ring"
          >
            <ElementGlyph element={el} />
            <span className="label text-foreground">{el}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
