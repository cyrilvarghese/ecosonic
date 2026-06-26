'use client';
import { useStore } from 'zustand';
import manifestJson from '@/manifest.json';
import { config } from '@/config';
import type { Manifest } from '@/types';
import { createSessionStore, type SessionState } from '@/session/sessionStore';

export const sessionStore = createSessionStore({
  manifest: manifestJson as unknown as Manifest,
  cfg: config,
});

export function useSession<T>(selector: (s: SessionState) => T): T {
  return useStore(sessionStore, selector);
}
