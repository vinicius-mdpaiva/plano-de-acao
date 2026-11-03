// Sessão em cookie assinado (HMAC-SHA256). Usa só Web Crypto, então roda tanto no middleware (edge)
// quanto nas páginas (Node). Formato: base64url(json) + "." + base64url(assinatura).

export const COOKIE_SESSAO = 'wbc_plano_sessao';
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 14; // 14 dias

function segredo() {
  const s = process.env.AUTH_SECRET || process.env.WEBHOOK_SECRET;
  if (!s) throw new Error('Defina AUTH_SECRET (ou WEBHOOK_SECRET) nas variáveis da Vercel.');
  return s;
}

const enc = new TextEncoder();

function b64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deB64url(txt) {
  const bin = atob(txt.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((txt.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function chave() {
  return crypto.subtle.importKey('raw', enc.encode(segredo()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/** @param {{ uid: number, papel: string, v: number }} dados */
export async function assinarSessao(dados) {
  const corpo = b64url(enc.encode(JSON.stringify({ ...dados, exp: Math.floor(Date.now() / 1000) + DURACAO_SESSAO_S })));
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', await chave(), enc.encode(corpo)));
  return `${corpo}.${b64url(assinatura)}`;
}

/** Devolve os dados da sessão ou null se o cookie for inválido ou estiver vencido */
export async function lerSessao(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [corpo, assinatura] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await chave(), deB64url(assinatura), enc.encode(corpo));
    if (!ok) return null;
    const dados = JSON.parse(new TextDecoder().decode(deB64url(corpo)));
    if (!dados.exp || dados.exp < Math.floor(Date.now() / 1000)) return null;
    return dados;
  } catch {
    return null;
  }
}
