import { cookies } from 'next/headers';
import { sql } from './db.js';
import { COOKIE_SESSAO, DURACAO_SESSAO_S, assinarSessao, lerSessao } from './token.js';
import { gerarHash, conferirSenha } from './senha.js';

const MAX_FALHAS = 8;
const BLOQUEIO_MIN = 15;

/** Usuário da sessão atual, conferido no banco (ativo e sessão não derrubada) */
export async function usuarioAtual() {
  const token = (await cookies()).get(COOKIE_SESSAO)?.value;
  const s = await lerSessao(token);
  if (!s) return null;
  try {
    const [u] = await sql`select id, nome, login, papel, esteira, email_clint, ativo, trocar_senha, sessao_versao
                          from usuarios where id = ${s.uid}`;
    if (!u || !u.ativo || u.sessao_versao !== s.v) return null;
    return {
      id: Number(u.id), nome: u.nome, login: u.login, papel: u.papel, esteira: u.esteira,
      emailClint: u.email_clint, trocarSenha: u.trocar_senha,
    };
  } catch {
    return null;
  }
}

async function gravarCookie(u) {
  const token = await assinarSessao({ uid: Number(u.id), papel: u.papel, v: u.sessao_versao });
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DURACAO_SESSAO_S,
  });
}

export async function encerrarSessao() {
  (await cookies()).delete(COOKIE_SESSAO);
}

/**
 * Confere login e senha. Enquanto não houver nenhum gestor (admin) cadastrado, aceita
 * DASHBOARD_USER/DASHBOARD_PASSWORD da Vercel e cria o gestor com esses dados.
 */
export async function entrar(login, senha) {
  login = String(login ?? '').trim();
  senha = String(senha ?? '');
  if (!login || !senha) return { ok: false, erro: 'Informe usuário e senha.' };

  const [{ admins }] = await sql`select count(*)::int as admins from usuarios where papel = 'admin'`;
  if (admins === 0) {
    const envUser = process.env.DASHBOARD_USER || 'gestor';
    const envSenha = process.env.DASHBOARD_PASSWORD;
    if (envSenha && login.toLowerCase() === envUser.toLowerCase() && senha === envSenha) {
      const nome = process.env.DASHBOARD_NOME || 'Gestor';
      const [u] = await sql`
        insert into usuarios (nome, login, senha_hash, papel, esteira, trocar_senha)
        values (${nome}, ${envUser}, ${gerarHash(senha)}, 'admin', 'gs', true)
        returning id, papel, sessao_versao`;
      await gravarCookie(u);
      return { ok: true };
    }
  }

  const [u] = await sql`select * from usuarios where lower(login) = lower(${login})`;
  if (!u || !u.senha_hash) {
    conferirSenha(senha, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(88)); // mesmo tempo de resposta
    return {
      ok: false,
      erro: u && !u.senha_hash
        ? 'Seu acesso ainda não tem senha. Peça ao gestor para gerar uma senha provisória.'
        : 'Usuário ou senha incorretos.',
    };
  }
  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
    return { ok: false, erro: `Muitas tentativas. Tente de novo em ${BLOQUEIO_MIN} minutos ou peça ao gestor uma nova senha.` };
  }
  if (!conferirSenha(senha, u.senha_hash)) {
    const falhas = u.falhas + 1;
    await sql`update usuarios set falhas = ${falhas},
              bloqueado_ate = ${falhas >= MAX_FALHAS ? new Date(Date.now() + BLOQUEIO_MIN * 60000) : null}
              where id = ${u.id}`;
    return { ok: false, erro: 'Usuário ou senha incorretos.' };
  }
  if (!u.ativo) return { ok: false, erro: 'Este acesso foi desativado. Fale com o gestor.' };

  await sql`update usuarios set falhas = 0, bloqueado_ate = null, ultimo_acesso = now() where id = ${u.id}`;
  await gravarCookie(u);
  return { ok: true };
}

/** Troca a senha do próprio usuário e renova a sessão (derruba as outras) */
export async function trocarPropriaSenha(id, senhaAtual, novaSenha) {
  const [u] = await sql`select * from usuarios where id = ${id}`;
  if (!u || !conferirSenha(senhaAtual, u.senha_hash)) return { ok: false, erro: 'Senha atual incorreta.' };
  const [n] = await sql`
    update usuarios set senha_hash = ${gerarHash(novaSenha)}, trocar_senha = false, sessao_versao = sessao_versao + 1
    where id = ${id} returning id, papel, sessao_versao`;
  await gravarCookie(n);
  return { ok: true };
}
