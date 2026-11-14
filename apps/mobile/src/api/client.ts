import { type ApiError, apiErrorSchema, type ErrorCode } from '@pacemate/shared';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { z } from 'zod';

const DEFAULT_TIMEOUT_MS = 15_000;

/** 서버가 준 오류 코드에, 서버에 닿지 못한 경우와 응답을 읽을 수 없는 경우를 더한다. */
export type ApiClientErrorCode = ErrorCode | 'NETWORK_ERROR' | 'INVALID_RESPONSE';

/** API 호출 실패. `message`는 사용자에게 그대로 보여 줄 수 있는 문장이다. */
export class ApiClientError extends Error {
  constructor(
    readonly code: ApiClientErrorCode,
    message: string,
    readonly detail: Pick<ApiError, 'fields' | 'usage'> = {},
  ) {
    super(message);
  }
}

let getAccessToken: () => Promise<string | null> = async () => null;

/** 로그인 모듈이 액세스 토큰을 주는 함수를 등록한다(T-106). 등록 전에는 토큰 없이 호출한다. */
export function setAccessTokenProvider(provider: () => Promise<string | null>): void {
  getAccessToken = provider;
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** 채팅처럼 오래 걸리는 요청은 늘려서 쓴다 */
  timeoutMs?: number;
};

/** API를 호출하고 응답을 `packages/shared`의 스키마로 검증한다. 실패는 모두 `ApiClientError`로 던진다. */
export async function apiFetch<T extends z.ZodType>(
  path: string,
  schema: T,
  { method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS }: RequestOptions = {},
): Promise<z.infer<T>> {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_API_URL이 설정되지 않았다');

  const token = await getAccessToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(baseUrl + path, {
      method,
      headers: {
        'X-App-Version': Constants.expoConfig?.version ?? '0.0.0',
        'X-App-Platform': Platform.OS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiClientError('NETWORK_ERROR', '인터넷 연결을 확인하고 다시 시도해 주세요.');
  } finally {
    clearTimeout(timer);
  }

  // 본문이 없거나(204) JSON이 아닌 응답(게이트웨이 오류 페이지 등)은 undefined로 둔다
  const data: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    const error = apiErrorSchema.safeParse(data);
    if (error.success) {
      const { code, message, ...detail } = error.data;
      throw new ApiClientError(code, message, detail);
    }
    throw invalidResponse();
  }

  const parsed = schema.safeParse(data);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
}

const invalidResponse = () => new ApiClientError('INVALID_RESPONSE', '문제가 생겼어요. 잠시 후 다시 시도해 주세요.');
