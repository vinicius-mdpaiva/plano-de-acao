'use client';

import { useActionState, useState } from 'react';
import { acaoEntrar } from '../lib/acoes-auth.js';

export default function FormLogin() {
  const [estado, acao, enviando] = useActionState(acaoEntrar, null);
  const [ver, setVer] = useState(false);
  return (
    <form action={acao} className="login-form" noValidate>
      <label className="login-campo">
        <span>Usuário ou e-mail</span>
        <input name="login" autoComplete="username" autoCapitalize="none" spellCheck={false} required defaultValue={estado?.login ?? ''} autoFocus />
      </label>
      <label className="login-campo">
        <span>Senha</span>
        <span className="login-senha">
          <input name="senha" type={ver ? 'text' : 'password'} autoComplete="current-password" required />
          <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'}>
            {ver ? 'Esconder' : 'Mostrar'}
          </button>
        </span>
      </label>
      {estado?.erro ? <p className="login-erro" role="alert">{estado.erro}</p> : null}
      <button type="submit" className="login-botao" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
}
