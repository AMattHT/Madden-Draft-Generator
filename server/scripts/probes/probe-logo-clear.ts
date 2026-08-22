import fs from 'fs';
import { LogoService } from '../src/services/LogoService';

async function main() {
  for (const [name, url] of [
    ['oilers', 'https://cdn.ssref.net/req/20230307/tlogo/pfr/oti-1995.png'],
    ['oak', 'https://cdn.ssref.net/req/20230307/tlogo/pfr/rai-1995.png'],
    ['sd', 'https://cdn.ssref.net/req/20230307/tlogo/pfr/sdg-2005.png'],
    ['was', 'https://cdn.ssref.net/req/20230307/tlogo/pfr/was-1991.png'],
    ['colts', 'https://cdn.ssref.net/req/20230307/tlogo/pfr/clt-1983.png'],
  ] as const) {
    const buf = await LogoService.png(url);
    const out = `C:/Users/amatthews/AppData/Local/Temp/${name}-clear.png`;
    fs.writeFileSync(out, buf);
    console.log(name, buf.length, out);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
