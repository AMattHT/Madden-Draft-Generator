# Madden 27 Draft Class Generator

Turn any real NFL draft from **1936 to 2026** into a draft class you can load into Madden 27.

Pick a year, and the whole class is built for you — real players, rated from what they actually did
in the NFL, with era-correct builds, gear, faces and real drafting teams. Export it, start a
franchise, and draft Barry Sanders yourself.

**[Download the latest release](https://github.com/amatthewsHT/Madden-Draft-Generator/releases/latest)**

![The 2010 draft class with spoilers off — every overall, dev trait and attribute hidden](docs/screenshots/board-hidden.png)

*A class opens blind. Every overall, dev trait and attribute reads `?` until you decide otherwise —
so you can scout and draft a year you already know the answers to.*

## Install

1. Download the **Setup** `.exe` from the link above and run it. (There's also a portable `.exe`
   that runs without installing.)
2. Windows will warn you the app is unrecognised — click **More info → Run anyway**. The app isn't
   code-signed, which is what triggers that.
3. Launch **Madden 27 Draft Class Generator** from the Start menu.

The first launch takes a few minutes while the app downloads its NFL data. Classes you generate
before it finishes are marked *degraded* — regenerate them once it's ready.

The app updates itself. When a new version is out it downloads in the background and installs on
restart.

## Using it

1. **Pick a draft year.** Every year from 1936 to 2026.
2. **Look through the class** — overall, position, college, career value, and all 54 Madden
   attributes for every player.
3. **Change anything you want.** Attributes, height and weight, jersey number, face, equipment,
   name. Undo and redo are there if you go too far.
4. **Export → Save to Madden Saves.** It writes the class straight into Madden's folder for you.
5. In Madden: **Franchise → Choose Draft Class**, and pick the year.

## What it looks like

![The same class with spoilers on, sorted by dev trait](docs/screenshots/board-revealed.png)

*Tick **Spoilers** and the board fills in: overalls, Madden's own dev-trait badges, career value and
all 54 attributes. Here 1998 is sorted by dev trait — Peyton Manning, Charles Woodson, Randy Moss,
Alan Faneca and London Fletcher come out as the X-Factors.*

![A player profile with ratings radar, persona DNA, appearance and equipment](docs/screenshots/player-profile.png)

*Every player opens into a card you can edit — attributes, bio, position, dev trait, persona DNA,
face and equipment. Changes save automatically and apply to the exported `.mdc`.*

## What it does

**The whole draft, not just the first round.** 32,140 players across 91 drafts. When a year has more
players than Madden's 402 slots — 1987 had 554 — you're shown exactly who didn't make the cut, and
you can pull any of them back in.

**Ratings that mean something.** A player's overall comes from what he actually did over his career,
not from a guess. Attributes follow the real spread for his position, and combine numbers are scored
against others who played there. The overall you see is the overall Madden shows after import.

**Real faces and real photographs.** 2,803 players get an actual in-game head scan. 8,101 more have
a real photograph pulled from Madden discs going back to 2001. Everyone else gets a generic face
picked to match his own photo — hair, facial hair and skin tone.

**Blind scouting.** A class starts with every overall, dev trait and attribute hidden, so you can
scout and draft without knowing who turns into a Hall of Famer. Tick **Spoilers** when you want to
see. Hidden columns can't be sorted by, either.

**Two ways to rate a class.** *Realistic* rates players the way a draft board would have seen them at
the time, with a slider for how much hindsight to allow. *Career* rates them purely on how they
turned out.

**Custom classes.** Build an all-time draft, a decade, or apply your own modifiers instead of taking
a single year as-is.
