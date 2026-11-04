import { sql } from '../../../lib/db.js';
import { usuarioAtual } from '../../../lib/auth.js';
import { garantirEsquema } from '../../../lib/migrar.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Base de clientes (só gestor). Sem ?id: lista todos os negócios. Com ?id: detalhe de um negócio,
// com os últimos envios brutos do Clint e onde ele aparece nos planos.
export async function GET(req) {
  try { await garantirEsquema(); } catch { /* segue */ }
  const u = await usuarioAtual();
  if (!u) return Response.json({ ok: false, erro: 'Sessão expirada. Entre de novo.' }, { status: 401 });
  if (u.papel !== 'admin') return Response.json({ ok: false, erro: 'Só o gestor vê a base de clientes.' }, { status: 403 });
  const id = new URL(req.url).searchParams.get('id');
  try {
    if (!id) {
      const lista = await sql`
        select deal_id, funil, empresa, contato_nome, contato_email, contato_telefone, etapa, status, dono,
               lower(dono_email) as dono_email, valor::float as valor, origem,
               to_char(criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as criado_em,
               to_char(atualizado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') as atualizado_em
        from negocios order by atualizado_em desc`;
      return Response.json({ ok: true, lista }, { headers: { 'cache-control': 'no-store' } });
    }
    const [n] = await sql`
      select *, valor::float as valor, to_char(data_reuniao, 'YYYY-MM-DD') as data_reuniao_txt from negocios where deal_id = ${id}`;
    if (!n) return Response.json({ ok: false, erro: 'Negócio não encontrado.' }, { status: 404 });
    const eventos = await sql`
      select to_char(recebido_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as quando, funil, gatilho, erro, payload
      from clint_eventos where deal_id = ${id} order by id desc limit 5`;
    const planos = await sql`
      select to_char(i.semana, 'YYYY-MM-DD') as semana, u.nome as dono, i.empresa, i.resultado, i.status
      from itens i join usuarios u on u.id = i.dono_id where i.deal_id = ${id} order by i.semana desc limit 20`;
    return Response.json({ ok: true, negocio: n, eventos, planos }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return Response.json({ ok: false, erro: String(e?.message ?? e).slice(0, 300) }, { status: 500 });
  }
}
