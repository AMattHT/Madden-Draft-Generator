import { useState } from 'react';
import type { GameVersion } from '../types';
import { NAME } from '../brand';
import { LogoMark } from './TopBar';
import { Icon, ICONS, Switch } from './ui';

const GAMES: { value: GameVersion; title: string; cover: string; blurb: string; points: string[] }[] = [
  {
    value: 'm27',
    title: 'Madden NFL 27',
    cover: '/art/cover-m27.webp',
    blurb: 'The current game. Draft classes with persona DNA, plus roster building.',
    points: ['Draft classes', 'Persona DNA and mindset focus', 'Open, edit and export ROSTER saves'],
  },
  {
    value: 'm26',
    title: 'Madden NFL 26',
    cover: '/art/cover-m26.webp',
    blurb: 'Last year’s game. Draft classes only.',
    points: ['Draft classes', 'Every year 1936 – 2026', 'No roster editing'],
  },
];

/**
 * First-run choice: which Madden the classes and rosters are for. Shown once
 * on the dev build (a per-game installer is pinned and never asks); the answer
 * is remembered and can be changed from the top bar or the View menu.
 */
export function GamePicker({ current, onPick, onDismiss }: {
  current: GameVersion;
  onPick: (v: GameVersion, remember: boolean) => void;
  /** Present when the picker was reopened by hand, so it can be closed without choosing. */
  onDismiss?: () => void;
}) {
  const [remember, setRemember] = useState(true);
  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in items-center justify-center bg-surface-0/90 p-6 backdrop-blur-md" role="dialog" aria-modal="true" aria-label="Choose your game">
      <div className="glass-strong w-full max-w-4xl animate-pop rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <LogoMark size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-[26px] font-extrabold leading-none text-neutral-50">Which Madden are you building for?</h1>
            <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-neutral-400">
              {NAME} writes a different file for each game. Pick once; you can change it later from the top bar.
            </p>
          </div>
          {onDismiss && (
            <button onClick={onDismiss} className="rounded-md p-1 text-muted transition-colors hover:bg-white/[0.06] hover:text-neutral-200" aria-label="Keep the current game">
              <Icon path={ICONS.close} className="h-5 w-5" />
            </button>
          )}
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 md:grid-cols-2">
          {GAMES.map((g) => {
            const on = g.value === current;
            return (
              <button
                key={g.value}
                onClick={() => onPick(g.value, remember)}
                className={`press group relative flex overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5 ${
                  on ? 'border-primary/60 shadow-[0_0_0_1px_rgba(47,107,255,0.35),0_24px_48px_-20px_rgba(47,107,255,0.6)]' : 'border-white/[0.08] hover:border-primary/50 hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.9)]'
                }`}
              >
                {/* The cover, bled across the whole card as its ground, then again crisp on the left. */}
                <span aria-hidden className="absolute inset-0 bg-cover bg-center opacity-40 blur-2xl saturate-150 transition-opacity duration-300 group-hover:opacity-60" style={{ backgroundImage: `url(${g.cover})` }} />
                <span aria-hidden className="absolute inset-0 bg-gradient-to-r from-surface-0/40 via-surface-0/80 to-surface-0/90" />
                <img
                  src={g.cover}
                  alt={`${g.title} cover`}
                  className="relative m-4 h-[204px] w-[150px] shrink-0 rounded-lg object-cover shadow-[0_16px_40px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-[1.03]"
                />
                <span className="relative flex min-w-0 flex-1 flex-col py-4 pr-4">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-display text-[20px] font-extrabold text-neutral-50">{g.title}</span>
                    {on && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-bold text-primary-light ring-1 ring-primary/30">Current</span>}
                  </span>
                  <span className="mt-1 text-[13px] text-neutral-300">{g.blurb}</span>
                  <ul className="mt-3 flex flex-col gap-1.5 text-[13px] text-neutral-200">
                    {g.points.map((p) => (
                      <li key={p} className="flex items-start gap-2">
                        <Icon path={ICONS.check} className="mt-[3px] h-3.5 w-3.5 shrink-0 text-primary-light" strokeWidth={2.4} />
                        {p}
                      </li>
                    ))}
                  </ul>
                  <span className="mt-auto inline-flex items-center gap-1.5 pt-4 text-[13px] font-semibold text-primary-light">
                    Use {g.title}
                    <Icon path={ICONS.arrowRight} className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" strokeWidth={2.2} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-white/[0.06] pt-4">
          <Switch checked={remember} onChange={setRemember} label="Remember my choice on this computer" />
          <span className="text-[11px] text-muted">The per-game installers skip this screen.</span>
        </div>
      </div>
    </div>
  );
}
