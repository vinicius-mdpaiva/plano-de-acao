import crypto from 'node:crypto';
import { sql, bancoConfigurado } from '../../../../lib/db.js';
import { normalizar, gravarNegocios } from '../../../../lib/clint.js';
import { garantirEsquema } from '../../../../lib/migrar.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RESERVADOS = new Set(['token', 'funil', 'gatilho']);

function tokenValido(recebido) {
  const esperado = process.env.WEBHOOK_SECRET ?? '';
  if (!esperado || !recebido) return false;
  const a = Buffer.from(String(recebido)), b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function lerCorpo(req) {
  const tipo = req.headers.get('content-type') ?? '';
  const bruto = await req.text();
  if (!bruto) return {};
  if (tipo.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(bruto));
  try {
    const j = JSON.parse(bruto);
    return Array.isArray(j) ? (j[0] ?? {}) : j;
  } catch {
    return Object.fromEntries(new URLSearchParams(bruto));
  }
}

async function tratar(req, payload) {
  const url = new URL(req.url);
  if (!tokenValido(url.searchParams.get('token'))) {
    return Response.json({ ok: false, motivo: 'token inválido' }, { status: 401 });
  }
  if (!bancoConfigurado()) return Response.json({ ok: false, motivo: 'banco não configurado' }, { status: 500 });
  try { await garantirEsquema(); } catch { /* segue: o insert mostra o erro */ }

  const funil = url.searchParams.get('funil');
  const gatilho = url.searchParams.get('gatilho');
  const [ev] = await sql`insert into clint_eventos (funil, gatilho, payload) values (${funil}, ${gatilho}, ${sql.json(payload)}) returning id`;
  try {
    const dados = normalizar(payload, funil);
    if (!dados.deal_id) {
      await sql`update clint_eventos set erro = 'sem ID do negócio (mapeie o campo deal_id)' where id = ${ev.id}`;
      return Response.json({ ok: true, aviso: 'evento guardado, mas sem ID do negócio' });
    }
    await gravarNegocios(sql, [dados]);
    await sql`update clint_eventos set deal_id = ${dados.deal_id} where id = ${ev.id}`;
    return Response.json({ ok: true, dealId: dados.deal_id });
  } catch (e) {
    await sql`update clint_eventos set erro = ${String(e?.message ?? e).slice(0, 500)} where id = ${ev.id}`;
    // 200 para o Clint não desativar o webhook; o evento bruto ficou guardado
    return Response.json({ ok: false, motivo: 'erro ao processar; evento guardado' });
  }
}

export async function POST(req) {
  return tratar(req, await lerCorpo(req));
}

export async function GET(req) {
  const url = new URL(req.url);
  const payload = {};
  for (const [k, v] of url.searchParams) if (!RESERVADOS.has(k)) payload[k] = v;
  if (Object.keys(payload).length === 0) {
    return Response.json({ ok: true, mensagem: 'Receptor do Clint ativo. Envie os eventos por POST.' });
  }
  return tratar(req, payload);
}
