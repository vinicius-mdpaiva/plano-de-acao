import { sql, bancoConfigurado } from '../../../lib/db.js';
import { usuarioAtual } from '../../../lib/auth.js';
import { carregarDados } from '../../../lib/dados.js';
import { garantirEsquema } from '../../../lib/migrar.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  if (!bancoConfigurado()) return Response.json({ ok: false, erro: 'Banco não configurado.' }, { status: 500 });
  try { await garantirEsquema(); } catch { /* a consulta abaixo mostra o erro */ }
  const u = await usuarioAtual();
  if (!u) return Response.json({ ok: false, erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await carregarDados(sql, u)) }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ ok: false, erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
