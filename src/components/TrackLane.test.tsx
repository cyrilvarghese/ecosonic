import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TrackLane } from '@/components/TrackLane';
import { sessionStore } from '@/session/appStore';

function firstTrackId(): string {
  return sessionStore.getState().project.tracks[0].id;
}

describe('TrackLane', () => {
  beforeEach(() => {
    sessionStore.getState().backToChooser();
    sessionStore.getState().selectElement('WATER');
  });

  it('shows the track label and toggles mute', async () => {
    const id = firstTrackId();
    const label = sessionStore.getState().project.tracks[0].label;
    render(<TrackLane trackId={id} />);
    expect(screen.getByText(label)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: new RegExp(`mute ${label}`, 'i') }));
    expect(sessionStore.getState().project.tracks.find((t) => t.id === id)!.muted).toBe(true);
  });

  it('lock disables Change', async () => {
    const id = firstTrackId();
    const label = sessionStore.getState().project.tracks[0].label;
    render(<TrackLane trackId={id} />);
    await userEvent.click(screen.getByRole('button', { name: new RegExp(`lock ${label}`, 'i') }));
    expect(sessionStore.getState().project.tracks.find((t) => t.id === id)!.locked).toBe(true);
    expect(screen.getByRole('button', { name: new RegExp(`change ${label}`, 'i') })).toBeDisabled();
  });
});
