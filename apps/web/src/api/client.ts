import type { ApiError, ApiResult } from '@checkout/contracts';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export type ApiFieldError = {
  path: string;
  message: string;
};

export type ApiFailure = {
  kind: 'network' | 'http' | 'parse' | 'aborted';
  status?: number;
  code: string;
  message: string;
  requestId?: string;
  fields: ApiFieldError[];
};

export type ApiResponse<T> = {
  data: T;
  requestId?: string;
  links: ApiResult<T>['links'];
  location?: string;
  retryAfterMs?: number;
  status: number;
};

export type RequestOptions = {
  method?: HttpMethod;
  path: string;
  body?: unknown;
  token?: string | null;
  idempotencyKey?: string;
  signal?: AbortSignal;
};

const defaultBaseUrl = 'http://localhost:4000';
const baseUrl = (import.meta.env.VITE_API_URL ?? defaultBaseUrl).replace(/\/$/, '');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const asApiError = (value: unknown): ApiError | null => {
  if (!isRecord(value) || !isRecord(value.error)) return null;
  const { error, meta } = value;
  if (typeof error.code !== 'string' || typeof error.message !== 'string') return null;
  return {
    error: {
      code: error.code,
      message: error.message,
      fields: Array.isArray(error.fields)
        ? error.fields.flatMap((field) =>
            isRecord(field) && typeof field.path === 'string' && typeof field.message === 'string'
              ? [{ path: field.path, message: field.message }]
              : [],
          )
        : undefined,
    },
    meta: { requestId: isRecord(meta) && typeof meta.requestId === 'string' ? meta.requestId : '' },
  };
};

const normalizeUnknownError = (error: unknown): ApiFailure => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      kind: 'aborted',
      code: 'ABORTED',
      message: 'Запрос отменён.',
      fields: [],
    };
  }
  if (isRecord(error) && error.kind && typeof error.message === 'string')
    return error as ApiFailure;
  return {
    kind: 'network',
    code: 'NETWORK_ERROR',
    message: 'Не удалось связаться с API. Проверьте, что сервер запущен.',
    fields: [],
  };
};

const readBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) return undefined;
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw {
      kind: 'parse',
      status: response.status,
      code: 'RESPONSE_PARSE_ERROR',
      message: 'API вернул ответ в неожиданном формате.',
      requestId: response.headers.get('X-Request-Id') ?? undefined,
      fields: [],
    } satisfies ApiFailure;
  }
};

export async function request<T>({
  method = 'GET',
  path,
  body,
  token,
  idempotencyKey,
  signal,
}: RequestOptions): Promise<ApiResponse<T>> {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);
  if (body !== undefined) headers.set('Content-Type', 'application/json');

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw normalizeUnknownError(error);
  }

  const parsed = await readBody(response);
  const requestId = response.headers.get('X-Request-Id') ?? undefined;

  if (!response.ok) {
    const apiError = asApiError(parsed);
    throw {
      kind: 'http',
      status: response.status,
      code: apiError?.error.code ?? `HTTP_${response.status}`,
      message: apiError?.error.message ?? 'Запрос завершился ошибкой.',
      requestId: apiError?.meta.requestId || requestId,
      fields: apiError?.error.fields ?? [],
    } satisfies ApiFailure;
  }

  if (response.status === 204) {
    return { data: undefined as T, links: {}, requestId, status: response.status };
  }

  if (!isRecord(parsed) || !('data' in parsed)) {
    throw {
      kind: 'parse',
      status: response.status,
      code: 'RESPONSE_SHAPE_ERROR',
      message: 'API вернул ответ без поля data.',
      requestId,
      fields: [],
    } satisfies ApiFailure;
  }

  const retryAfter = response.headers.get('Retry-After');
  return {
    data: parsed.data as T,
    links: isRecord(parsed.links) ? (parsed.links as ApiResult<T>['links']) : {},
    requestId:
      isRecord(parsed.meta) && typeof parsed.meta.requestId === 'string'
        ? parsed.meta.requestId
        : requestId,
    location: response.headers.get('Location') ?? undefined,
    retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : undefined,
    status: response.status,
  };
}

export const toApiFailure = normalizeUnknownError;
