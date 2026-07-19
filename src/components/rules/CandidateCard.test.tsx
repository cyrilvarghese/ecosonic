import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CandidateCard } from '@/components/rules/CandidateCard';
import type { CandidateRule } from '@/rules/analysisSchema';

const contradicting: CandidateRule = {
  text: 'A drone layer starts swelling in around 1:30.',
  layer: 'DRONE', sectionIndex: 1,
  structured: { category: 'DRONE', patch: { present: null, enter: { canon: 90, half: 10 }, exit: null, fadeIn: null, fadeOut: null, after: null } },
  evidence: [], confidence: 0.8,
  kind: 'contradicts', relatedRule: 'grammar:RETURN.DRONE.enter', mode: 'RETURN',
};

describe('CandidateCard', () => {
  it('shows the readable rule phrase, not the raw grammar token', () => {
    render(<CandidateCard candidate={contradicting} keptId={null} onKeep={vi.fn()} onDiscard={vi.fn()} onPromote={vi.fn()} />);
    // readable explanation is rendered…
    expect(screen.getByText(/Return expects DRONE to enter/i)).toBeInTheDocument();
    // …and the raw token is not shown as visible text.
    expect(screen.queryByText(/grammar:RETURN\.DRONE\.enter/)).toBeNull();
  });
});
