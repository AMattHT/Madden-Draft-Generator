# Changelog

## Unreleased

### Features

**Class Studio.** A "Create class" button in the top bar opens a full-screen builder: the whole
player pool on the left with headshots, a 402-pick draft board on the right. Add players, drag
them into the order you want, or move one straight to a pick. It replaces the old Hand-picked
option, and classes you saved before open in it as they were.

**Custom players.** Make a prospect who never existed: name, position, college, build, overall,
dev trait and archetype. The app generates his attributes to match and he drafts alongside the
real players.

**By team.** A new source in Draft options: pick a franchise and get its all-time draft, the best
402 players it ever drafted, ranked by career. Relocations and renames stay with the franchise
(the Oilers are Titans picks, the Baltimore Colts are Colts picks); the Browns keep Jim Brown.

### Bug fixes

- Exporting a class saved in the Class Studio no longer fails with "no players picked".

## 1.2.0

### Features

**Launch day ratings.** A new lens that rates rookies exactly how EA did on release day, for 23
classes going back to Madden 2002. Data from maddenratings.net.

**The 2026 class, straight from EA.** Every rookie carries EA's Madden 27 overall, attributes and
dev trait. Downs and Love at 82, six Superstars, no X-Factors, just like the game.

**Equipment Builder.** You can now build out a player's equipment, from helmet and facemask down
to cleats, pants and the waist playcall band.

**Madden 27 rookie portraits.** The 2026 rookies and every other new face in Madden 27 show
their real menu portrait. The face picker has all 262 of the game's generic heads.

**Careers caught up through 2025.** wAV, Pro Bowls and All-Pros are current for everyone drafted
since 1960, so the 2025 class finally has real numbers.

**Smarter young-class dev traits.** X-Factor only comes from awards or a genuine Hall of Fame
pace. Rookies of the Year keep it only if the career backs it up (sorry, Chase Young), kickers
top out at Star, and one or two seasons earn a few Superstars instead of none.

### Bug fixes

- Fifteen 2026 picks had the wrong name. All 257 match the real draft now.
- 196 players were listed at positions Madden 27 no longer plays them at (Heyward and Buckner at
  DT, Ramsey at FS, and so on). They match the roster now, rookies included.
- Thigh pads were split into left and right. The game has one slot, so now we do too.
- Hyphenated names like Smith-Njigba and Vera-Tucker were showing somebody else's face.
- Shaquille Leonard, Kyle Van Noy and about 240 others had no portrait link at all, and 628 more
  export with a generic head when the game has their scan. Both fixed.
- The Oakley Prizm visor showed a clear one, the VICIS Zero1 masks had no helmet in their names,
  and the novelty helmets had no pictures.
- Will Anderson Jr. and 148 other players with Jr/Sr/III in their name get their real face, and
  the two 1964 Bob Browns stop sharing one.

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
