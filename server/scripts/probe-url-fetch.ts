async function main() {
  const url = 'https://static.www.nfl.com/image/private/f_auto,q_auto/league/tb52fk83tmdpmbzwliuk';
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MaddenDraftClassGenerator/0.1',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
    redirect: 'follow',
  });
  const ct = res.headers.get('content-type');
  const buf = Buffer.from(await res.arrayBuffer());
  console.log({ status: res.status, ct, bytes: buf.length });
}
main().catch((e) => { console.error(e); process.exit(1); });
