import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GrammarTimeline } from '@/components/rules/GrammarTimeline';
import { grammarSpans } from '@/rules/inventory';

describe('GrammarTimeline', () => {
  it('renders a heading per mode', () => {
    render(<GrammarTimeline spans={grammarSpans()} />);
    expect(screen.getByText('INTRODUCTION')).toBeInTheDocument();
    expect(screen.getByText('DEEP_RELAXATION')).toBeInTheDocument();
    expect(screen.getByText('RETURN')).toBeInTheDocument();
  });
  it('renders every layer lane in each mode, including empty ones', () => {
    render(<GrammarTimeline spans={grammarSpans()} />);
    // 11 categories × 3 modes = 33 lane labels (NOISE appears once per mode).
    expect(screen.getAllByText('NOISE')).toHaveLength(3);
    // PAD is absent in DEEP_RELAXATION but its lane label still renders (3 total).
    expect(screen.getAllByText('PAD')).toHaveLength(3);
  });
  it('shows the four role-family legend labels', () => {
    render(<GrammarTimeline spans={grammarSpans()} />);
    expect(screen.getByText('bed')).toBeInTheDocument();
    expect(screen.getByText('tonal')).toBeInTheDocument();
    expect(screen.getByText('harmonic')).toBeInTheDocument();
    expect(screen.getByText('melodic')).toBeInTheDocument();
  });
});
