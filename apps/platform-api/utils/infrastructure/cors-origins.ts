import { networkInterfaces } from 'node:os';

export function resolveCorsOrigins(
  environment: NodeJS.ProcessEnv,
  interfaces = networkInterfaces,
): string[] {
  const configured = environment.CORS_ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured?.length) return configured;

  const publicUrl = new URL(
    environment.APP_PUBLIC_URL ?? 'http://localhost:5666',
  );
  if (environment.NODE_ENV === 'production') return [publicUrl.origin];

  const hosts = new Set(['127.0.0.1', '[::1]', 'localhost']);
  for (const addresses of Object.values(interfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === 'IPv4') hosts.add(address.address);
    }
  }
  const origins = new Set([publicUrl.origin]);
  for (const hostname of hosts) {
    const url = new URL(publicUrl.origin);
    url.hostname = hostname;
    origins.add(url.origin);
  }
  return [...origins];
}
