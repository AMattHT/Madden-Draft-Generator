# Changelog

## 1.0.8

**Fifty more faces checked.** The second pass through the players whose
appearance the app was least sure about: seventeen were wrong, including Mike
Wagner, Bill Bradley and Carl Ekern the light way, and Brig Owens, Emerson
Boozer, Fred Carr and William Roberts the dark way. 208 players now have a
recorded appearance rather than an estimated one.

## 1.0.7

**Segregation-era classes are historically correct.** The NFL had no black
players between 1934 and 1945, so those draft classes no longer contain any —
including the invented prospects used to pad them out to a full board. Eight
real players were affected, all of them mismeasured from dim vintage
photographs.

**Fifty more faces checked by hand.** The players whose appearance the app was
least sure about, weighted by how prominent they are, were reviewed against the
record — sixteen were wrong and are now fixed, among them Dick Anderson, Mark
Gastineau, Jim Kiick, Ray Childress, Dwight White and Mike Garrett. The
thirty-four already right are recorded too, so they cannot drift later.

## 1.0.6

**Hall of Famers look like themselves.** Two thirds of the players in the
database have no photograph anywhere the app can reach — no in-game portrait, no
Madden-disc headshot, no Wikipedia picture — so their appearance is estimated
from what players at that position looked like in that era. For an individual
that estimate is a coin toss weighted by the decade, and it landed wrong in both
directions: Bob Hayes came out white, Paul Krause came out black. The 108 Hall
of Famers it could not get right are now recorded rather than guessed. Everyone
else is still estimated, and you can always set a face yourself under *Edit
appearance*.

## 1.0.5

**Blank headshots are fixed.** 1.0.4 tried to give players their own in-game
portrait and asked the wrong question to decide whether it could: it checked
whether the app had the picture, not whether Madden 27 had it. The game draws a
blank NFL shield for an id it does not know, so classes came back with rows of
empty portraits. Players Madden 27 has no portrait for go back to a matched
generic face, which is the best the game can actually draw.

**The update prompt is a corner card.** It spanned the width of the window
before, which read as a page-level bar and covered the last row of the board.
It now sits in the bottom-right, out of the way of the class you are reading,
and shows its buttons only once there is something to decide.

## 1.0.4

**Players wear their own faces in the game.** A player with a real head scan
but no portrait id fell back to a generic portrait matched only on skin tone —
the right body under a stranger's face. Madden ships those portraits; nothing
was asking for them. The 2011 class goes from 14 real portraits to 234, and
every class since about 2000 gains a similar share.

**Two players who share a name each get their own photograph.** The disc
headshots were filed by name, and the earliest disc won — so a 2008 safety
called Cam Newton held the name and the 2011 quarterback, who is on six discs,
had no photo at all. 343 names were hiding a second player like this. The
collection grows from 8,101 photographs to 8,452, and skin tone is now read
from the right man's picture.

**Fullbacks are fullbacks.** The draft records file them under halfback — Kyle
Juszczyk among them — and Madden rates the two positions differently.

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
