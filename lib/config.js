// Constantes compartilhadas entre o servidor e a interface (public/app.js tem uma cópia das listas).

export const PRODUTOS = [
  'Membership', 'Mídia', 'Patrocínio',
  'Mídia + Membership', 'Mídia + Patrocínio', 'Membership + Patrocínio',
  'Combo 360 (Mídia + Patrocínio + Membership)',
];
export const TEMPERATURAS = ['Quente', 'Morno', 'Frio'];
export const RESULTADOS_VD = ['ganhou', 'perdeu', 'rolou'];
export const RESULTADOS_PV = ['realizada', 'noshow', 'rolou'];

// Etapas do Clint que não entram na busca de empresas do plano (negócio encerrado ou parado).
// Comparação sem acento e sem maiúsculas. Ajuste aqui se o funil mudar.
export const ETAPAS_INATIVAS = ['perdido', 'ganho', 'fechado', 'stand_by', 'repescagem', 'nf'];

// Origem do Clint -> funil
export function funilDaOrigem(origem) {
  const o = chave(origem ?? '');
  if (o.startsWith('insercao') || o.includes('fitfeed')) return 'fitfeed';
  if (o === 'pipeline_de_vendas' || o.includes('wbc')) return 'wbc';
  return null;
}

export function chave(k) {
  return String(k ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
