'use client';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message);
  }
}

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function getCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  csrfPromise ??= fetch('/api/admin/auth/csrf', { credentials: 'include' })
    .then((r) => r.json())
    .then((j) => (csrfToken = j.token as string))
    .finally(() => (csrfPromise = null));
  return csrfPromise;
}

type StepUpHandler = () => Promise<boolean>;
let stepUpHandler: StepUpHandler | null = null;
/** Provider đăng ký hộp thoại nhập mã 2FA khi server yêu cầu xác thực lại. */
export function registerStepUp(h: StepUpHandler | null) {
  stepUpHandler = h;
}

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  idem?: string;
  noStepUp?: boolean;
}

export async function api<T = any>(path: string, opts: ApiOptions = {}, retried = false): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers['Content-Type'] = 'application/json';
  if (method !== 'GET') headers['X-CSRF-Token'] = await getCsrf();
  if (opts.idem) headers['Idempotency-Key'] = opts.idem;

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: opts.body === undefined ? undefined : isForm ? (opts.body as FormData) : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (res.ok) return data as T;

  const err = data?.error ?? {};
  if (res.status === 403 && err.code === 'CSRF_INVALID' && !retried) {
    csrfToken = null;
    return api<T>(path, opts, true);
  }
  if (res.status === 403 && err.code === 'MFA_REQUIRED' && stepUpHandler && !opts.noStepUp && !retried) {
    const ok = await stepUpHandler();
    if (ok) return api<T>(path, opts, true);
  }
  throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? 'Đã có lỗi xảy ra', err.details);
}

export function uuid(): string {
  return crypto.randomUUID();
}

export async function uploadImage(file: File, purpose: string): Promise<{ id: string; url: string; isPublic: boolean }> {
  const fd = new FormData();
  fd.append('file', file);
  return api(`/uploads?purpose=${encodeURIComponent(purpose)}`, { method: 'POST', body: fd });
}

export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    const fe = e.details?.fieldErrors as Record<string, string[]> | undefined;
    if (fe) {
      const first = Object.values(fe).flat()[0];
      if (first) return first;
    }
    return e.message;
  }
  return 'Không kết nối được máy chủ';
}
