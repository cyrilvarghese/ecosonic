'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useArrangement } from '@/arrange/arrangementStore';
import { ArrangeScreen } from '@/components/layer2/ArrangeScreen';

// Layer Two needs a composition (seeded on entry from Layer One). Direct nav / refresh
// resets the in-memory store, so send those back to the element selector.
export default function Layer2Page() {
  const router = useRouter();
  const composition = useArrangement((s) => s.composition);
  useEffect(() => { if (!composition) router.replace('/'); }, [composition, router]);
  if (!composition) return null;
  return <ArrangeScreen />;
}
