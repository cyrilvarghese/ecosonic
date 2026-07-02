'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/session/appStore';
import { BuilderScreen } from '@/components/BuilderScreen';

// Layer One builder. It needs a chosen element; if someone opens /layer1 directly
// (or after a refresh, which resets the in-memory store), send them to the selector.
export default function Layer1Page() {
  const router = useRouter();
  const element = useSession((s) => s.project.element);

  useEffect(() => {
    if (!element) router.replace('/');
  }, [element, router]);

  if (!element) return null;
  return <BuilderScreen />;
}
