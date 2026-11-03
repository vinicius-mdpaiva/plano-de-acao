import { sql } from '../../../lib/db.js';
import { usuarioAtual } from '../../../lib/auth.js';
import { executar } from '../../../lib/acoes.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req) {
  const u = await usuarioAtual();
  if (!u) return Response.json({ ok: false, erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  let corpo;
  try { corpo = await req.json(); } catch { return Response.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 }); }
  try {
    const r = await executar(sql, u, corpo?.tipo, corpo?.params);
    return Response.json(r.corpo, { status: r.status });
  } catch (e) {
    return Response.json({ ok: false, erro: `Erro no servidor: ${String(e?.message ?? e).slice(0, 200)}` }, { status: 500 });
  }
}
