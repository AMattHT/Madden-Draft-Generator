"""Import Madden 27's own gear icons into the equipment builder.

Inputs, both exported from the MMC Frosty Editor:
  * the Vanity image library as DDS, one <AssetId>.dds per icon
    (Tools > Portrait Manager > Image Library Manager > Export Image Library with
    content/ui/ImageAssetLibraries/maddenid/Vanity/assetlibrary_vanity_brt selected);
  * that same assetlibrary_vanity_brt asset as XML (its AssetMetaList maps
    AssetName -> AssetId).

What it does to data/gear (run AFTER scripts/import-gear-sprites.ts, which
regenerates the atlas from the Suite and would drop these additions):
  * every standard gear icon (vnty_nflgear_*, vnty_styles_*, the standard
    backplate) is written to gear-sprites/<texture>.png at 256px, replacing the
    Suite's copy of the same name;
  * atlas entries without a picture get one when the game has it, the drawn
    shoulder-pad placeholders are replaced by the game's pad-size icons;
  * gear items in data/lookups/m27-gear-items.json that the atlas lacks are added
    to their category (label from the asset name, facemask family from its
    prefix) when the game has an icon for them. Items without an icon are listed.

    python scripts/import-m27-gear-icons.py <vanityDdsDir> <assetlibrary_vanity_brt.xml>
"""
import json
import os
import re
import sys

from PIL import Image

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEAR = os.path.join(SERVER, 'data', 'gear')
SPRITES = os.path.join(GEAR, 'gear-sprites')
ATLAS = os.path.join(GEAR, 'gear-atlas.json')
ITEMS = os.path.join(SERVER, 'data', 'lookups', 'm27-gear-items.json')
SIZE = 256

# Atlas category -> item-catalog category (only categories the builder draws from the atlas).
ATLAS_TO_ITEMS = {
    'helmets': 'helmets', 'facemasks': 'facemasks', 'visors': 'visors', 'gloves': 'gloves', 'shoes': 'shoes',
    'armSleeves': 'armSleeves', 'elbowGear': 'elbowGear', 'wristGear': 'wristGear', 'thighPads': 'thighPads',
    'kneePads': 'kneePads', 'spats': 'spats', 'towels': 'towels', 'mouthpieces': 'mouthpieces',
    'neckpads': 'neckpads', 'guardianCaps': 'guardianCaps', 'shoulderPads': 'shoulderPads', 'eyepaint': 'eyepaint',
}
# Loadout values the builder offers from code; their icons are found by name.
SYNTHETIC = [
    'Gear_JerseyStyle_SleeveStandard', 'Gear_JerseyStyle_SleeveTight',
    'Gear_Socks_Low', 'Gear_Socks_Mid', 'Gear_Socks_High', 'Gear_Socks_Under', 'Gear_Socks_Wrinkle_High', 'Gear_Socks_Wrinkle_Mid',
    'Backplate_Standard', 'Flakjacket_On', 'Undershirt_Untucked', 'Handwarmer_Standard',
    'HandwarmerStyle_Back', 'HandwarmerStyle_Front', 'GearPants_Tapered', 'GearPants_Standard',
    'Waist_PlaycallSheet_Black', 'Waist_PlaycallSheet_White', 'Waist_PlaycallSheet_TeamColor',
]
PAD_ICON = {'Small_Pads': 'vnty_styles_padsizes_small_pads', 'Medium_Pads': 'vnty_styles_padsizes_medium_pads',
            'Large_Pads': 'vnty_styles_padsizes_large_pads', 'XLarge_Pads': 'vnty_styles_padsizes_xlarge_pads'}
FAMILY = [
    ('f7pro', re.compile(r'F7Pro', re.I)), ('f7', re.compile(r'F7', re.I)), ('speedflex', re.compile(r'SpeedFlex', re.I)),
    ('revospeed', re.compile(r'RevoSpeed', re.I)), ('axiom', re.compile(r'Axiom', re.I)),
    ('viciszero2', re.compile(r'VicisZero2', re.I)), ('viciszero1', re.compile(r'Vicis', re.I)),
    ('vengeancez10', re.compile(r'VengeanceZ10', re.I)), ('vengeance', re.compile(r'Vengeance', re.I)),
    ('xenithorbit', re.compile(r'XenithOrbit', re.I)), ('xenith', re.compile(r'Xenith', re.I)),
    ('riddell360', re.compile(r'Riddell360', re.I)), ('vintage', re.compile(r'Vintage', re.I)), ('light', re.compile(r'^GearFaceMask_Light', re.I)),
]
COLOR = {'black': 'Black', 'white': 'White', 'teamcolor': 'Team', 'secondarycolor': 'Secondary', 'secondary': 'Secondary',
         'offwhite': 'Off White', 'team': 'Team'}
PREFIX = re.compile(r'^(GearFaceMask_|GearHand_glove_|GearHand_|GearFootwear_shoe_(?:low|mid|high)_|GearFootwear_|shoe_(?:low|mid|high)_|Shoe_(?:Low|Mid|High)_|'
                    r'GearArmSleeve_|ElbowGear_|GearWrist_armgear_|GearWrist_|ThighPad_|KneePad_|GearSpats_spat|GearSpats_|Towel_|GearMouthpiece_|'
                    r'GearNeckpad_|GuardianCap_|Backplate_|GearHelmet_|GearVisor_visor|GearVisor_|EyeBlack_|FaceMarks_)')


def label_for(asset: str) -> str:
    stem = PREFIX.sub('', asset)
    color = ''
    m = re.search(r'_(Black|White|TeamColor|SecondaryColor|Secondary|OffWhite|black|white|teamColor|secondaryColor)$', stem)
    if m:
        color = COLOR.get(m.group(1).lower(), m.group(1))
        stem = stem[: m.start()]
    stem = re.sub(r'(?i)revo_?speed', 'RevoSpeed', stem)
    stem = re.sub(r'([a-z])(\d)', r'\1 \2', stem)  # Adizero11 -> Adizero 11
    stem = re.sub(r'(\d)([A-Za-z])', r'\1 \2', stem)  # 3Bar -> 3 Bar, 7FG -> 7 FG
    words = re.sub(r'([a-z0-9])([A-Z])', r'\1 \2', stem.replace('_', ' ')).split()
    words = [w[:1].upper() + w[1:] for w in words if w]
    words = [{'Lb': 'LB', 'Rb': 'RB', 'Qb': 'QB', 'Wr': 'WR', 'Fg': 'FG', 'Revo': 'Revo Speed'}.get(w, w) for w in words]
    text = ' '.join(words) or asset
    height = re.search(r'shoe_(low|mid|high)_', asset, re.I)
    if height:
        text += ' ' + height.group(1).capitalize()
    return f'{text} - {color}' if color else text


def family_for(asset: str) -> str:
    for fam, rx in FAMILY:
        if rx.search(asset):
            return fam
    return 'universal'


_by_suffix: dict = {}
# Helmets the game has no icon of their own for: the facemask icons render the
# mask on that helmet's shell, so the plain mask of the family shows the helmet.
FALLBACK_ICON = {
    'GearHelmet_SchuttVeng': 'vnty_nflgear_GearFaceMask_Vengeance3Bar',  # Vengeance shell, 3-bar mask
    'GearHelmet_v_DOD_PumpkinDefender': 'vnty_dayofthedead_GearFaceMask_PumpkinDefender',  # Day of the Dead pumpkin shell
}


def icon_name(asset: str, names: dict) -> str | None:
    """The library texture for an asset: nflgear first, then any event library
    (vnty_maddenween_GearHelmet_PumpkinDefender, vnty_zerochill2025_GearHelmet_SnowmanEvader)."""
    for cand in (PAD_ICON.get(asset), FALLBACK_ICON.get(asset), f'vnty_nflgear_{asset}', f'vnty_styles_eyepaint_facetape_{asset}', f'vnty_standardbackplate_{asset}'):
        if cand and cand in names:
            return cand
    if not _by_suffix:
        for n in names:
            m = re.match(r'vnty_[a-z0-9]+_(.+)$', n)
            if m:
                _by_suffix.setdefault(m.group(1).lower(), n)
    return _by_suffix.get(asset.lower()) or _by_suffix.get(f'gearhelmet_{asset[len("GearHelmet_v_"):]}'.lower() if asset.startswith('GearHelmet_v_') else '')


def main() -> None:
    if len(sys.argv) < 3:
        sys.exit('usage: import-m27-gear-icons.py <vanityDdsDir> <assetlibrary_vanity_brt.xml>')
    dds_dir, brt = sys.argv[1], sys.argv[2]
    text = open(brt, encoding='utf-8-sig').read()
    names = {}
    for name, aid in re.findall(r'<field name="AssetName">[^<]*/([^<]+)</field>\s*<field name="AssetId">(\d+)</field>', text):
        names.setdefault(name, int(aid))
    print(f'{len(names)} icons in the vanity library table')

    atlas = json.load(open(ATLAS, encoding='utf8'))
    items = json.load(open(ITEMS, encoding='utf8'))['categories']
    os.makedirs(SPRITES, exist_ok=True)
    written = set()

    def convert(tex: str) -> str | None:
        src = os.path.join(dds_dir, f'{names[tex]}.dds')
        if not os.path.exists(src):
            return None
        dst = os.path.join(SPRITES, f'{tex}.png')
        if tex not in written:
            im = Image.open(src).convert('RGBA')
            im.thumbnail((SIZE, SIZE), Image.LANCZOS)
            im.save(dst, optimize=True)
            written.add(tex)
        return f'{tex}.png'

    pictured = added = 0
    no_icon = []
    for category, entries in atlas.items():
        if not isinstance(entries, list):
            continue
        have = set()
        for e in entries:
            if not e.get('value'):
                continue
            have.add(e['value'])
            tex = icon_name(e['value'], names)
            if tex and (not e.get('image') or e['image'].startswith('drawn_') or e['image'] == f'{tex}.png'):
                png = convert(tex)
                if png:
                    if not e.get('image') or e['image'].startswith('drawn_'):
                        pictured += 1
                    e['image'] = png
        for asset in items.get(ATLAS_TO_ITEMS.get(category, ''), []):
            if asset in have or asset.endswith('_None') or asset.endswith('_none') or asset == 'GearVisor_None':
                continue
            tex = icon_name(asset, names)
            png = convert(tex) if tex else None
            if not png:
                no_icon.append(f'{category}/{asset}')
                continue
            entry = {'value': asset, 'label': label_for(asset), 'image': png}
            if category == 'facemasks':
                entry['compatibility'] = family_for(asset)
            entries.append(entry)
            added += 1
        entries.sort(key=lambda e: e.get('label', ''))

    for asset in SYNTHETIC:
        tex = icon_name(asset, names)
        if tex:
            convert(tex)
    for f in os.listdir(SPRITES):
        if f.startswith('drawn_'):
            os.remove(os.path.join(SPRITES, f))

    atlas['_meta'] = {**atlas.get('_meta', {}), 'm27Icons': f'{len(written)} icons from the Madden 27 vanity library (scripts/import-m27-gear-icons.py)'}
    json.dump(atlas, open(ATLAS, 'w', encoding='utf8'), indent=1)
    print(f'wrote {len(written)} icons at {SIZE}px; {pictured} atlas entries gained a picture; {added} items added to the atlas')
    if no_icon:
        print(f'{len(no_icon)} catalog items have no icon in the game and were not added:')
        for n in no_icon:
            print('  ' + n)


if __name__ == '__main__':
    main()
