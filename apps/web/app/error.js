'use client';

import { ErrorState } from '@/components/ui/StateViews';

export default function RouteError({ reset }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-8">
      <ErrorState onRetry={reset} />
    </main>
  );
}
