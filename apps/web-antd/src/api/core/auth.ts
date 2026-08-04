import { baseRequestClient, requestClient } from '#/api/request';

export namespace AuthApi {
  /** 登录接口参数 */
  export interface LoginParams {
    password?: string;
    username?: string;
  }

  /** 登录接口返回值 */
  export interface LoginResult {
    accessToken: string;
  }

  export interface RefreshTokenResult {
    code: number;
    data: string;
    message: string;
  }

  export interface RegisterParams {
    email: string;
    password: string;
    username: string;
  }
}

/**
 * 登录
 */
export async function loginApi(data: AuthApi.LoginParams) {
  return requestClient.post<AuthApi.LoginResult>('/auth/login', data);
}

/**
 * 刷新accessToken
 */
export async function refreshTokenApi() {
  const response = (await baseRequestClient.post<AuthApi.RefreshTokenResult>(
    '/auth/refresh',
    undefined,
    { withCredentials: true },
  )) as unknown as { data: AuthApi.RefreshTokenResult };
  return response.data.data;
}

/**
 * 退出登录
 */
export async function logoutApi() {
  return baseRequestClient.post('/auth/logout', undefined, {
    withCredentials: true,
  });
}

export async function registerApi(data: AuthApi.RegisterParams) {
  return requestClient.post<{ id: string; username: string }>(
    '/auth/register',
    data,
  );
}

export function requestPasswordResetApi(email: string) {
  return requestClient.post<{ accepted: boolean; message: string }>(
    '/auth/password-reset/request',
    { email },
  );
}

export function confirmPasswordResetApi(input: {
  newPassword: string;
  token: string;
}) {
  return requestClient.post<{ changed: boolean }>(
    '/auth/password-reset/confirm',
    input,
  );
}

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}
