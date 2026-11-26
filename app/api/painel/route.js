import { usuarioAtual } from '../../../lib/auth.js';
import { lerPainel } from '../../../lib/painel.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// MTD do Painel Comercial para o resumo do WhatsApp (só gestor)
export async function GET() {
  const u = await usuarioAtual();
  if (!u) return Response.json({ ok: false, erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  if (u.papel !== 'admin') return Response.json({ ok: false, erro: 'Só o gestor.' }, { status: 403 });
  try {
    const p = await lerPainel();
    return Response.json({ ok: true, hoje: p.hoje, mes: p.mes, dias_uteis: p.dias_uteis, dias_passados: p.dias_passados,
      fonte: p.fonte, mtd: p.mtd, pessoas: p.pessoas }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ ok: false, erro: String(e?.message ?? e).slice(0, 300) }, { status: 502 });
  }
}
