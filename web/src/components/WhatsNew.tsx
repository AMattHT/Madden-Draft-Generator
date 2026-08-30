import { useEffect, useState } from 'react';

interface About {
  version: string;
  changelog: string | null;
}

/** Remembers the version whose notes have been read, so the panel opens itself
 *  once after an update and never again for that version. */
const SEEN_KEY = 'whatsNewSeenVersion';

/** Just enough Markdown for the changelog: headings, bullets, `code`, **bold**,
 *  and paragraphs. A full parser would be a dependency for one document. */
function render(md: string) {
  const inline = (t: string) =>
    t
      .split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g)
      .filter(Boolean)
      .map((part, i) => {
        if (part.startsWith('**')) return <strong key={i} className="text-neutral-100">{part.slice(2, -2)}</strong>;
        if (part.startsWith('`')) return <code key={i} className="rounded bg-surface-2 px-1 text-[0.9em] text-primary-light">{part.slice(1, -1)}</code>;
        if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
        return <span key={i}>{part}</span>;
      });

  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    out.push(
      <ul key={`u${out.length}`} className="mb-4 list-disc space-y-1.5 pl-5 text-sm text-neutral-300">
        {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
      </ul>
    );
    bullets = [];
  };

  // Paragraphs wrap across lines in the source; join them before rendering.
  const blocks = md.split(/\n{2,}/);
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;
    if (block.startsWith('# ')) continue; // the panel has its own title
    if (block.startsWith('## ')) {
      flush();
      out.push(
        <h3 key={`h${out.length}`} className="mb-2 mt-6 border-b border-border pb-1 text-base font-bold text-gold first:mt-0">
          {block.slice(3)}
        </h3>
      );
      continue;
    }
    if (block.startsWith('### ')) {
      flush();
      out.push(<h4 key={`s${out.length}`} className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-neutral-400">{block.slice(4)}</h4>);
      continue;
    }
    if (block.startsWith('- ')) {
      for (const line of block.split(/\n(?=- )/)) bullets.push(line.replace(/^- /, '').replace(/\s*\n\s*/g, ' '));
      continue;
    }
    flush();
    out.push(<p key={`p${out.length}`} className="mb-3 text-sm leading-relaxed text-neutral-300">{inline(block.replace(/\s*\n\s*/g, ' '))}</p>);
  }
  flush();
  return out;
}

export function WhatsNew({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [about, setAbout] = useState<About | null>(null);
  useEffect(() => {
    if (!open || about) return;
    fetch('/api/about').then((r) => r.json()).then(setAbout).catch(() => setAbout({ version: '', changelog: null }));
  }, [open, about]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-surface-1 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3.5">
          <div>
            <h2 className="text-lg font-bold tracking-tight">What's new</h2>
            {about?.version && <p className="text-[11px] text-muted">Version {about.version}</p>}
          </div>
          <button onClick={onClose} className="rounded px-2 py-1 text-sm text-neutral-400 transition-colors hover:bg-surface-2 hover:text-neutral-100">
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {about === null ? (
            <p className="text-sm text-muted">Loading…</p>
          ) : about.changelog ? (
            render(about.changelog)
          ) : (
            <p className="text-sm text-muted">No release notes shipped with this build.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/** True when this build's notes have not been read yet. */
export function useWhatsNew(): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/about')
      .then((r) => r.json())
      .then((a: About) => {
        if (cancelled || !a.version) return;
        // Never on a first install — only when the version has actually moved.
        const seen = localStorage.getItem(SEEN_KEY);
        if (seen && seen !== a.version) setOpen(true);
        if (!seen) localStorage.setItem(SEEN_KEY, a.version);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const close = () => {
    setOpen(false);
    fetch('/api/about').then((r) => r.json()).then((a: About) => {
      if (a.version) localStorage.setItem(SEEN_KEY, a.version);
    }).catch(() => {});
  };
  return [open, () => setOpen(true), close];
}
