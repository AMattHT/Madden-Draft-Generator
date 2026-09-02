# Changelog

## Unreleased

**Young-class dev traits.** A Rookie of the Year keeps X-Factor only while the career backs it:
from the third season on he needs a top-10% pace, a first-team All-Pro or a second Pro Bowl
(Chase Young is a Superstar now, Lattimore's Pro Bowls keep his). One season on record earns a
quarter of Madden's Superstar quota for the year's best producers and two seasons half, so 2025
has five Superstars instead of one and 2024 twelve. Kickers, punters and snappers stop at Star
on accolades alone.

**Portraits for hyphenated names.** 75 players whose surname carries a hyphen (Smith-Njigba,
Vera-Tucker, Owusu-Koramoah) had their portrait key cut at the hyphen, so thirteen of them showed
some other Smith, Vera or Davis; they now point at their own art. 239 recent players whose row
had no portrait id at all but an exact-name match in the portrait table (Shaquille Leonard,
Kyle Van Noy, Amon-Ra St. Brown) now show their real portrait instead of a generic.

**Careers are current through the 2025 season.** wAV, Pro Bowls, first-team All-Pros, seasons
started and last season now come from nflverse's mirror of Pro Football Reference for every
drafted player since 1960 (1,712 rows updated; the 2025 class no longer reads zero and 2024's
first-year numbers have grown), and `scripts/refresh-career-columns.py` repeats the update after
each season. With a third real season on the books, the pace rule that makes a young player an
X-Factor on production alone now asks for a Hall-of-Fame trajectory (1.35x the position's
elite per-season norm) rather than a bar a dozen third-year starters clear; awards, All-Pros
and the elite rule are unchanged and there is no cap, so a class with more such players keeps
them all.

**Madden 27 rookie portraits.** The 2026 rookies and every other player new to Madden 27 now show
their real menu portrait instead of a generic face: 472 portraits exported from the game's own
image library (via the MMC Frosty Editor's Portrait Manager) join the pack, and 529 portraits the
Madden 26 atlas never carried are filled in for players already mapped. `scripts/import-m27-portraits.py`
rebuilds the pack from a fresh export, and names every new portrait from the game's own asset
names. The Madden 27 face picker now offers all 262 generic heads
the game ships (from its own head-item data), 69 more than its random classes ever used.

**Equipment pictures ship with the app.** The Equipment Builder's thumbnails are now bundled, so
the installed app shows them without a Madden Editor Suite install next to it, and they are the
game's own Madden 27 icons: 698 renders exported from its vanity image library cover every gear
option except three eye-black styles the game itself has no icon for (the pumpkin and snowman
helmets use their event icons; the Schutt Vengeance Pro shows its shell under a plain 3-bar mask). 183 items the Suite atlas never listed (masks, gloves, cleats, sleeves, wristbands) are now
selectable with the game's picture. Names were checked
against the renders and the game's own asset list: the Oakley Prizm visor is now the asset real
rosters wear (the old entry showed a clear visor), the VICIS Zero1 masks are named by helmet, and
45 assets the game assigns but the builder never offered are now selectable with names and
pictures, including the Schutt F7 Pro masks, twelve SpeedFlex and VICIS Zero2 mask styles,
secondary-colour gloves and sleeves, Jordan 5 and Adizero 11 Turbo cleats, wrinkle socks, and an
explicit "None" for arm sleeves, elbows, thigh pads, knee pads and the towel. Seven M27 eye-black
styles borrow the matching M26 render. Matching the game's own Legs tab, thigh pads are now one
choice for both legs (Regular or Honeycomb, no more left and right), shoulder pads come in Small,
Medium, Large and X-Large with a size picture, and the Guardian cap is offered in Madden 27 mode.
Madden 27 mode now accepts every equippable gear item in the game's own item catalog (972
standard items) rather than only the assets its random classes happened to assign, so the
builder offers 857 options in M27 mode instead of 320 (143 facemasks, 125 gloves, 73 cleats).
Two Madden 27 slots are new: Pants (Tapered or Standard) and the Waist playcall band (black, white
or team colour). The band and the handwarmer share one loadout element, as in the game, so picking
one clears the other.

**Dev traits for recent classes come from awards and production.** For players drafted in the
last eight seasons, X-Factor is earned only by AP awards (MVP, Player of the Year, Rookie of the
Year), two first-team All-Pros, or a top-1% wAV pace over three or more seasons; nobody gets it
from a quota or a draft slot. First-team All-Pro or two Pro Bowls floor a player at Superstar, one
Pro Bowl at Star, and the remaining Superstar and Star slots scale with how many seasons the class
has played. 2023 now carries Stroud, Will Anderson, Smith-Njigba and LaPorta as X-Factors instead
of five leaders of a two-season sample; 2026 has none until its rookies produce. Classes through
2017 are unchanged. Awards come from Wikipedia's AP award tables, baked into the app.

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
