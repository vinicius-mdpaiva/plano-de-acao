// Acessos iniciais do time (sem senha: o gestor gera a provisória em Acessos).
export const TIME_INICIAL = [
  { nome: 'Gabriel Marques', login: 'gabriel.marques@wellnessbuildersclub.com', esteira: 'vd' },
  { nome: 'Ana Banett', login: 'anabanettmkt@gmail.com', esteira: 'vd' },
  { nome: 'Izadora Rocha', login: 'izadorarrocha1@gmail.com', esteira: 'pv' },
];

export async function semearTime(sql) {
  const [{ n }] = await sql`select count(*)::int as n from usuarios where papel = 'membro'`;
  if (n > 0) return 0;
  for (const p of TIME_INICIAL) {
    await sql`insert into usuarios (nome, login, papel, esteira, email_clint)
              values (${p.nome}, ${p.login}, 'membro', ${p.esteira}, ${p.login})
              on conflict do nothing`;
  }
  return TIME_INICIAL.length;
}
