export type ApiError = { code: string; message: string };

export function ok(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });
}

export function fail(status: number, code: string, message: string, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    ...init,
    headers: { "content-type": "application/json; charset=utf-8", ...init.headers },
  });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
