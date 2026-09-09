import { describe, expect, it } from 'vitest';

import { resolveCorsOrigins } from './cors-origins';

const interfaces = () => ({
  ethernet: [
    {
      address: '192.168.1.20',
      cidr: '192.168.1.20/24',
      family: 'IPv4' as const,
      internal: false,
      mac: '00:00:00:00:00:00',
      netmask: '255.255.255.0',
    },
  ],
});

describe('cors origin configuration', () => {
  it('allows local development addresses only on the Web protocol and port', () => {
    const origins = resolveCorsOrigins({}, interfaces);
    expect(origins).toEqual([
      'http://localhost:5666',
      'http://127.0.0.1:5666',
      'http://[::1]:5666',
      'http://192.168.1.20:5666',
    ]);
    for (const origin of [
      'http://192.168.1.21:5666',
      'http://192.168.1.20:9999',
      'https://192.168.1.20:5666',
      'http://localhost.attacker.test:5666',
      'null',
    ])
      expect(origins).not.toContain(origin);
  });

  it('uses the configured Web protocol and port', () => {
    expect(
      resolveCorsOrigins(
        { APP_PUBLIC_URL: 'https://localhost:8443' },
        interfaces,
      ),
    ).toContain('https://192.168.1.20:8443');
  });

  it('honors explicit allowlists without adding local addresses', () => {
    expect(
      resolveCorsOrigins(
        {
          CORS_ALLOWED_ORIGINS:
            ' https://rail.example.test, http://localhost:5666 ',
        },
        interfaces,
      ),
    ).toEqual(['https://rail.example.test', 'http://localhost:5666']);
  });

  it('does not discover local addresses in production', () => {
    expect(
      resolveCorsOrigins(
        { NODE_ENV: 'production', APP_PUBLIC_URL: 'https://rail.example.test' },
        interfaces,
      ),
    ).toEqual(['https://rail.example.test']);
  });
});
