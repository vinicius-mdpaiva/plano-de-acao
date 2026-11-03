import { redirect } from 'next/navigation';
import Script from 'next/script';
import { usuarioAtual } from '../lib/auth.js';
import { garantirEsquema } from '../lib/migrar.js';

export const dynamic = 'force-dynamic';

// A plataforma em si roda em public/app.js (tela) + /api/dados e /api/acao (servidor).
export default async function Inicio() {
  try { await garantirEsquema(); } catch { /* a tela mostra o erro */ }
  const u = await usuarioAtual();
  if (!u) redirect('/login');
  return (
    <>
      <div id="raiz"><div className="carregando">Carregando o plano…</div></div>
      <div className="toast" id="toast" hidden />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
