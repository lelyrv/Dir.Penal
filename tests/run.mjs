// Executa todas as suítes em sequência e resume. Uso:  node tests/run.mjs [static|timer|layout|a11y|pages|features|offline]
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const ALL = ['static', 'timer', 'layout', 'a11y', 'pages', 'features', 'offline'];
const want = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const results = [];
for (const name of want) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, name + '.test.mjs')], { stdio: 'inherit', cwd: path.join(dir, '..') });
  results.push([name, r.status === 0, Math.round((Date.now() - t0) / 1000)]);
}
console.log('\n==================== RESUMO ====================');
for (const [n, ok, s] of results) console.log((ok ? 'OK    ' : 'FALHOU') + '  ' + n.padEnd(10) + s + ' s');
const failed = results.filter((r) => !r[1]).length;
console.log(failed ? `\n${failed} suíte(s) falharam.` : '\nTodas as suítes passaram.');
process.exit(failed ? 1 : 0);
