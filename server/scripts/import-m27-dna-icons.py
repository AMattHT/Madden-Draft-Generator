"""Import Madden 27's persona DNA trait icons for the player profile.

Input: a folder exported from the MMC Frosty Editor (Tools > Portrait Manager >
Image Library Manager > Export Image Library) holding the persona / DNA trait
icons as DDS or PNG, one file per icon. Optionally the library's XML
(AssetMetaList: AssetName -> AssetId) when the files are named by numeric id.

Output: data/dna-icons/<TraitName>.png at 128px, one per trait in the game's
persona enum (TeamFirst, Calculated, Contractminded, ...). The API serves them at
/api/portrait/dna-icon/<TraitName>; a trait without a file gets a drawn tile.

Matching: the file (or AssetName) is normalised to letters only and compared
with the trait names the same way, so "dna_team_first", "TeamFirst_icon" and
"Team-First" all land on TeamFirst. Anything that does not match is listed so
the mapping can be finished by hand (rename the file and run again).

    python scripts/import-m27-dna-icons.py <iconDir> [assetlibrary_xml]
"""
import os
import re
import sys
import xml.etree.ElementTree as ET

from PIL import Image

SERVER = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(SERVER, 'data', 'dna-icons')
SIZE = 128

TRAITS = [
    'TeamFirst', 'WinAtAllCosts', 'Diva', 'FamilyFocused', 'Mentor', 'StudentOfTheGame', 'Accountable', 'Aggressive',
    'Ambitious', 'Approachable', 'Assertive', 'Calculated', 'Cerebral', 'Charismatic', 'Collaborative',
    'OverlyCompetitive', 'Composed', 'Confident', 'Conscientious', 'Contractminded', 'Curious', 'Demanding',
    'Diplomatic', 'Direct', 'Disciplined', 'Emotional', 'Empathetic', 'Expressive', 'Flexible', 'Focused', 'Frugal',
    'Grounded', 'Guarded', 'Headstrong', 'Independent', 'Inquisitive', 'Intense', 'Leader', 'Loyal', 'Mindful',
    'Observant', 'Opportunistic', 'Outspoken', 'Passionate', 'Patient', 'Pragmatic', 'Principled', 'Private',
    'Reliable', 'Reserved', 'Resilient', 'Respectful', 'Savvy', 'Selfless', 'Sensitive', 'Serious', 'Stoic',
    'Strategic', 'Stubborn', 'Transparent', 'Uncompromising', 'Unpredictable', 'Wary',
]
# Spellings the game's asset names might use that differ from the enum.
ALIASES = {
    'contractminded': 'Contractminded', 'contractmind': 'Contractminded', 'studentofgame': 'StudentOfTheGame',
    'overcompetitive': 'OverlyCompetitive', 'familyfocus': 'FamilyFocused', 'winatallcost': 'WinAtAllCosts',
}

norm = lambda s: re.sub(r'[^a-z]', '', s.lower())
BY_NORM = {norm(t): t for t in TRAITS}
BY_NORM.update({k: v for k, v in ALIASES.items()})


def strip_prefixes(stem: str) -> str:
    # e.g. "ui_persona_icon_teamfirst_lg" -> "teamfirst"
    s = norm(stem)
    for p in ('uipersona', 'personadna', 'persona', 'dnaicon', 'dna', 'trait', 'icon', 'ui'):
        if s.startswith(p):
            s = s[len(p):]
    for suf in ('icon', 'lg', 'sm', 'large', 'small', 'brt'):
        if s.endswith(suf) and len(s) > len(suf) + 3:
            s = s[: -len(suf)]
    return s


def trait_for(stem: str):
    s = strip_prefixes(stem)
    if s in BY_NORM:
        return BY_NORM[s]
    # a trait name embedded in a longer asset name
    hits = [t for n, t in BY_NORM.items() if n and n in s]
    if len(hits) == 1:
        return hits[0]
    if len(hits) > 1:
        return max(hits, key=len)
    return None


def names_from_xml(path: str):
    """AssetId -> AssetName from an exported assetlibrary XML."""
    out = {}
    try:
        root = ET.parse(path).getroot()
    except Exception as e:  # noqa: BLE001
        print(f'could not parse {path}: {e}')
        return out
    for el in root.iter():
        name = el.attrib.get('AssetName') or el.findtext('AssetName')
        aid = el.attrib.get('AssetId') or el.findtext('AssetId')
        if name and aid:
            out[str(aid)] = name
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    src = sys.argv[1]
    id_names = names_from_xml(sys.argv[2]) if len(sys.argv) > 2 else {}
    os.makedirs(OUT, exist_ok=True)
    written, unmatched = {}, []
    for f in sorted(os.listdir(src)):
        stem, ext = os.path.splitext(f)
        if ext.lower() not in ('.dds', '.png', '.jpg', '.jpeg', '.tga', '.webp'):
            continue
        label = id_names.get(stem, stem)
        trait = trait_for(label)
        if not trait:
            unmatched.append(f'{f} ({label})' if label != stem else f)
            continue
        try:
            im = Image.open(os.path.join(src, f)).convert('RGBA')
        except Exception as e:  # noqa: BLE001
            unmatched.append(f'{f}: {e}')
            continue
        im.thumbnail((SIZE, SIZE), Image.LANCZOS)
        canvas = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        canvas.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
        dest = os.path.join(OUT, f'{trait}.png')
        canvas.save(dest, optimize=True)
        written[trait] = f
    print(f'wrote {len(written)} icons to {OUT}')
    missing = [t for t in TRAITS if t not in written and t != 'WinAtAllCosts']
    if missing:
        print(f'traits still without an icon ({len(missing)}): {", ".join(missing)}')
    if unmatched:
        print(f'files not matched to a trait ({len(unmatched)}):')
        for u in unmatched:
            print('  ' + u)


if __name__ == '__main__':
    main()
