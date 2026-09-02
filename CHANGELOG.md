# Changelog

## Unreleased

**Dev traits for recent classes come from awards and production.** For players drafted in the
last eight seasons, X-Factor is earned only by AP awards (MVP, Player of the Year, Rookie of the
Year), two first-team All-Pros, or a top-1% wAV pace over three or more seasons; nobody gets it
from a quota or a draft slot. First-team All-Pro or two Pro Bowls floor a player at Superstar, one
Pro Bowl at Star, and the remaining Superstar and Star slots scale with how many seasons the class
has played. 2023 now carries Stroud, Will Anderson, Smith-Njigba and LaPorta as X-Factors instead
of five leaders of a two-season sample; 2026 has none until its rookies produce. Classes through
2017 are unchanged. Awards come from Wikipedia's AP award tables, baked into the app.

**Launch Day lens.** A third rating lens next to Realistic and Career. Where EA's launch roster
for a class exists (2018–2020, 2022–2023 and 2026), every rookie it names gets the overall and
attributes EA shipped on release day; everyone else, and every other year, is rated as Realistic.
Launch data comes from maddenratings.net's launch-roster spreadsheets, baked into the app.

**2026 draft class fixed.** Fifteen picks carried the wrong name (pick 13 read Will McFadden; it is
Ty Simpson). All 257 picks now match the real draft.

**Namesakes told apart.** Will Anderson Jr. and the other 148 current players whose asset names
carry Jr/Sr/II/III get their real heads and portraits. The two 1964 Bob Browns no longer share a
legends portrait or a drafting team.

## 1.1.0

**Hand-picked draft classes.** Draft options → Hand-picked → Build class… opens a builder over
the whole 1936–2026 pool of 32,140 players. Filter by position, era, league or Hall of Fame; sort
by career, wAV, Pro Bowls, year or draft slot; add players one at a time or "Add all shown" up to
Madden's 402 slots. Name the class, save it, come back to it, and export it as
`CAREERDRAFT-<NAME>`. A short class is padded with generated prospects from the era of your picks
so it imports as a full class.

**The overall is Madden's.** The player card no longer has an Overall box. The rating chip and
the board's OVR column show the overall Madden will compute from the attributes on import, and
they update as you edit. Changing position or archetype still re-solves the attributes so the
player keeps his level.

**Full spreadsheet export.** Export CSV now writes every player with overall, dev trait,
archetype, bio, combine numbers and all 54 attributes, with your edits applied. Opens cleanly in
Excel.

**Faster classes.** A new year no longer waits on photo lookups while it builds; the few players
whose photograph has never been looked up get it on a later visit instead. Neighbouring years are
built in the background, so stepping through drafts with the arrows is instant.

**Faces and dev traits.** Resolved photo lookups now ship with the app instead of being repeated
on every machine. A disc headshot is only used when the disc year matches the player's career, so
retirees stop borrowing a namesake's face. Elite-career X-Factor promotion is capped so an
all-time class still has a Superstar tier.

**The app now lives at github.com/AMattHT/Madden-Draft-Generator.** Existing installs update to
this version automatically.

## 1.0.0

First public release. Turn any real NFL draft from 1936 to 2026 into a class you can import into
Madden 27.

**The whole draft, not the first round.** 32,140 players across 91 drafts. Years with more players
than Madden's 402 slots — 1987 had 554 — show you who did not fit and let you pull any of them back
in.

**Ratings that came from somewhere.** A player's overall comes from what he actually did over his
career rather than a guess, attributes follow the real spread for his position, and combine numbers
are scored against others who played there. The overall you see is the overall Madden shows after
import.

**Blind scouting.** A class opens with every overall, dev trait and attribute hidden, so you can
scout a year you already know the answers to. Tick *Spoilers* when you want to see. Columns you
cannot see cannot be sorted by either.

**Real faces.** 2,803 players get an actual in-game head scan. 8,452 more have a real photograph
pulled from Madden discs going back to 2001. Everyone else gets a generic face picked to match his
own photo — hair, facial hair and skin tone — and 208 players whose appearance could not be
inferred are recorded by hand rather than guessed.

**Everything is editable.** Any attribute, bio field, position, dev trait, persona DNA, face or
equipment slot. Edits save automatically and apply to the exported `.mdc`.

**It updates itself**, and tells you what changed.
