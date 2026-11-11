// Esquema do banco. Idempotente: pode rodar /api/setup quantas vezes quiser.

export const SCHEMA_SQL = /* sql */ `
create table if not exists config (
  chave text primary key,
  valor text
);

-- Acessos. papel: admin (gestor, vê o time todo) ou membro (vê só o próprio plano).
-- esteira: pv (pré-vendas), vd (vendas) ou gs (gestão).
-- email_clint: e-mail do dono do negócio no Clint, usado para ligar os negócios à pessoa.
create table if not exists usuarios (
  id             bigserial primary key,
  nome           text not null,
  login          text not null,
  senha_hash     text,
  papel          text not null default 'membro' check (papel in ('admin','membro')),
  esteira        text not null default 'vd' check (esteira in ('pv','vd','gs')),
  email_clint    text,
  ativo          boolean not null default true,
  trocar_senha   boolean not null default true,
  falhas         int not null default 0,
  bloqueado_ate  timestamptz,
  sessao_versao  int not null default 1,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz not null default now()
);
create unique index if not exists usuarios_login_idx on usuarios (lower(login));

-- Negócios do Clint (webhook + carga por CSV)
create table if not exists negocios (
  deal_id        text primary key,
  funil          text,
  empresa        text,
  contato_nome   text,
  etapa          text,
  status         text,
  dono           text,
  dono_email     text,
  valor          numeric(14,2),
  origem         text,
  data_reuniao   date,
  criado_em      timestamptz,
  atualizado_em  timestamptz not null default now()
);
create index if not exists negocios_dono_email_idx on negocios (lower(dono_email));
alter table negocios add column if not exists contato_email text;
alter table negocios add column if not exists contato_telefone text;

create table if not exists clint_eventos (
  id           bigserial primary key,
  recebido_em  timestamptz not null default now(),
  funil        text,
  gatilho      text,
  deal_id      text,
  payload      jsonb not null,
  erro         text
);
create index if not exists clint_eventos_recebido_idx on clint_eventos (recebido_em desc);

-- Plano semanal. semana = segunda-feira da semana.
-- origem: plano | fora (fora do plano) | pv (veio da pré-vendas)
-- resultado: null (aberto) | ganhou | perdeu | rolou | realizada | noshow | reagendada (no-show que remarcou)
create table if not exists itens (
  id            bigserial primary key,
  semana        date not null,
  dono_id       bigint not null references usuarios(id) on delete cascade,
  deal_id       text,
  empresa       text not null,
  produto       text,
  valor         numeric(14,2) not null default 0,
  temp          text not null default 'Morno',
  origem        text not null default 'plano',
  status        text not null default '',
  acao          text not null default '',
  quando        date,
  previsao      date,
  resultado     text,
  destino_id    bigint references usuarios(id) on delete set null,
  de_id         bigint references itens(id) on delete set null,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists itens_semana_idx on itens (semana);
create index if not exists itens_dono_idx on itens (dono_id, semana);

-- Plano do mês (fotografia). mes = 'YYYY-MM'
create table if not exists fotos (
  id            bigserial primary key,
  mes           text not null,
  dono_id       bigint not null references usuarios(id) on delete cascade,
  congelado_em  timestamptz,
  unique (mes, dono_id)
);
create table if not exists foto_itens (
  id        bigserial primary key,
  foto_id   bigint not null references fotos(id) on delete cascade,
  deal_id   text,
  empresa   text not null,
  produto   text,
  valor     numeric(14,2) not null default 0,
  temp      text not null default 'Morno',
  semana    date not null
);
create index if not exists foto_itens_foto_idx on foto_itens (foto_id);

-- Observações livres do executivo (opcional)
alter table itens add column if not exists observacoes text not null default '';
alter table foto_itens add column if not exists observacoes text not null default '';

-- Perdido: motivo (mesma lista do Clint) e detalhe opcional
alter table itens add column if not exists motivo_perda text;
alter table itens add column if not exists motivo_detalhe text not null default '';
`;
