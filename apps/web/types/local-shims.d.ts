// Déclarations minimales utilisées UNIQUEMENT pour la vérification de types hors ligne (sans npm).
// Exclues de tsconfig.json : un vrai `pnpm install` fournit les types officiels.
declare module "*.css";
declare module "react" {
  export function cache<T extends (...a: any[]) => any>(f: T): T;
  export type ReactNode = any;
  export interface RefObject<T> { current: T | null }
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useRef<T>(init: T): { current: T };
  export function useRef<T>(init: T | null): RefObject<T>;
  export function useMemo<T>(f: () => T, deps: unknown[]): T;
  export function useId(): string;
  export function useEffect(f: () => void | (() => void), deps?: unknown[]): void;
  export function useCallback<T extends (...a: any[]) => any>(f: T, deps: unknown[]): T;
  export function useTransition(): [boolean, (cb: () => void | Promise<void>) => void];
  export function useActionState<S, P = FormData>(action: (state: S, payload: P) => Promise<S>, init: S): [S, (payload: P) => void, boolean];
}
declare module "next/link" { const Link: (p: { href: string; className?: string; children?: any; "aria-current"?: any; [k: string]: any }) => any; export default Link; }
declare module "next/navigation" { export function redirect(url: string): never; export function usePathname(): string; export function notFound(): never; export function useRouter(): { refresh(): void; push(u: string): void }; }
declare module "next/cache" { export function revalidatePath(p: string, type?: "layout" | "page"): void; }
declare module "next/headers" {
  export function headers(): Promise<{ get(n: string): string | null }>;
  export function cookies(): Promise<{ getAll(): { name: string; value: string }[]; set(n: string, v: string, o?: Record<string, unknown>): void; get(n: string): { value: string } | undefined; delete(n: string): void }>;
}
declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL; cookies: { getAll(): { name: string; value: string }[]; get(n: string): { value: string } | undefined; set(n: string, v: string): void };
  }
  export class NextResponse extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit);
    cookies: { set(n: string, v: string, o?: Record<string, unknown>): void; delete(n: string): void };
    static next(o?: { request?: Request }): NextResponse;
    static redirect(u: URL | string, status?: number): NextResponse;
    static json(b: unknown, init?: ResponseInit): NextResponse;
  }
}
declare module "qrcode" { const QRCode: { toString(t: string, o?: any): Promise<string>; toDataURL(t: string, o?: any): Promise<string> }; export default QRCode; }
declare module "server-only" {}
declare module "jsqr" { const jsQR: (data: Uint8ClampedArray, w: number, h: number, o?: { inversionAttempts?: string }) => { data: string } | null; export default jsQR; }

declare module "pg" {
  namespace pg { type Pool = any; type PoolConfig = any; }
  const pg: { Pool: new (cfg: any) => any; Client: new (cfg: any) => any };
  export default pg;
}
