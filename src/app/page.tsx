'use client';
import { useRouter } from 'next/navigation';
import { ElementChooser } from '@/components/ElementChooser';

// Home route: the element selector. Choosing an element navigates to the builder.
export default function Page() {
  const router = useRouter();
  return <ElementChooser onSelected={() => router.push('/layer1')} />;
}
