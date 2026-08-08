import type { H3Event } from 'h3';

import { deleteCookie, getCookie, setCookie } from 'h3';

import { getConfig } from '../infrastructure/config';

const REFRESH_COOKIE = 'rail_refresh_token';
const COOKIE_PATH = '/api/v1/auth';

export function getRefreshCookie(event: H3Event) {
  return getCookie(event, REFRESH_COOKIE);
}

export function setRefreshCookie(event: H3Event, token: string) {
  const config = getConfig();
  setCookie(event, REFRESH_COOKIE, token, {
    httpOnly: true,
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60,
    path: COOKIE_PATH,
    sameSite: 'lax',
    secure: config.isProduction,
  });
}

export function clearRefreshCookie(event: H3Event) {
  deleteCookie(event, REFRESH_COOKIE, {
    httpOnly: true,
    path: COOKIE_PATH,
    sameSite: 'lax',
    secure: getConfig().isProduction,
  });
}
