import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getFirmName } from '@/db/queries.ts';

export const metadata: Metadata = {
  title: 'TaxFlow Radar',
  description: 'Find and clear the bottleneck in your busy season.',
};

const NAV = [
  { href: '/', label: 'Radar' },
  { href: '/pipeline', label: 'Pipeline' },
  { href: '/chase', label: 'Doc Chase' },
  { href: '/capacity', label: 'Capacity' },
  { href: '/triage', label: 'Triage' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const firmName = getFirmName();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <header
          className="sticky top-0 z-20 border-b backdrop-blur hairline"
          style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)' }}
        >
          <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <span
                className="grid h-7 w-7 place-items-center rounded-md text-xs font-bold"
                style={{ background: 'var(--info-bg)', color: 'var(--info)' }}
                aria-hidden
              >
                TF
              </span>
              <span className="text-sm font-semibold tracking-tight">TaxFlow Radar</span>
            </Link>

            {/* On narrow screens the nav drops to its own full-width row so
                the links are not squeezed into a few pixels by the firm name. */}
            {/* min-w-0 is required: a flex item defaults to min-width:auto,
                which makes it grow to fit its content and defeats overflow-x. */}
            <nav className="scroll-x order-last flex w-full min-w-0 items-center gap-1 sm:order-none sm:w-auto sm:flex-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap no-underline transition-colors hover:bg-[var(--surface-2)]"
                  style={{ color: 'var(--text-muted)' }}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <span
              className="ml-auto truncate text-xs sm:ml-0 sm:whitespace-nowrap"
              style={{ color: 'var(--text-faint)' }}
            >
              {firmName}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-[1400px] px-4 py-6">{children}</main>

        <footer
          className="mx-auto max-w-[1400px] px-4 pt-2 pb-10 text-xs"
          style={{ color: 'var(--text-faint)' }}
        >
          Cycle times, queue depth and clearance rates are measured from this firm&rsquo;s own
          stage-event log over the trailing 28 days.
        </footer>
      </body>
    </html>
  );
}
