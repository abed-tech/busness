// Remplaçants minimaux de Next.js pour exécuter le vrai code serveur (actions, routes) avec node:test.
export const jar = new Map<string, string>();
export const reqHeaders: Record<string, string> = { host: "localhost", "user-agent": "test-integration", "x-forwarded-for": "10.0.0.1" };
export async function cookies() {
  return {
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)! } : undefined),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (n: string, v: string, o?: { maxAge?: number }) => { if (!v || o?.maxAge === 0) jar.delete(n); else jar.set(n, v); },
    delete: (n: string) => { jar.delete(n); },
  };
}
export async function headers() { return new Headers(reqHeaders); }
export class RedirectError extends Error { constructor(public url: string) { super("REDIRECT " + url); } }
export function redirect(url: string): never { throw new RedirectError(url); }
export function notFound(): never { throw new RedirectError("404"); }
export function revalidatePath() {}
export function cache<T>(f: T): T { return f; }
// composants client rendus dans les tests de pages : effets ignorés, routeur inerte
export function useEffect() {}
export function useRef<T>(v: T | null = null) { return { current: v }; }
export function useId() { return "id"; }
export function useState<T>(v: T) { return [v, () => {}] as const; }
export function useActionState<S>(_a: unknown, init: S) { return [init, () => {}, false] as const; }
export function useRouter() { return { refresh() {}, replace() {}, push() {} }; }
export class NextResponse extends Response {
  static redirect(url: string | URL, status = 307) { return new Response(null, { status, headers: { location: String(url) } }); }
  static json(d: unknown, init: ResponseInit = {}) { return new Response(JSON.stringify(d), { ...init, headers: { "Content-Type": "application/json", ...(init.headers || {}) } }); }
}
export class NextRequest extends Request { get nextUrl() { return new URL(this.url); } }
export const QRCode = { toDataURL: async (t: string) => "data:image/png;base64," + Buffer.from(t).toString("base64"), toString: async (t: string) => `<svg data-qr="${t}"></svg>` };
export function useCallback<T>(f: T) { return f; }
export function useMemo<T>(f: () => T) { return f(); }
export function useTransition() { return [false, (f: () => void) => f()] as const; }
export default QRCode;
