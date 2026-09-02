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
"""
import csv
import json
import os
import sys

from PIL import Image

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACK = os.path.join(SERVER, 'data', 'portraits')
MAPPING = os.path.join(SERVER, 'data', 'lookups', 'PID_Portrait_Mapping.csv')
FACES = os.path.join(SERVER, 'data', 'lookups', 'm27-face-assets.json')
SIZE, QUALITY = 128, 78


def title_name(key: str) -> str:
    return ' '.join(w[:1].upper() + w[1:] for w in key.split())


def main() -> None:
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
