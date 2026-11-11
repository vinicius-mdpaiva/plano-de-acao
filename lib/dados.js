import { chave, ETAPAS_INATIVAS, LIMITE_BUSCA } from './config.js';

const INATIVAS = new Set(ETAPAS_INATIVAS);
const SEMANAS_JANELA = 12; // semanas para trás e para frente carregadas na tela

export function hojeSP() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

export function somarDias(iso, dias) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function segundaDe(iso) {
  const d = new Date(iso + 'T12:00:00Z');
  const dia = d.getUTCDay(); // 0 = domingo
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

export function ehSegunda(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso)) && new Date(iso + 'T12:00:00Z').getUTCDay() === 1;
}

const COLS_ITEM = (sql) => sql`
  i.id::int as id, to_char(i.semana, 'YYYY-MM-DD') as semana, i.dono_id::int as dono_id, i.deal_id, i.empresa,
  i.produto, i.valor::float as valor, i.temp, i.origem, i.status, i.acao,
  to_char(i.quando, 'YYYY-MM-DD') as quando, to_char(i.previsao, 'YYYY-MM-DD') as previsao,
  i.resultado, i.destino_id::int as destino_id, i.de_id::int as de_id, i.observacoes,
  i.motivo_perda, i.motivo_detalhe`;

/** Tudo o que a tela precisa, já filtrado pelo que o usuário pode ver */
export async function carregarDados(sql, u) {
  const hoje = hojeSP();
  const ini = somarDias(segundaDe(hoje), -7 * SEMANAS_JANELA);
  const fim = somarDias(segundaDe(hoje), 7 * SEMANAS_JANELA);
  const gestor = u.papel === 'admin';

  const time = await sql`
    select id::int as id, nome, esteira, papel, ativo from usuarios order by esteira desc, nome`;

  const itens = gestor
    ? await sql`select ${COLS_ITEM(sql)} from itens i where i.semana between ${ini}::date and ${fim}::date order by i.semana, i.id`
    : await sql`select ${COLS_ITEM(sql)} from itens i
                where i.semana between ${ini}::date and ${fim}::date
                  and (i.dono_id = ${u.id} or i.de_id in (select id from itens where dono_id = ${u.id}))
                order by i.semana, i.id`;

  const meses = [...new Set([ini, hoje, fim].map((d) => d.slice(0, 7)))];
  const fotos = await sql`
    select f.id::int as id, f.mes, f.dono_id::int as dono_id,
           to_char(f.congelado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') as congelado_em,
           coalesce(json_agg(json_build_object(
             'id', fi.id::int, 'deal_id', fi.deal_id, 'empresa', fi.empresa, 'produto', fi.produto,
             'valor', fi.valor::float, 'temp', fi.temp, 'semana', to_char(fi.semana, 'YYYY-MM-DD'), 'observacoes', fi.observacoes)
             order by fi.semana, fi.id) filter (where fi.id is not null), '[]') as itens
    from fotos f left join foto_itens fi on fi.foto_id = f.id
    where f.mes >= ${meses[0]} and f.mes <= ${meses[meses.length - 1]}
      ${gestor ? sql`` : sql`and f.dono_id = ${u.id}`}
    group by f.id`;

  const email = (u.emailClint || u.login || '').toLowerCase();
  // reserva: se o webhook não mandar o e-mail do dono, compara o nome ("GabrielMarques" = "Gabriel Marques")
  const chaveNome = chave(u.nome).replace(/_/g, '');
  // Busca do plano: TODOS os negócios do Clint, de todo o time. Na passagem de bastão (SDR -> executivo)
  // o dono costuma continuar o da SDR, e trocar só o dono no Clint não dispara webhook. Então qualquer
  // pessoa encontra qualquer negócio; os da própria pessoa vêm primeiro e a sugestão mostra o dono atual.
  const brutos = await sql`
    select n.deal_id, n.funil, n.empresa, n.contato_nome, n.etapa, n.valor::float as valor, n.dono, lower(n.dono_email) as dono_email,
           to_char(n.data_reuniao, 'YYYY-MM-DD') as data_reuniao,
           coalesce(us.nome, n.dono) as dono_nome,
           coalesce(lower(n.dono_email) = ${email}
             or (n.dono_email is null and regexp_replace(lower(coalesce(n.dono, '')), '[^a-z0-9]', '', 'g') = ${chaveNome}), false) as meu
    from negocios n
    left join lateral (select nome from usuarios x
                       where n.dono_email is not null and lower(n.dono_email) in (lower(coalesce(x.email_clint, '')), lower(x.login))
                       limit 1) us on true`;
  const negocios = [...brutos].sort((a, b) =>
    Number(!a.meu) - Number(!b.meu) || Number(INATIVAS.has(chave(a.etapa))) - Number(INATIVAS.has(chave(b.etapa))));
  // etapa atual de negócios citados no plano, mesmo que já encerrados
  const citados = new Set([...itens.map((i) => i.deal_id), ...fotos.flatMap((f) => f.itens.map((x) => x.deal_id))].filter(Boolean));
  const etapas = Object.fromEntries(brutos.filter((n) => citados.has(n.deal_id)).map((n) => [n.deal_id, n.etapa]));

  const r = {
    hoje,
    usuario: { id: u.id, nome: u.nome, login: u.login, papel: u.papel, esteira: u.esteira, trocarSenha: u.trocarSenha },
    time, itens, fotos, negocios, etapas,
  };

  if (gestor) {
    r.acessos = await sql`
      select id::int as id, nome, login, papel, esteira, email_clint, ativo, (senha_hash is not null) as tem_senha,
             trocar_senha, ultimo_acesso from usuarios order by ativo desc, esteira desc, nome`;
    const [s] = await sql`
      select (select max(recebido_em) from clint_eventos) as ultimo_evento,
             (select count(*)::int from clint_eventos where recebido_em > now() - interval '24 hours') as eventos_24h,
             (select count(*)::int from clint_eventos where erro is not null and recebido_em > now() - interval '7 days') as erros_7d,
             (select count(*)::int from negocios) as negocios_total`;
    r.saude = { ...s, limite_busca: LIMITE_BUSCA };
  }
  return r;
}
