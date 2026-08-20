import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import { assessAll, countFolders } from '#core';
import { Rail } from '@/components/shell.tsx';
import { getAgencyName, getViewerId, loadSnapshot } from '@/db/queries.ts';

export const metadata: Metadata = {
  title: 'CentralFlow — agency CRM',
  description: 'A shared client inbox that ranks itself by what a slow reply actually costs.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const snapshot = loadSnapshot();
  const viewerId = getViewerId();
  const viewer = snapshot.team.find((m) => m.id === viewerId) ?? snapshot.team[0];
  const counts = countFolders(snapshot.conversations, snapshot.now, viewerId);

  const sla = assessAll(snapshot.conversations, snapshot.accounts, snapshot.now);
  let urgent = 0;
  for (const assessment of sla.values()) if (assessment.status === 'breached') urgent += 1;

  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:flex-row lg:gap-6 lg:p-0">
          {/* useSearchParams needs a Suspense boundary to keep the rest of the
              page static-renderable. */}
          <Suspense fallback={<div className="lg:w-[248px]" />}>
            <Rail
              agencyName={getAgencyName()}
              viewerName={viewer?.name ?? 'You'}
              viewerId={viewer?.id ?? 'tm_unknown'}
              viewerRole={viewer?.role ?? 'account manager'}
              counts={counts}
              urgent={urgent}
            />
          </Suspense>

          <main className="min-w-0 flex-1 pb-14 lg:py-5 lg:pr-5">{children}</main>
        </div>
      </body>
    </html>
  );
}
