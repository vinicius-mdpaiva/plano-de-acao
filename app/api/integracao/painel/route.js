import { timingSafeEqual } from 'node:crypto';
import { sql, bancoConfigurado } from '../../../../lib/db.js';
import { garantirEsquema } from '../../../../lib/migrar.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Entrega o plano de ação para o Painel Comercial (reuniões realizadas, origem das vendas, compromisso).
// Só leitura. Protegido pelo INTEGRACAO_TOKEN (mesmo valor configurado no painel):
//   GET /api/integracao/painel   com o cabeçalho  Authorization: Bearer <INTEGRACAO_TOKEN>
function autorizado(req) {
  const esperado = process.env.INTEGRACAO_TOKEN || '';
  const auth = req.headers.get('authorization') || '';
  const veio = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (esperado.length < 16 || veio.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(veio), Buffer.from(esperado));
}

export async function GET(req) {
  if (!bancoConfigurado()) return Response.json({ ok: false, erro: 'Banco não configurado.' }, { status: 500 });
  if (!autorizado(req)) return Response.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 });
  try { await garantirEsquema(); } catch { /* segue */ }
  const itens = await sql`
    select i.id::int as id, to_char(i.semana, 'YYYY-MM-DD') as semana, u.nome as dono, u.esteira,
           i.deal_id, i.empresa, i.produto, i.valor::float as valor, i.temp, i.origem, i.status, i.acao,
           to_char(i.quando, 'YYYY-MM-DD') as quando, to_char(i.previsao, 'YYYY-MM-DD') as previsao,
           i.resultado, d.nome as destino, i.motivo_perda, i.de_id::int as de_id, i.observacoes
    from itens i join usuarios u on u.id = i.dono_id left join usuarios d on d.id = i.destino_id
    where u.esteira in ('pv', 'vd')
    order by i.semana, i.id`;
  const [{ inicio }] = await sql`select to_char(min(semana), 'YYYY-MM-DD') as inicio from itens`;
  return Response.json({ ok: true, inicio, gerado_em: new Date().toISOString(), itens },
    { headers: { 'cache-control': 'no-store' } });
}
