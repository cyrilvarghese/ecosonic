import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ElementChooser } from '@/components/ElementChooser';
import { sessionStore } from '@/session/appStore';

describe('ElementChooser', () => {
  beforeEach(() => { sessionStore.getState().backToChooser(); });

  it('renders all five elements', () => {
    render(<ElementChooser />);
    for (const name of ['Earth', 'Water', 'Air', 'Fire', 'Ether']) {
      expect(screen.getByRole('button', { name: new RegExp(name, 'i') })).toBeInTheDocument();
    }
  });

  it('selecting an element builds its tracks in the store', async () => {
    render(<ElementChooser />);
    await userEvent.click(screen.getByRole('button', { name: /water/i }));
    expect(sessionStore.getState().project.element).toBe('WATER');
    expect(sessionStore.getState().project.tracks.length).toBeGreaterThan(0);
  });
});
