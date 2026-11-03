import './globals.css';

export const metadata = {
  title: 'Plano de Ação · WBC',
  description: 'Plano de ação semanal e mensal do time comercial WBC e FitFeed',
  robots: { index: false, follow: false },
};

// Aplica o tema salvo antes de pintar a tela (padrão: escuro, como a Plataforma WBC)
const SCRIPT_TEMA = `try{var t=localStorage.getItem('wbc-plano-tema');document.documentElement.dataset.theme=t==='light'?'light':'dark'}catch(e){document.documentElement.dataset.theme='dark'}`;

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Poppins:wght@400;500;600;700&family=Playfair+Display:wght@500&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
