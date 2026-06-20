// Configuración del servidor desde variables de entorno (con defaults de dev).

function parseOrigin(raw: string | undefined): string[] | boolean {
  if (!raw || raw === 'true') return true; // refleja cualquier origen (sólo dev)
  if (raw === 'false') return false;
  return raw.split(',').map((s) => s.trim());
}

export const config = {
  port: Number(process.env.PORT ?? 5174),
  host: process.env.HOST ?? '0.0.0.0',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://ricardosoriagalvarro@localhost:5432/bolivia',
  corsOrigin: parseOrigin(process.env.CORS_ORIGIN),
};
