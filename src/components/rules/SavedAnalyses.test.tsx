import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SavedAnalyses, type SavedMeta } from '@/components/rules/SavedAnalyses';

const items: SavedMeta[] = [
  { fileName: 'track.mp3', savedAt: '2026-07-19T00:00:00.000Z', model: 'gpt-audio-1.5', windowCount: 3, candidateCount: 12 },
];

describe('SavedAnalyses', () => {
  it('expands and fires Load / Delete with the file name', async () => {
    const onLoad = vi.fn();
    const onDelete = vi.fn();
    render(<SavedAnalyses items={items} onLoad={onLoad} onDelete={onDelete} />);
    await userEvent.click(screen.getByText(/Saved analyses/i)); // open the accordion
    await userEvent.click(screen.getByRole('button', { name: /load/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onLoad).toHaveBeenCalledWith('track.mp3');
    expect(onDelete).toHaveBeenCalledWith('track.mp3');
  });
});
