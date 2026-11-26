// Leitura do Painel Comercial (MTD e negócios perdidos no Clint com motivo), com a mesma senha da integração.
const URL_PAINEL = () => (process.env.PAINEL_URL || 'https://painel-comercial-lemon.vercel.app').replace(/\/$/, '');

export const painelAtivo = () => Boolean(process.env.INTEGRACAO_TOKEN);

export async function lerPainel() {
  if (!painelAtivo()) throw new Error('INTEGRACAO_TOKEN não configurado.');
  const r = await fetch(`${URL_PAINEL()}/api/integracao/plano`, {
    headers: { authorization: `Bearer ${process.env.INTEGRACAO_TOKEN}` }, cache: 'no-store',
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(`Painel respondeu ${r.status}: ${j.erro ?? 'sem detalhe'}`);
  return j;
}

/**
 * Negócio perdido no Clint (status LOST ou etapa Perdido) e ainda aberto no plano: fecha como perdido,
 * com o motivo da perda que o painel recebeu do Clint. Itens já fechados assim ganham o motivo quando ele chegar.
 * @param {import('postgres').Sql} sql
 * @param {{deal_id:string, motivo_perda:string|null}[]} perdidosPainel lista do painel (pode vir vazia)
 */
export async function aplicarPerdidosDoClint(sql, perdidosPainel = []) {
  const motivos = perdidosPainel.filter((p) => p.deal_id).map((p) => ({ deal_id: p.deal_id, motivo: p.motivo_perda || null }));
  const idsPainel = motivos.map((m) => m.deal_id);
  const fechados = await sql`
    update itens i set resultado = 'perdeu',
           motivo_perda = coalesce((select m->>'motivo' from jsonb_array_elements(${sql.json(motivos)}::jsonb) m
                                    where m->>'deal_id' = i.deal_id limit 1), i.motivo_perda),
           motivo_detalhe = case when i.motivo_detalhe = '' then 'Perdido no Clint' else i.motivo_detalhe end,
           atualizado_em = now()
    where i.resultado is null and i.origem <> 'fora' and i.deal_id is not null
      and (i.deal_id in (select deal_id from negocios where status = 'LOST' or lower(coalesce(etapa, '')) like 'perdid%')
           or i.deal_id in (select jsonb_array_elements_text(${sql.json(idsPainel)}::jsonb)))
    returning i.id`;
  // motivo que chegou depois
  if (motivos.length) {
    await sql`
      update itens i set motivo_perda = m.motivo, atualizado_em = now()
      from (select m->>'deal_id' as deal_id, m->>'motivo' as motivo from jsonb_array_elements(${sql.json(motivos)}::jsonb) m) m
      where i.deal_id = m.deal_id and i.resultado = 'perdeu' and i.motivo_perda is null
        and i.motivo_detalhe = 'Perdido no Clint' and m.motivo is not null`;
  }
  return fechados.length;
}

/** No máximo a cada `minutos`: busca os perdidos (com motivo) no painel e fecha os itens do plano */
export async function sincronizarPerdidosSeVelho(sql, minutos = 10) {
  await sql`insert into config values ('perdidos_lidos_em', null) on conflict do nothing`;
  const pegou = await sql`update config set valor = now()::text where chave = 'perdidos_lidos_em'
    and (coalesce(valor, '') = '' or valor::timestamptz < now() - (${minutos} || ' minutes')::interval) returning chave`;
  if (!pegou.length) return null;
  let lista = [];
  try { if (painelAtivo()) lista = (await lerPainel()).perdidos ?? []; } catch { /* sem painel: usa só o que o webhook trouxe */ }
  return aplicarPerdidosDoClint(sql, lista);
}
