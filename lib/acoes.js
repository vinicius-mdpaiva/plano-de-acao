// Todas as alterações feitas pela tela passam por aqui, com as permissões conferidas no servidor.
import { PRODUTOS, TEMPERATURAS, RESULTADOS_PV, RESULTADOS_VD } from './config.js';
import { ehSegunda, somarDias } from './dados.js';
import { gerarHash, senhaProvisoria, validarSenha } from './senha.js';
import { trocarPropriaSenha, encerrarSessao } from './auth.js';
import { lerCsv } from './csv.js';
import { normalizar, gravarNegocios } from './clint.js';

class Recusa extends Error {}
const recusar = (m) => { throw new Recusa(m); };

const txt = (v, max = 400) => String(v ?? '').trim().slice(0, max);
const data = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? '')) ? String(v) : null);
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0; };
const produto = (v) => (PRODUTOS.includes(v) ? v : recusar('Escolha um produto da lista.'));
const temp = (v) => (TEMPERATURAS.includes(v) ? v : 'Morno');
const idNum = (v, msg = 'Registro inválido.') => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : recusar(msg); };

async function itemDoUsuario(sql, u, id) {
  const [i] = await sql`select *, to_char(semana, 'YYYY-MM-DD') as semana_txt, to_char(previsao, 'YYYY-MM-DD') as previsao_txt
                        from itens where id = ${idNum(id, 'Item não encontrado.')}`;
  if (!i) recusar('Item não encontrado.');
  if (Number(i.dono_id) !== u.id) recusar('Só o dono do plano pode alterar este item.');
  return i;
}

async function fotoDoMes(sql, u, mes, criar = true) {
  if (u.esteira !== 'vd') recusar('O plano mensal é só de vendas. A pré-vendas trabalha com o plano semanal.');
  if (!/^\d{4}-\d{2}$/.test(String(mes))) recusar('Mês inválido.');
  let [f] = await sql`select * from fotos where mes = ${mes} and dono_id = ${u.id}`;
  if (!f && criar) [f] = await sql`insert into fotos (mes, dono_id) values (${mes}, ${u.id}) returning *`;
  return f;
}

const ACOES = {
  /* ---------- plano semanal ---------- */
  async criarItem(sql, u, p) {
    if (!ehSegunda(p.semana)) recusar('Semana inválida.');
    const empresa = txt(p.empresa, 160) || recusar('Informe a empresa.');
    const origem = p.origem === 'fora' ? 'fora' : 'plano';
    const valor = u.esteira === 'pv' ? 0 : num(p.valor);
    if (u.esteira !== 'pv' && !valor) recusar('Informe o valor.');
    const quando = data(p.quando);
    if (origem === 'plano' && (!txt(p.status) || !txt(p.acao) || !quando)) recusar('Preencha em que pé está, a ação e o dia.');
    const [i] = await sql`
      insert into itens (semana, dono_id, deal_id, empresa, produto, valor, temp, origem, status, acao, quando, previsao, observacoes)
      values (${p.semana}, ${u.id}, ${txt(p.deal_id, 80) || null}, ${empresa}, ${produto(p.produto)}, ${valor}, ${temp(p.temp)},
              ${origem}, ${txt(p.status)}, ${txt(p.acao)}, ${quando}, ${data(p.previsao)}, ${txt(p.observacoes, 2000)})
      returning id`;
    return { id: Number(i.id) };
  },

  async atualizarItem(sql, u, p) {
    const i = await itemDoUsuario(sql, u, p.id);
    if (i.resultado) recusar('Este item já foi fechado.');
    await sql`
      update itens set status = ${txt(p.status)}, acao = ${txt(p.acao)}, quando = ${data(p.quando)},
        previsao = ${data(p.previsao)}, temp = ${temp(p.temp)}, produto = ${produto(p.produto)},
        valor = ${u.esteira === 'pv' ? 0 : num(p.valor)}, observacoes = ${txt(p.observacoes, 2000)}, atualizado_em = now()
      where id = ${i.id}`;
    return {};
  },

  async excluirItem(sql, u, p) {
    const i = await itemDoUsuario(sql, u, p.id);
    if (i.resultado) recusar('Itens fechados não podem ser excluídos.');
    await sql`delete from itens where id = ${i.id}`;
    return {};
  },

  async fecharItem(sql, u, p) {
    const i = await itemDoUsuario(sql, u, p.id);
    if (i.resultado) recusar('Este item já foi fechado.');
    const permitidos = u.esteira === 'pv' ? RESULTADOS_PV : RESULTADOS_VD;
    if (!permitidos.includes(p.resultado)) recusar('Resultado inválido.');
    const proxima = somarDias(i.semana_txt, 7);
    return sql.begin(async (tx) => {
      if (p.resultado === 'realizada') {
        const destino = idNum(p.destinoId, 'Escolha para qual vendedor a reunião foi passada.');
        const [d] = await tx`select id, nome from usuarios where id = ${destino} and esteira = 'vd' and ativo`;
        if (!d) recusar('Escolha para qual vendedor a reunião foi passada.');
        await tx`update itens set resultado = 'realizada', destino_id = ${d.id}, atualizado_em = now() where id = ${i.id}`;
        await tx`
          insert into itens (semana, dono_id, deal_id, empresa, produto, valor, temp, origem, status, observacoes, de_id)
          values (${proxima}, ${d.id}, ${i.deal_id}, ${i.empresa}, ${i.produto}, 0, ${i.temp}, 'pv',
                  ${'Reunião feita pela pré-vendas: ' + (i.status || 'sem observações')},
                  ${i.observacoes ? 'Da pré-vendas: ' + i.observacoes : ''}, ${i.id})`;
        return { aviso: `${i.empresa} entrou no plano de ${d.nome}.` };
      }
      await tx`update itens set resultado = ${p.resultado}, atualizado_em = now() where id = ${i.id}`;
      if (p.resultado === 'rolou') {
        await tx`
          insert into itens (semana, dono_id, deal_id, empresa, produto, valor, temp, origem, status, previsao, observacoes, de_id)
          values (${proxima}, ${i.dono_id}, ${i.deal_id}, ${i.empresa}, ${i.produto}, ${i.valor}, ${i.temp}, ${i.origem},
                  ${i.status}, ${i.previsao_txt}, ${i.observacoes || ''}, ${i.id})`;
      }
      return {};
    });
  },

  /* ---------- plano do mês ---------- */
  async fotoAdicionar(sql, u, p) {
    const f = await fotoDoMes(sql, u, p.mes);
    if (f.congelado_em) recusar('O plano mensal deste mês já foi concluído.');
    if (!ehSegunda(p.semana)) recusar('Semana inválida.');
    const empresa = txt(p.empresa, 160) || recusar('Informe a empresa.');
    const valor = u.esteira === 'pv' ? 0 : num(p.valor);
    if (u.esteira !== 'pv' && !valor) recusar('Informe o valor.');
    await sql`insert into foto_itens (foto_id, deal_id, empresa, produto, valor, temp, semana, observacoes)
              values (${f.id}, ${txt(p.deal_id, 80) || null}, ${empresa}, ${produto(p.produto)}, ${valor}, ${temp(p.temp)}, ${p.semana},
                      ${txt(p.observacoes, 2000)})`;
    return {};
  },

  // Traz para o plano mensal os compromissos que a pessoa já lançou no plano semanal do mês
  // (um por conta, na semana mais cedo; ignora "fora do plano" e o que já está no plano mensal)
  async fotoImportarSemana(sql, u, p) {
    const f = await fotoDoMes(sql, u, p.mes);
    if (f.congelado_em) recusar('O plano mensal deste mês já foi concluído.');
    const r = await sql`
      insert into foto_itens (foto_id, deal_id, empresa, produto, valor, temp, semana, observacoes)
      select ${f.id}, x.deal_id, x.empresa, coalesce(x.produto, 'Membership'), x.valor, x.temp, x.semana, coalesce(x.observacoes, '')
      from (
        select distinct on (coalesce(i.deal_id, lower(trim(i.empresa))))
               i.deal_id, i.empresa, i.produto, i.valor, i.temp, i.semana, i.observacoes
        from itens i
        where i.dono_id = ${u.id} and i.origem <> 'fora' and to_char(i.semana, 'YYYY-MM') = ${p.mes}
        order by coalesce(i.deal_id, lower(trim(i.empresa))), i.semana, i.id
      ) x
      where not exists (
        select 1 from foto_itens fi
        where fi.foto_id = ${f.id}
          and (fi.deal_id = x.deal_id or lower(trim(fi.empresa)) = lower(trim(x.empresa)))
      )
      returning id`;
    const n = r.length;
    return { aviso: n ? `${n} ${n === 1 ? 'compromisso trazido' : 'compromissos trazidos'} para o plano mensal.` : 'Nada novo para trazer.' };
  },

  // Corrige um negócio do plano mensal (empresa, produto, valor, temperatura, semana).
  // Vale também depois de concluído, para corrigir erro de digitação sem apagar e refazer.
  async fotoEditar(sql, u, p) {
    const [x] = await sql`select fi.id, f.dono_id, f.mes from foto_itens fi join fotos f on f.id = fi.foto_id where fi.id = ${idNum(p.id)}`;
    if (!x || Number(x.dono_id) !== u.id) recusar('Item não encontrado.');
    if (!ehSegunda(p.semana)) recusar('Semana inválida.');
    const empresa = txt(p.empresa, 160) || recusar('Informe a empresa.');
    const valor = u.esteira === 'pv' ? 0 : num(p.valor);
    if (u.esteira !== 'pv' && !valor) recusar('Informe o valor.');
    await sql`update foto_itens set empresa = ${empresa}, produto = ${produto(p.produto)}, valor = ${valor},
              temp = ${temp(p.temp)}, semana = ${p.semana}, observacoes = ${txt(p.observacoes, 2000)} where id = ${x.id}`;
    return {};
  },

  async fotoRemover(sql, u, p) {
    const [x] = await sql`select fi.id, f.dono_id, f.congelado_em from foto_itens fi join fotos f on f.id = fi.foto_id where fi.id = ${idNum(p.id)}`;
    if (!x || Number(x.dono_id) !== u.id) recusar('Item não encontrado.');
    if (x.congelado_em) recusar('O plano mensal já foi concluído.');
    await sql`delete from foto_itens where id = ${x.id}`;
    return {};
  },

  async fotoCongelar(sql, u, p) {
    const f = await fotoDoMes(sql, u, p.mes, false);
    if (!f) recusar('Adicione pelo menos um negócio antes de concluir.');
    const [{ n }] = await sql`select count(*)::int as n from foto_itens where foto_id = ${f.id}`;
    if (!n) recusar('Adicione pelo menos um negócio antes de concluir.');
    await sql`update fotos set congelado_em = now() where id = ${f.id} and congelado_em is null`;
    return {};
  },

  /* ---------- conta ---------- */
  async trocarSenha(sql, u, p) {
    if (String(p.nova ?? '') !== String(p.confirmacao ?? '')) recusar('A confirmação não confere com a nova senha.');
    const invalida = validarSenha(p.nova);
    if (invalida) recusar(invalida);
    const r = await trocarPropriaSenha(u.id, p.atual, p.nova);
    if (!r.ok) recusar(r.erro);
    return {};
  },

  async sair() {
    await encerrarSessao();
    return {};
  },
};

/* ---------- só gestor ---------- */
const ESTEIRAS = new Set(['pv', 'vd', 'gs']);
const loginValido = (l) => /^[A-Za-z0-9._@+-]{3,80}$/.test(l);

const ACOES_GESTOR = {
  async usuarioSalvar(sql, u, p) {
    const nome = txt(p.nome, 80) || recusar('Informe o nome.');
    const login = txt(p.login, 80);
    if (!loginValido(login)) recusar('Use um usuário ou e-mail sem espaços.');
    const esteira = ESTEIRAS.has(p.esteira) ? p.esteira : recusar('Escolha a função.');
    const papel = esteira === 'gs' ? 'admin' : 'membro';
    const email = txt(p.email_clint, 120).toLowerCase() || null;
    try {
      if (p.id) {
        if (idNum(p.id) === u.id && papel !== 'admin') recusar('Você não pode tirar o seu próprio acesso de gestor.');
        await sql`update usuarios set nome = ${nome}, login = ${login}, esteira = ${esteira}, papel = ${papel}, email_clint = ${email},
                  sessao_versao = case when papel <> ${papel} then sessao_versao + 1 else sessao_versao end
                  where id = ${idNum(p.id)}`;
        return { aviso: 'Acesso atualizado.' };
      }
      const senha = senhaProvisoria();
      await sql`insert into usuarios (nome, login, senha_hash, papel, esteira, email_clint)
                values (${nome}, ${login}, ${gerarHash(senha)}, ${papel}, ${esteira}, ${email})`;
      return { aviso: `Acesso criado para ${nome}.`, login, senha };
    } catch (e) {
      if (/usuarios_login_idx|duplicate/.test(String(e?.message))) recusar(`Já existe um acesso com o usuário "${login}".`);
      throw e;
    }
  },

  async usuarioSenha(sql, u, p) {
    const senha = senhaProvisoria();
    const [x] = await sql`update usuarios set senha_hash = ${gerarHash(senha)}, trocar_senha = true, falhas = 0, bloqueado_ate = null,
                          sessao_versao = sessao_versao + 1 where id = ${idNum(p.id)} returning nome, login`;
    if (!x) recusar('Acesso não encontrado.');
    return { aviso: `Senha provisória de ${x.nome}.`, login: x.login, senha };
  },

  async usuarioAtivo(sql, u, p) {
    if (idNum(p.id) === u.id) recusar('Você não pode desativar o seu próprio acesso.');
    const [x] = await sql`update usuarios set ativo = not ativo, sessao_versao = sessao_versao + 1 where id = ${idNum(p.id)} returning ativo`;
    if (!x) recusar('Acesso não encontrado.');
    return { aviso: x.ativo ? 'Acesso reativado.' : 'Acesso desativado.' };
  },

  async importar(sql, u, p) {
    const linhas = lerCsv(String(p.csv ?? ''));
    if (!linhas.length) recusar('O arquivo está vazio ou não é um CSV do Clint.');
    const normal = linhas.map((l) => normalizar(l, p.funil || null));
    const r = await gravarNegocios(sql, normal);
    const semFunil = normal.filter((n) => n.deal_id && !n.funil).length;
    return { aviso: `${r.gravados} negócios importados.`, ...r, semFunil };
  },
};

/** @returns {Promise<{status:number, corpo:object}>} */
export async function executar(sql, u, tipo, params) {
  try {
    if (ACOES[tipo]) return { status: 200, corpo: { ok: true, ...(await ACOES[tipo](sql, u, params ?? {})) } };
    if (ACOES_GESTOR[tipo]) {
      if (u.papel !== 'admin') return { status: 403, corpo: { ok: false, erro: 'Só o gestor pode fazer isso.' } };
      return { status: 200, corpo: { ok: true, ...(await ACOES_GESTOR[tipo](sql, u, params ?? {})) } };
    }
    return { status: 400, corpo: { ok: false, erro: 'Ação desconhecida.' } };
  } catch (e) {
    if (e instanceof Recusa) return { status: 400, corpo: { ok: false, erro: e.message } };
    throw e;
  }
}
