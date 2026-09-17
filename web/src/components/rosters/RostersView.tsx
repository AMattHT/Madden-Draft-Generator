import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api';
import { cache } from '../../cache';
import type { GameVersion, RosterData, RosterDoc } from '../../types';
import { newRosterDoc } from '../../rosterDoc';
import { RosterPicker } from './RosterPicker';
import { RosterBuilder } from './RosterBuilder';

interface Open { data: RosterData; doc: RosterDoc; readOnly: boolean; notice: string | null }

/**
 * Rosters: open a Madden 27 ROSTER save (or a roster saved here), move, cut and edit
 * players, and export a new ROSTER file. The document holds only deltas; the base is
 * re-read whenever a saved roster is opened, and a changed base makes it read-only.
 */
export function RostersView({ gameVersion }: { gameVersion: GameVersion }) {
  const [saved, setSaved] = useState<RosterDoc[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rebasing, setRebasing] = useState(false);

  const refreshSaved = useCallback(() => { cache.rosterList().then(setSaved).catch(() => {}); }, []);
  useEffect(refreshSaved, [refreshSaved]);

  const openBase = (data: RosterData, fromSaves: boolean) => { setOpen({ data, doc: newRosterDoc(data, fromSaves), readOnly: false, notice: null }); setErr(null); };

  /** Re-read a saved roster's base: from the saves folder by name, else the server's kept copy. */
  const openDoc = async (doc: RosterDoc) => {
    setLoading(doc.id); setErr(null);
    try {
      let data: RosterData | null = null;
      if (doc.base.fromSaves) { try { data = await api.rosterOpenSaved(doc.base.fileName); } catch { data = null; } }
      if (!data) { try { data = await api.rosterGet(doc.base.openedId); } catch { data = null; } }
      if (!data) {
        setErr(`The base file ${doc.base.fileName} is not in the saves folder any more. Put it back, or pick it again.`);
        return;
      }
      const changed = data.crc !== doc.base.crc || data.sizeBytes !== doc.base.sizeBytes;
      setOpen({
        data,
        doc: { ...doc, base: { ...doc.base, openedId: data.id } },
        readOnly: changed,
        notice: changed ? `${doc.base.fileName} has changed since this roster was saved, so it is read-only. Pick the base file again to keep editing.` : null,
      });
    } finally {
      setLoading(null);
    }
  };

  const save = async (doc: RosterDoc) => { await cache.rosterSet(doc); refreshSaved(); };
  const del = async (id: string) => { await cache.rosterDel(id); refreshSaved(); };
  /** Bind the open document to a freshly picked base and lift the read-only state. */
  const rebase = (data: RosterData, fromSaves: boolean) => setOpen((o) => o && ({
    data, readOnly: false, notice: null,
    doc: { ...o.doc, base: { fileName: data.name, openedId: data.id, sizeBytes: data.sizeBytes, crc: data.crc, fromSaves }, updatedAt: Date.now() },
  }));

  if (open && rebasing) {
    return (
      <div className="h-full overflow-auto px-6 py-4">
        <div className="mx-auto mt-2 w-[960px] max-w-full rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">Pick the base file for "{open.doc.name || 'Untitled roster'}". Your moves and edits are kept.</div>
        <RosterPicker savedDocs={[]} onOpenBase={(d, fromSaves) => { rebase(d, fromSaves); setRebasing(false); }} onOpenDoc={() => {}} onDeleteDoc={() => {}} />
        <div className="mx-auto mt-3 w-[960px] max-w-full"><button onClick={() => setRebasing(false)} className="text-xs text-muted hover:text-neutral-200">Cancel</button></div>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="h-full overflow-auto px-6 py-4">
        {gameVersion !== 'm27' && (
          <div className="mx-auto mt-2 w-[960px] max-w-full rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-gold">Rosters are Madden 27 files. Madden 26 rosters are not supported yet.</div>
        )}
        {err && <div className="mx-auto mt-2 w-[960px] max-w-full rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-red-200">{err}</div>}
        {loading && <div className="mx-auto mt-2 w-[960px] max-w-full text-xs text-muted">Opening…</div>}
        <RosterPicker savedDocs={saved} onOpenBase={openBase} onOpenDoc={openDoc} onDeleteDoc={del} />
      </div>
    );
  }

  return (
    <RosterBuilder
      data={open.data}
      doc={open.doc}
      readOnly={open.readOnly}
      notice={open.notice}
      onChange={(doc) => setOpen((o) => o && { ...o, doc })}
      onSave={save}
      onClose={() => { setOpen(null); refreshSaved(); }}
      onRebase={() => setRebasing(true)}
    />
  );
}
