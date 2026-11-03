import { redirect } from 'next/navigation';
import FormLogin from '../../components/FormLogin.js';
import { usuarioAtual } from '../../lib/auth.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Entrar · Plano de Ação WBC' };

export default async function Login() {
  if (await usuarioAtual()) redirect('/');
  return (
    <main className="login-fundo">
      <section className="login-caixa">
        <div className="login-marca">Wellness Builders Club<sup>™</sup></div>
        <div className="login-plat">Plano de ação</div>
        <h1>Entrar</h1>
        <p className="login-sub">Use o acesso criado pelo gestor. Cada pessoa vê e edita só o próprio plano.</p>
        <FormLogin />
        <p className="login-rodape">Esqueceu a senha? Peça ao gestor uma senha provisória.</p>
      </section>
    </main>
  );
}
