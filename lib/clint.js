// Leitura dos dados do Clint (webhook ou CSV exportado) num formato padrão e gravação na tabela negocios.
import { chave, funilDaOrigem } from './config.js';

// Vários nomes aceitos para o mesmo dado: o mapeamento do webhook é definido por você no Clint,
// e a exportação CSV usa os nomes em inglês (id, stage, user_email...).
const ALIASES = {
  deal_id: ['deal_id', 'id_negocio', 'negocio_id', 'id_do_negocio', 'id', 'deal', 'deal_id_do_negocio'],
  etapa: ['etapa', 'etapa_do_negocio', 'etapa_nome', 'stage', 'stage_name', 'deal_stage', 'negocio_etapa'],
  status: ['status', 'status_do_negocio', 'status_negocio', 'deal_status', 'negocio_status'],
  dono: ['dono', 'dono_do_negocio', 'dono_nome', 'nome_do_dono_do_negocio', 'deal_user_name', 'responsavel', 'vendedor', 'owner', 'owner_name', 'user_name'],
  dono_email: ['dono_email', 'email_do_dono', 'email_do_dono_do_negocio', 'deal_user_email', 'user_email', 'owner_email', 'responsavel_email'],
  valor: ['valor', 'valor_do_negocio', 'valor_negocio', 'value', 'deal_value', 'amount'],
  origem: ['origem_do_negocio', 'origin', 'deal_origin', 'origem', 'source'],
  empresa: ['empresa', 'nome_da_empresa', 'organization_name', 'organization', 'company', 'organizacao'],
  contato_nome: ['contato_nome', 'nome_do_contato', 'name', 'nome', 'contact_name'],
  data_reuniao: ['data_reuniao', 'data_da_reuniao', 'reuniao_agendada', 'data_reuniao_agendada', 'meeting_date'],
  criado_em: ['criado_em', 'data_de_criacao', 'data_criacao', 'created_at', 'deal_created_at'],
};

// { dono: { nome: 'Ana' } } -> { dono_nome: 'Ana' }
export function achatar(obj, prefixo = '', saida = {}) {
  if (obj === null || obj === undefined) return saida;
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefixo) saida[prefixo] = Array.isArray(obj) ? obj.join(', ') : obj;
    return saida;
  }
  for (const [k, v] of Object.entries(obj)) {
    const ck = prefixo ? `${prefixo}_${chave(k)}` : chave(k);
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) achatar(v, ck, saida);
    else saida[ck] = Array.isArray(v) ? v.join(', ') : v;
  }
  return saida;
}

function texto(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') return null;
  return s;
}

function pegar(plano, campo) {
  for (const a of ALIASES[campo]) {
    const v = texto(plano[a]);
    if (v !== null) return v;
  }
  return null;
}

export function normalizarValor(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!s || s === '-') return null;
  const uv = s.lastIndexOf(','), up = s.lastIndexOf('.');
  if (uv > -1 && up > -1) s = uv > up ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (uv > -1) s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else if (up > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "02/11/2026 13:11:37", "2026-11-02T16:11:36.000Z" ou "2026-11-02" -> Date (ou null) */
export function normalizarData(v) {
  const s = texto(v);
  if (!s) return null;
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, d, m, a, h = '12', mi = '00', se = '00'] = br;
    // horário de Brasília (UTC-3)
    const dt = new Date(Date.UTC(+a, +m - 1, +d, +h + 3, +mi, +se));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function soData(dt) {
  if (!dt) return null;
  // data no fuso de São Paulo
  return new Date(dt.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Converte um payload (webhook) ou uma linha de CSV para as colunas de negocios */
export function normalizar(registro, funilInformado = null) {
  const plano = achatar(registro);
  const dealId = pegar(plano, 'deal_id');
  const origem = pegar(plano, 'origem');
  const funil = chave(funilInformado) || funilDaOrigem(origem);
  const dados = {
    deal_id: dealId,
    funil: funil || null,
    empresa: pegar(plano, 'empresa'),
    contato_nome: pegar(plano, 'contato_nome'),
    etapa: pegar(plano, 'etapa'),
    status: pegar(plano, 'status'),
    dono: pegar(plano, 'dono'),
    dono_email: pegar(plano, 'dono_email')?.toLowerCase() ?? null,
    valor: normalizarValor(pegar(plano, 'valor')),
    origem,
    data_reuniao: soData(normalizarData(pegar(plano, 'data_reuniao'))),
    criado_em: normalizarData(pegar(plano, 'criado_em'))?.toISOString() ?? null,
  };
  return dados;
}

const COLUNAS = ['deal_id', 'funil', 'empresa', 'contato_nome', 'etapa', 'status', 'dono', 'dono_email', 'valor', 'origem', 'data_reuniao', 'criado_em'];

/**
 * Grava (insere ou atualiza) negócios. Campos vazios no envio não apagam o que já existe.
 * @param {import('postgres').Sql} sql
 * @param {object[]} linhas saídas de normalizar()
 */
export async function gravarNegocios(sql, linhas) {
  const porId = new Map();
  for (const l of linhas) if (l.deal_id) porId.set(l.deal_id, l); // última versão de cada negócio
  const lista = [...porId.values()].map((l) => Object.fromEntries(COLUNAS.map((c) => [c, l[c] ?? null])));
  let total = 0;
  for (let i = 0; i < lista.length; i += 500) {
    const lote = lista.slice(i, i + 500);
    await sql`
      insert into negocios ${sql(lote, ...COLUNAS)}
      on conflict (deal_id) do update set
        funil        = coalesce(excluded.funil, negocios.funil),
        empresa      = coalesce(excluded.empresa, negocios.empresa),
        contato_nome = coalesce(excluded.contato_nome, negocios.contato_nome),
        etapa        = coalesce(excluded.etapa, negocios.etapa),
        status       = coalesce(excluded.status, negocios.status),
        dono         = coalesce(excluded.dono, negocios.dono),
        dono_email   = coalesce(excluded.dono_email, negocios.dono_email),
        valor        = coalesce(excluded.valor, negocios.valor),
        origem       = coalesce(excluded.origem, negocios.origem),
        data_reuniao = coalesce(excluded.data_reuniao, negocios.data_reuniao),
        criado_em    = coalesce(negocios.criado_em, excluded.criado_em),
        atualizado_em = now()`;
    total += lote.length;
  }
  return { gravados: total, semId: linhas.length - linhas.filter((l) => l.deal_id).length };
}
