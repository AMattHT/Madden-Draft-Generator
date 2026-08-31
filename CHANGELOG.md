# Changelog

## 1.0.3

**The update prompt is part of the app now.** It used to be a Windows message
box: grey, over a dark window, and modal — it interrupted whatever you were
doing to ask about a download you had not started. Updates now appear as a
banner along the bottom in the app's own styling, with a progress bar while the
new build downloads and a *Restart now* button when it is ready. Declining only
chooses when to restart; the update still installs the next time you quit.

Dismissing is per version, so saying no to one release does not silence the
next. The portable build gets a link to the releases page instead, since it
cannot replace itself.

## 1.0.2

**Madden's dev-trait badges are back.** They were being served from a path one
segment off from the one the app asks for, so every badge quietly fell back to a
drawn mark. Nothing looked broken, which is why it lasted.

**Persona DNA can be edited again.** The *Add* button only appeared when a
player had a free slot, and every generated prospect is given all five — so it
was hidden on every player in a fresh class, leaving what looked like a row of
fixed labels. It now stays visible, says why it is disabled when the slots are
full, and there is a Reset back to the generated traits.

**Sixty-eight players stopped wearing a stranger's face.** A player last seen in
2019 or earlier gets his photo from ESPN, because the NFL's own CDN answers for
those with a silhouette. That trusted the player id in the source data, and a
few of those ids belong to somebody else entirely: the 1984 nose tackle Michael
Carter, born 1960, was showing a photograph of a Michael Carter born in 1991.
Every affected id was checked against its birth year — 10,500 were right, 68 were
not. Those 68 now fall back to their in-game portrait.

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
