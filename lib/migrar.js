// Aplica o esquema do banco automaticamente quando o código muda (sem precisar abrir /api/setup).
// A versão é o hash do SQL; cada instância confere uma vez.
import crypto from 'node:crypto';
import { sql, bancoConfigurado } from './db.js';
import { SCHEMA_SQL } from './schema.js';
import { semearTime } from './semente.js';

export const VERSAO_ESQUEMA = crypto.createHash('sha1').update(SCHEMA_SQL).digest('hex').slice(0, 12);
const g = globalThis;

export async function garantirEsquema() {
  if (!bancoConfigurado()) return;
  if (g.__esquemaOk === VERSAO_ESQUEMA) return;
  g.__esquemaPromessa ??= (async () => {
    let atual = null;
    try {
      [atual] = await sql`select valor from config where chave = 'schema_versao'`;
    } catch { /* banco vazio */ }
    if (atual?.valor !== VERSAO_ESQUEMA) {
      await sql.unsafe(SCHEMA_SQL);
      await sql`insert into config values ('schema_versao', ${VERSAO_ESQUEMA}) on conflict (chave) do update set valor = excluded.valor`;
      await semearTime(sql);
    }
    g.__esquemaOk = VERSAO_ESQUEMA;
  })().finally(() => { g.__esquemaPromessa = null; });
  return g.__esquemaPromessa;
}
