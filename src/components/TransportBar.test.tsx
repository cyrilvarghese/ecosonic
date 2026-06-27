import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TransportBar } from '@/components/TransportBar';
import { sessionStore } from '@/session/appStore';

describe('TransportBar', () => {
  beforeEach(() => {
    sessionStore.getState().backToChooser();
    sessionStore.getState().selectElement('WATER');
  });

  it('toggles global playback', async () => {
    render(<TransportBar />);
    expect(sessionStore.getState().globalPlaying).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: /play all/i }));
    expect(sessionStore.getState().globalPlaying).toBe(true);
  });
});
