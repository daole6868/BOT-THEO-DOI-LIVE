// Chỉ dùng trong Server Component

/** Gọi API từ phía server (SSR) – dùng cho trang công khai cần SEO. */
export async function serverApi<T>(path: string): Promise<T | null> {
  const base = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  try {
    const res = await fetch(`${base}/api${path}`, { cache: 'no-store', headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
