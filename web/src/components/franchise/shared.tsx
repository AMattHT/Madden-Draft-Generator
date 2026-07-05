import type { ReactNode } from 'react';

/** Shared presentational primitives for the franchise tool cards, so every tab
 *  looks consistent and no single file carries all the styling. */

export const inputCls =
  'w-full rounded-md border border-border bg-surface-0 px-2.5 py-1.5 text-sm text-neutral-200 focus:border-primary focus:outline-none';
export const cardCls = 'rounded-lg border border-border bg-surface-1 p-4';
export const btnPrimary =
  'inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-50';
export const btnGhost =
  'inline-flex items-center gap-2 rounded-md border border-border bg-surface-0 px-4 py-2 text-sm font-semibold text-neutral-200 transition-colors hover:border-primary disabled:opacity-50';

export const fmtM = (m: number) => `$${m.toFixed(1)}M`;

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-neutral-500">{hint}</span>}
    </label>
  );
}

/** Tool title + one-line description that heads each card. */
export function ToolHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-xs text-muted">{children}</p>
    </div>
  );
}

export function ErrorCard({ message }: { message: string }) {
  return <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-200">{message}</div>;
}

/** Green result panel shell; pass the headline as children plus optional extra content. */
export function SuccessCard({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-success/40 bg-success/10 p-4 text-sm">{children}</div>;
}

/** The written-file footer line shared by every save-writing tool. */
export function LoadHint() {
  return <div className="mt-2 text-xs text-green-200/70">Load it in Madden (Franchise → Load).</div>;
}

/** Standard vertical stack for a tab's tool cards. */
export function ToolStack({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 overflow-auto px-6 py-6">{children}</div>;
}
