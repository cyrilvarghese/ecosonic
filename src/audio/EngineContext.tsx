'use client';
import { createContext, useContext } from 'react';
import type { AudioEngine } from '@/audio/AudioEngine';

const EngineContext = createContext<AudioEngine | null>(null);

export const EngineProvider = EngineContext.Provider;

/** Access the AudioEngine from within the builder subtree. Null outside a provider. */
export function useEngine(): AudioEngine | null {
  return useContext(EngineContext);
}
