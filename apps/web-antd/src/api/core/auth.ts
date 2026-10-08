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
  // 保留 HTTP 状态，区分会话失效与暂时的网络/服务故障。
  const response =
    await baseRequestClient.instance.post<AuthApi.RefreshTokenResult>(
      '/auth/refresh',
      undefined,
      { withCredentials: true },
    );
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

/**
 * 获取用户权限码
 */
export async function getAccessCodesApi() {
  return requestClient.get<string[]>('/auth/codes');
}
