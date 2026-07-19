import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalysisTimeline } from '@/components/rules/AnalysisTimeline';
import type { CandidateRule, PatchWireT } from '@/rules/analysisSchema';

const patch = (over: Partial<PatchWireT>): PatchWireT => ({
  present: null, enter: null, exit: null, fadeIn: null, fadeOut: null, after: null, ...over,
});
const cand = (over: Partial<CandidateRule>): CandidateRule => ({
  text: 'x', layer: null, sectionIndex: 1, structured: null, evidence: [], confidence: 0.7,
  kind: 'novel', relatedRule: null, mode: 'INTRODUCTION', ...over,
});

describe('AnalysisTimeline', () => {
  it('renders a lane per observed category and a chip per untimed candidate', () => {
    const candidates = [
      cand({ kind: 'confirms', structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 }, exit: { canon: 300, half: 10 } }) } }),
      cand({ kind: 'contradicts', structured: { category: 'PAD', patch: patch({ enter: { canon: 500, half: 5 } }) } }),
      cand({ kind: 'novel', text: 'The noise bed never stops', relatedRule: 'R7' }),
    ];
    render(<AnalysisTimeline candidates={candidates} mode="INTRODUCTION" />);
    expect(screen.getByText('ISO')).toBeInTheDocument();
    expect(screen.getByText('PAD')).toBeInTheDocument();
    expect(screen.getByText(/noise bed never stops/i)).toBeInTheDocument();
  });
  it('labels the axis at every minute', () => {
    const one = [cand({ structured: { category: 'ISO', patch: patch({ enter: { canon: 60, half: 5 } }) } })];
    render(<AnalysisTimeline candidates={one} mode="INTRODUCTION" />);
    expect(screen.getByText('0:00')).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
    expect(screen.getByText('9:00')).toBeInTheDocument();
    expect(screen.getByText('10:00')).toBeInTheDocument();
  });
});
