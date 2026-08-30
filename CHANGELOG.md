# Changelog

## 1.0.1

**Real player headshots, 2001–2017.** 8,101 photographs pulled off seventeen
Madden discs and matched to the players in every class. The web is weakest
exactly where historical classes need it — the NFL CDN answers with a silhouette
for most retirees — so a portrait now prefers the player's own in-game art, then
his disc headshot, then the web. Across four sample classes 777 of 1,608
thumbnails changed.

**Blind scouting.** A class opens with overall, dev trait, wAV and every
attribute masked; tick *Spoilers* to reveal. Columns you cannot see cannot be
sorted by either, and the player card, the radar and the class summary are
masked with it.

**Madden's own dev-trait badges**, extracted from the game, with the unscouted
mark used for hidden players.

**The whole rating card.** All 54 attributes in the game's own groups, and the
board scrolls sideways to reach them.

### Fixes

- 87 players had their surname split onto the wrong field at import — `Van Noy`,
  `Vander Esch`, `St. Brown`, `Randle El`, and two Hall of Famers. Nothing about
  them matched any other source; now it does.
- 18 undrafted Hall of Famers were being stripped of the flag by a rule that
  reads "no career on file" as "wrong player". True of drafted players, false of
  undrafted ones. Donnie Shell, Warren Moon, Cris Carter, John Randle and more.
- Hall of Fame *coaches* — Flores, Dungy, Cowher — no longer rate as Hall of Fame
  players. The flag is earned by playing.
- 1964 drafted two different Bob Browns; they were sharing one career.
- A 1973 cornerback was being shown the face of a 2011 linebacker with the same
  name. Across six classes, 7.4% of headshot matches were the wrong man.
- Skin tone is read from the player's own disc headshot rather than guessed from
  his position and era, which had made a white receiver dark and a black one
  light.
- Generic faces are matched on hair and facial hair instead of tone alone, and no
  longer repeat as often — two players in one class could draw the same head.
- Undrafted players carried no career at all and rated as if they had never
  played; roughly 1,600 multi-year careers were being ignored.
- Career value estimates recalibrated: average error 8.6 → 6.2, and the
  systematic over-rating of journeymen is gone.
- Drafting teams for every pre-1980 draft now ship with the app. They were
  fetched live, and a single throttled request blanked every team for a year.

## 1.0.0

First release. Historical draft classes, 1936–2026, exported as an importable
`.mdc` for Madden 26 and Madden 27.
