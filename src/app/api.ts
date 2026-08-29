export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    throw new ApiError(res.status, "bad_response", `Non-JSON response from ${path}`);
  }
  if (!res.ok || !body.ok) {
    const err = body?.error ?? { code: "unknown", message: `Request to ${path} failed` };
    throw new ApiError(res.status, err.code, err.message);
  }
  return body.data as T;
}

export function put<T>(path: string, data: unknown): Promise<T> {
  return api<T>(path, { method: "PUT", body: JSON.stringify(data) });
}

export function post<T>(path: string, data?: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });
}
