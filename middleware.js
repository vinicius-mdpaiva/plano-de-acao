import { NextResponse } from 'next/server';
import { COOKIE_SESSAO, lerSessao } from './lib/token.js';

// Todas as páginas exigem login, menos /login. As rotas /api usam o token próprio do webhook.
// O papel (gestor ou membro) e o status do usuário são conferidos de novo no servidor, em cada página.
export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const cabecalhos = new Headers(req.headers);
  cabecalhos.set('x-caminho', pathname);
  const seguir = () => NextResponse.next({ request: { headers: cabecalhos } });

  if (pathname === '/login') return seguir();

  const sessao = await lerSessao(req.cookies.get(COOKIE_SESSAO)?.value);
  if (!sessao) {
    const destino = new URL('/login', req.url);
    if (pathname !== '/') destino.searchParams.set('para', pathname + search);
    return NextResponse.redirect(destino);
  }
  return seguir();
}

export const config = {
  matcher: ['/((?!api/|_next/|favicon.ico|app.js|app.css).*)'],
};
