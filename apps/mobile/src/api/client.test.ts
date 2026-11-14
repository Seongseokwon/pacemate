import { z } from 'zod';
import { ApiClientError, apiFetch, setAccessTokenProvider } from './client';

const schema = z.object({ status: z.literal('ok') });
const fetchMock = jest.fn();

const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce(new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));

const failure = async (promise: Promise<unknown>): Promise<ApiClientError> => {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ApiClientError);
  return error as ApiClientError;
};

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock;
  fetchMock.mockReset();
  setAccessTokenProvider(async () => null);
});

test('성공 응답을 스키마로 검증해 돌려준다', async () => {
  respond(200, { status: 'ok' });
  await expect(apiFetch('/health', schema)).resolves.toEqual({ status: 'ok' });
  expect(fetchMock.mock.calls[0][0]).toBe('http://api.test/health');
});

test('모든 요청에 앱 버전과 플랫폼을 보내고, 토큰이 있으면 함께 보낸다', async () => {
  respond(200, { status: 'ok' });
  await apiFetch('/health', schema);
  const anonymous = fetchMock.mock.calls[0][1].headers;
  expect(anonymous['X-App-Version']).toMatch(/^\d+\.\d+\.\d+$/);
  expect(['ios', 'android']).toContain(anonymous['X-App-Platform']);
  expect(anonymous.Authorization).toBeUndefined();

  setAccessTokenProvider(async () => 'token-1');
  respond(200, { status: 'ok' });
  await apiFetch('/v1/me', schema, { method: 'POST', body: { a: 1 } });
  const [, init] = fetchMock.mock.calls[1];
  expect(init.headers.Authorization).toBe('Bearer token-1');
  expect(init.headers['Content-Type']).toBe('application/json');
  expect(init.body).toBe('{"a":1}');
});

test('서버의 오류 응답은 코드와 문장을 그대로 담아 던진다', async () => {
  respond(409, { code: 'PROPOSAL_EXPIRED', message: '제안이 만료되었어요. 다시 요청해 주세요.' });
  const error = await failure(apiFetch('/v1/proposals/1/approve', schema, { method: 'POST' }));
  expect(error.code).toBe('PROPOSAL_EXPIRED');
  expect(error.message).toBe('제안이 만료되었어요. 다시 요청해 주세요.');
});

test('검증 오류의 항목별 사유를 전달한다', async () => {
  respond(400, { code: 'VALIDATION_ERROR', message: '입력한 내용을 확인해 주세요.', fields: { distanceKm: '범위를 벗어났어요' } });
  const error = await failure(apiFetch('/v1/workouts', schema, { method: 'POST', body: {} }));
  expect(error.detail.fields).toEqual({ distanceKm: '범위를 벗어났어요' });
});

test('서버에 닿지 못하면 NETWORK_ERROR다', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  expect((await failure(apiFetch('/health', schema))).code).toBe('NETWORK_ERROR');
});

test('읽을 수 없는 응답은 INVALID_RESPONSE다', async () => {
  // 오류 형식이 아닌 실패 응답(게이트웨이의 HTML 오류 페이지 등)
  respond(502, '<html>Bad Gateway</html>');
  expect((await failure(apiFetch('/health', schema))).code).toBe('INVALID_RESPONSE');
  // 성공했지만 스키마와 다른 응답
  respond(200, { status: 'unknown' });
  expect((await failure(apiFetch('/health', schema))).code).toBe('INVALID_RESPONSE');
});
