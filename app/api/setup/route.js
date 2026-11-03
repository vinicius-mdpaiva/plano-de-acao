import { sql, bancoConfigurado } from '../../../lib/db.js';
import { SCHEMA_SQL } from '../../../lib/schema.js';
import { VERSAO_ESQUEMA } from '../../../lib/migrar.js';
import { semearTime } from '../../../lib/semente.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Cria (ou atualiza) as tabelas. Acesse uma vez após o deploy:
// https://SEU-PROJETO.vercel.app/api/setup?token=SEU_WEBHOOK_SECRET
export async function GET(req) {
  const token = new URL(req.url).searchParams.get('token');
  if (!process.env.WEBHOOK_SECRET || token !== process.env.WEBHOOK_SECRET) {
    return Response.json({ ok: false, motivo: 'token inválido' }, { status: 401 });
  }
  if (!bancoConfigurado()) {
    return Response.json({ ok: false, motivo: 'DATABASE_URL não encontrada: conecte o banco Neon ao projeto na Vercel' }, { status: 500 });
  }
  try {
    await sql.unsafe(SCHEMA_SQL);
    await sql`insert into config values ('schema_versao', ${VERSAO_ESQUEMA}) on conflict (chave) do update set valor = excluded.valor`;
    const criados = await semearTime(sql);
    const [{ usuarios }] = await sql`select count(*)::int as usuarios from usuarios`;
    const [{ negocios }] = await sql`select count(*)::int as negocios from negocios`;
    return Response.json({ ok: true, mensagem: 'Banco pronto.', acessosCriados: criados, usuarios, negocios });
  } catch (e) {
    return Response.json({ ok: false, motivo: String(e?.message ?? e) }, { status: 500 });
  }
}
