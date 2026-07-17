import { createSign } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Autenticação Google via service account — SEM dependência externa.
 *
 * O projeto já assina/valida JWT na mão com `node:crypto` (JWT do Cloudflare Access,
 * api/security.ts), então seguimos o mesmo padrão em vez de arrastar `googleapis`
 * (~50MB) só para ler 6 abas. Fluxo padrão JWT-bearer do Google:
 *   1. monta um JWT RS256 assinado com a private key da SA;
 *   2. troca o JWT por um access_token em oauth2.googleapis.com/token;
 *   3. usa o token como Bearer na Sheets API v4.
 *
 * Escopo read-only: a dashboard NUNCA escreve na planilha do cliente.
 */
export const SHEETS_READONLY_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
/** Renova antes de expirar de fato, para não perder corrida com o relógio. */
const EXPIRY_SKEW_SECONDS = 60;

export interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
  type?: string;
}

/** Lê e valida o JSON da service account, com erro acionável (não um TypeError opaco). */
export function readServiceAccountKey(path: string): ServiceAccountKey {
  if (!existsSync(path)) {
    throw new Error(
      `Service account não encontrada em "${path}". Baixe o JSON da SA e aponte GOOGLE_SERVICE_ACCOUNT_JSON para ele (ver docs/runbook.md § service account).`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new Error(`Service account em "${path}" não é JSON válido: ${(e as Error).message}`);
  }
  const key = parsed as Partial<ServiceAccountKey>;
  if (key.type && key.type !== 'service_account') {
    throw new Error(
      `"${path}" não é uma chave de service account (type="${key.type}"). Baixe a chave em IAM → Service Accounts → Keys → Add key → JSON.`,
    );
  }
  if (!key.client_email || !key.private_key) {
    throw new Error(
      `Service account em "${path}" está incompleta (faltando client_email e/ou private_key).`,
    );
  }
  return key as ServiceAccountKey;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Monta o JWT assinado (RS256) que o Google troca por access_token. */
function buildAssertion(key: ServiceAccountKey, scope: string, nowSeconds: number): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    }),
  );
  const signingInput = `${header}.${claims}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  // A private key do JSON vem com "\n" escapado quando passa por .env/CI.
  const pem = key.private_key.includes('\\n')
    ? key.private_key.replace(/\\n/g, '\n')
    : key.private_key;
  const signature = base64url(signer.sign(pem));
  return `${signingInput}.${signature}`;
}

interface CachedToken {
  token: string;
  expiresAtSeconds: number;
}

/**
 * Emissor de access_token com cache em memória. O sync roda a cada 20 min e o token
 * vale 1h, então na prática buscamos token ~1x/hora em vez de a cada aba.
 */
export class GoogleServiceAccountAuth {
  private cached: CachedToken | null = null;

  constructor(
    private readonly key: ServiceAccountKey,
    private readonly scope: string = SHEETS_READONLY_SCOPE,
  ) {}

  static fromFile(path: string, scope: string = SHEETS_READONLY_SCOPE): GoogleServiceAccountAuth {
    return new GoogleServiceAccountAuth(readServiceAccountKey(path), scope);
  }

  get clientEmail(): string {
    return this.key.client_email;
  }

  async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.cached && this.cached.expiresAtSeconds - EXPIRY_SKEW_SECONDS > now) {
      return this.cached.token;
    }
    const assertion = buildAssertion(this.key, this.scope, now);
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const bodyText = await res.text();
    if (!res.ok) {
      throw new Error(
        `Falha ao obter access_token do Google (HTTP ${res.status}) para ${this.key.client_email}: ${bodyText.slice(0, 300)}`,
      );
    }
    const body = JSON.parse(bodyText) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw new Error(`Resposta do token sem access_token: ${bodyText.slice(0, 300)}`);
    }
    this.cached = {
      token: body.access_token,
      expiresAtSeconds: now + (body.expires_in ?? 3600),
    };
    return this.cached.token;
  }

  /** Invalida o cache (usado quando a API devolve 401 — token revogado antes da hora). */
  invalidate(): void {
    this.cached = null;
  }
}
