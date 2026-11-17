export type FileMap = Record<string, string | { base64: string } | { content: string }>;
export interface PublishOptions { slug: string; merge?: boolean; spa?: boolean; ttl?: number | string; ref?: string; heardFrom?: string; }
export interface ClientOptions { token?: string | null; baseUrl?: string; client?: string; saveToken?: boolean; }
export class DeedPageError extends Error { status: number; code?: string; body: any; }
export class DeedPage {
  constructor(opts?: ClientOptions);
  token: string | null;
  publish(source: string | FileMap, opts: PublishOptions): Promise<any>;
  update(source: string | FileMap, opts: PublishOptions): Promise<any>;
  list(): Promise<any>;
  get(slug: string): Promise<any>;
  delete(slug: string): Promise<any>;
  whoami(): Promise<any>;
}
export function collectFiles(target: string): FileMap;
export function loadToken(): string | null;
export function saveToken(token: string): string | null;
export function tokenPath(): string;
export function redact<T>(value: T): T;
export const VERSION: string;
