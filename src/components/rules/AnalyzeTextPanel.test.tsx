import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnalyzeTextPanel } from '@/components/rules/AnalyzeTextPanel';

beforeEach(() => { vi.unstubAllGlobals(); });

describe('AnalyzeTextPanel', () => {
  it('posts pasted text and calls onResult with ok windows', async () => {
    const onResult = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify([
      { mode: 'INTRODUCTION', description: 'd', sections: null, candidates: [] },
    ]), { status: 200 }))));
    render(<AnalyzeTextPanel ready={true} onResult={onResult} />);
    await userEvent.type(screen.getByPlaceholderText(/paste/i), 'A noise bed plays throughout.');
    await userEvent.click(screen.getByRole('button', { name: /analyze description/i }));
    expect(onResult).toHaveBeenCalledTimes(1);
    const [results] = onResult.mock.calls[0];
    expect(results[0]).toMatchObject({ mode: 'INTRODUCTION', ok: true });
  });
});
