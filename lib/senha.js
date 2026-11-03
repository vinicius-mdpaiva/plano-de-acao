import crypto from 'node:crypto';

// scrypt com sal aleatório. Formato salvo: scrypt$N$r$p$sal$hash (base64)
const N = 16384, R = 8, P = 1, TAM = 64;

export function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(senha), sal, TAM, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${hash.toString('base64')}`;
}

export function conferirSenha(senha, salvo) {
  try {
    const [alg, n, r, p, sal, hash] = String(salvo).split('$');
    if (alg !== 'scrypt') return false;
    const esperado = Buffer.from(hash, 'base64');
    const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'base64'), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(calc, esperado);
  } catch {
    return false;
  }
}

/** Regras mínimas de senha. Devolve a mensagem de erro ou null. */
export function validarSenha(senha) {
  const s = String(senha ?? '');
  if (s.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Use letras e números na senha.';
  return null;
}

/** Senha provisória legível (sem caracteres ambíguos), para o administrador repassar */
export function senhaProvisoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  const nums = '23456789';
  const pick = (s) => s[crypto.randomInt(s.length)];
  const base = Array.from({ length: 8 }, () => pick(letras)).join('');
  return `${base.slice(0, 4)}-${base.slice(4)}-${pick(nums)}${pick(nums)}${pick(nums)}`;
}
