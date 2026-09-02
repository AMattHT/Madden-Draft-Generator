"""Import Madden 27 menu portraits exported from the game (MMC Frosty Editor,
Tools > Portrait Manager > Image Library Manager > Export Image Library on
content/ui/ImageAssetLibraries/global/Portraits/PlayerPortraits/assetlibrary_playerportraits_brt)
into the app's portrait pack.

The export is one <portraitPID>.dds (512x512 BC7) per portrait. For each:
  * PID already in PID_Portrait_Mapping.csv -> fill data/portraits/<plpo>.jpg if
    the pack lacks it (the Suite atlas never had those).
  * PID unknown to the mapping (new since the Suite's Madden 26 atlas: the 2026
    rookies and other new faces) -> data/portraits/plpo_m27_<pid>.jpg plus a new
    mapping row, named from the Madden 27 player table (m27-face-assets.json)
    when the PID is known there.

Pack format matches scripts/build-portrait-pack.ts: 128x128 JPEG q78. The DDS
has a transparent background; it is flattened onto the pack's background colour.

    python scripts/import-m27-portraits.py <exportDir>
    python scripts/import-m27-portraits.py --names <xmlDir>

The second form reads the XML export of the same library's textures
(content/ui/ImageAssetLibraries/global/Portraits/PlayerPortraits/assets, EBX to
XML): each ImageLibraryTexture carries its AssetIdList, i.e. the portrait PID.
Rows the first form named plpo_m27_<pid> are renamed to the game's own plpo_*
asset name (pack file included) when that name is free, and blank player names
are filled from the asset name (LastFirst -> "First Last", a best-effort split).
"""
import csv
import json
import os
import re
import sys

from PIL import Image

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(SERVER, 'data', 'portraits')
MAPPING = os.path.join(SERVER, 'data', 'lookups', 'PID_Portrait_Mapping.csv')
FACES = os.path.join(SERVER, 'data', 'lookups', 'm27-face-assets.json')
SIZE, QUALITY = 128, 78


def title_name(key: str) -> str:
    return ' '.join(w[:1].upper() + w[1:] for w in key.split())


SUFFIX = re.compile(r'[-_](?:[a-z]{1,4}|[A-Z]{2,4})$')  # position disambiguators: plpo_AllenJosh-qb, plpo_JonesMatt_WILL
CAMEL = re.compile(r"[A-Z]+(?=[A-Z][a-z])|[A-Z][a-z']+|[A-Z]+|[a-z']+")


def name_from_asset(asset: str) -> str:
    """plpo_AbneyIIKeith -> 'Keith Abney II'. Empty when the asset is all one case
    (no way to split it) so a blank stays blank rather than wrong."""
    stem = SUFFIX.sub('', asset[5:] if asset.startswith('plpo_') else asset)
    if stem.lower() == stem or stem.upper() == stem:
        return ''
    # Hyphenated surnames (Al-ShaairAzeez, St-JusteMarcus): every chunk but the
    # last is surname, plus the first camel token of the last chunk.
    chunks = stem.split('-')
    parts = CAMEL.findall(chunks[-1])
    if len(parts) < 2:
        return ''
    # Particles that camel-splitting separates from the surname (McCaffrey, OConnell, VanNoy).
    particles = {'Mc', 'Mac', 'O', 'De', 'Di', 'Da', 'Van', 'Von', 'La', 'Le', 'St', 'Del', 'DeLa', 'Dela'}
    while len(parts) > 2 and parts[0] in particles:
        parts[0:2] = [parts[0] + parts[1]]
    suffixes = {'II', 'III', 'IV', 'Jr', 'Sr'}
    last, rest = '-'.join(chunks[:-1] + [parts[0]]), parts[1:]
    tail = [p for p in rest if p in suffixes]
    first = [p for p in rest if p not in suffixes]
    return ' '.join(first + [last] + tail)


def names_mode(xml_dir: str) -> None:
    with open(MAPPING, encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)
    id_to_asset, asset_ids = {}, {}
    for fname in os.listdir(xml_dir):
        if not fname.endswith('.xml') or 'assetlibrary' in fname:
            continue
        text = open(os.path.join(xml_dir, fname), encoding='utf-8-sig').read()
        if 'type="ImageLibraryTexture"' not in text:
            continue
        m = re.search(r'<field name="Name">([^<]+)</field>', text)
        ids = [int(i) for i in re.findall(r'<item>(\d+)</item>', text)]
        if not m or not ids:
            continue
        asset = m.group(1).rsplit('/', 1)[1]
        asset_ids[asset.lower()] = ids
        for pid in ids:
            id_to_asset.setdefault(pid, asset)
    rows_by_name = {}
    for r in rows:
        rows_by_name.setdefault(r['Portrait'].strip().lower(), []).append(r)

    def move(src_key: str, dst_key: str) -> None:
        src = os.path.join(PACK, f'{src_key}.jpg')
        if os.path.exists(src):
            os.replace(src, os.path.join(PACK, f'{dst_key}.jpg'))

    renamed = shared = displaced = named = 0
    for r in rows:
        if not r['Portrait'].startswith('plpo_m27_'):
            continue
        pid = int(r['PID'])
        asset = id_to_asset.get(pid)
        if not asset:
            continue
        holders = [h for h in rows_by_name.get(asset.lower(), []) if h is not r]
        if not holders:
            move(r['Portrait'], asset)
            renamed += 1
        elif any(int(h['PID']) in asset_ids[asset.lower()] for h in holders):
            # The game's texture serves the old id too: one image, two ids. Share
            # the existing pack file and drop the duplicate.
            dup = os.path.join(PACK, f"{r['Portrait']}.jpg")
            if os.path.exists(dup):
                os.remove(dup)
            shared += 1
        else:
            # The game reuses the name for a different portrait and no longer has
            # the old id: the old (Madden 26) art keeps serving its own id under
            # <name>_<oldpid>; the game's name goes to the id the game gives it.
            for h in holders:
                move(h['Portrait'].strip(), f"{asset}_{h['PID']}")
                h['Portrait'] = f"{asset}_{h['PID']}"
            move(r['Portrait'], asset)
            displaced += 1
        rows_by_name.setdefault(asset.lower(), []).append(r)
        r['Portrait'] = asset
        if not r['Player Name'].strip():
            guess = name_from_asset(asset)
            if guess:
                r['Player Name'] = guess
                named += 1
    with open(MAPPING, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f'{len(id_to_asset)} portrait ids named by the XML export; renamed {renamed} rows to the game asset name, '
          f'{shared} share an existing portrait (same texture, two ids), {displaced} displaced an older Madden 26 '
          f'portrait to <name>_<pid>, filled {named} blank player names')


def main() -> None:
    if len(sys.argv) > 2 and sys.argv[1] == '--names':
        if not os.path.isdir(sys.argv[2]):
            sys.exit('usage: import-m27-portraits.py --names <xmlDir>')
        names_mode(sys.argv[2])
        return
    export = sys.argv[1] if len(sys.argv) > 1 else None
    if not export or not os.path.isdir(export):
        sys.exit('usage: import-m27-portraits.py <exportDir>')

    with open(MAPPING, encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        fields = reader.fieldnames
        rows = list(reader)
    by_pid = {int(r['PID']): r for r in rows if r['PID'].strip().isdigit()}

    faces = json.load(open(FACES, encoding='utf8'))['players']
    pid_name, pid_asset = {}, {}
    for name, v in faces.items():
        pid = v.get('portraitPid')
        if isinstance(pid, int) and pid not in pid_name:
            pid_name[pid] = title_name(name)
            pid_asset[pid] = v.get('assetName') or ''

    # Background: sample an existing pack image's corner so new tiles match.
    bg = (0, 0, 0)
    for f in sorted(os.listdir(PACK)):
        if f.endswith('.jpg'):
            bg = Image.open(os.path.join(PACK, f)).convert('RGB').getpixel((1, 1))
            break

    def write(pid: int, key: str) -> None:
        im = Image.open(os.path.join(export, f'{pid}.dds')).convert('RGBA')
        flat = Image.new('RGB', im.size, bg)
        flat.paste(im, mask=im.getchannel('A'))
        flat.resize((SIZE, SIZE), Image.LANCZOS).save(os.path.join(PACK, f'{key}.jpg'), quality=QUALITY)

    filled = added = skipped = 0
    new_rows = []
    for fname in sorted(os.listdir(export), key=lambda s: int(s[:-4]) if s[:-4].isdigit() else -1):
        if not fname.endswith('.dds') or not fname[:-4].isdigit():
            continue
        pid = int(fname[:-4])
        row = by_pid.get(pid)
        if row:
            plpo = row['Portrait'].strip()
            if not plpo or plpo == 'plpo_Blank' or os.path.exists(os.path.join(PACK, f'{plpo}.jpg')):
                skipped += 1
                continue
            write(pid, plpo)
            filled += 1
        else:
            key = f'plpo_m27_{pid}'
            write(pid, key)
            new_rows.append({
                'PID': str(pid),
                'Player Name': pid_name.get(pid, ''),
                'Type': 'player',
                'Portrait': key,
                'PAM': pid_asset.get(pid, ''),
                'Race': '',
            })
            added += 1

    if new_rows:
        with open(MAPPING, 'w', encoding='utf-8-sig', newline='') as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            for r in sorted(rows + new_rows, key=lambda r: int(r['PID']) if r['PID'].strip().isdigit() else 1 << 30):
                w.writerow(r)

    named = sum(1 for r in new_rows if r['Player Name'])
    print(f'filled {filled} mapped portraits the pack lacked, added {added} new PIDs ({named} with a name), {skipped} already present')


if __name__ == '__main__':
    main()
