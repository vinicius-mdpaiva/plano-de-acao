'use server';

import { redirect } from 'next/navigation';
import { entrar } from './auth.js';
import { garantirEsquema } from './migrar.js';

export async function acaoEntrar(_estado, form) {
  let r;
  try {
    await garantirEsquema();
    r = await entrar(form.get('login'), form.get('senha'));
  } catch (e) {
    const msg = String(e?.message ?? e);
    return {
      erro: /DATABASE_URL|invalido|ENOTFOUND|connect/i.test(msg)
        ? 'O banco de dados não está conectado ao projeto na Vercel.'
        : `Não foi possível entrar: ${msg.slice(0, 160)}`,
      login: String(form.get('login') ?? ''),
    };
  }
  if (!r.ok) return { erro: r.erro, login: String(form.get('login') ?? '') };
  redirect('/');
}
