import NProgress from 'nprogress';
import 'nprogress/nprogress.css';

NProgress.configure({ showSpinner: false });

// Reference-counted so concurrent loads (e.g. PeopleView mounting three
// composables at once, each with their own initial fetch) don't have one
// finishing early and hiding the bar while the others are still in flight.
let activeCount = 0;

export function startProgress(): void {
  activeCount += 1;
  if (activeCount === 1) NProgress.start();
}

export function doneProgress(): void {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) NProgress.done();
}

/**
 * Wraps a promise-returning call with the progress bar. Use for
 * user-triggered or initial-page-load fetches — not for silent background
 * polling or Realtime-subscription callbacks, which would flash the bar
 * continuously and defeat its purpose as a "the page is doing something"
 * signal.
 *
 * Accepts `PromiseLike`, not just `Promise`, so Supabase's query builders
 * (thenable but not literally `Promise` instances) can be passed directly:
 * `withProgress(() => supabase.from(...).select())`.
 */
export async function withProgress<T>(fn: () => PromiseLike<T>): Promise<T> {
  startProgress();
  try {
    return await fn();
  } finally {
    doneProgress();
  }
}
