import postgres from 'postgres';

const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const local = url ? /@(localhost|127\.0\.0\.1)[:/]/.test(url) : false;

// Reaproveita a conexão entre requisições na mesma instância
const g = globalThis;
export const sql =
  g.__planoSql ??
  (g.__planoSql = postgres(url ?? 'postgres://invalido', {
    ssl: local ? false : 'require',
    max: 3,
    prepare: false, // compatível com o pooler do Neon
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  }));

export function bancoConfigurado() {
  return Boolean(url);
}
