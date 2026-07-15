import { createPublicKey, createVerify } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config.js';

/**
 * Defesa em profundidade (§5.4 item 2): valida a assinatura do JWT do Cloudflare Access
 * (`Cf-Access-Jwt-Assertion`) em TODA request. Se o túnel vazar, o app ainda nega.
 * Zero dependência externa — JWKS + RS256 via node:crypto.
 * Em dev (AUTH_BYPASS=true) libera SOMENTE localhost.
 */

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  alg?: string;
}

interface JwksCache {
  keys: Map<string, ReturnType<typeof createPublicKey>>;
  fetchedAt: number;
}

let cache: JwksCache | null = null;
const JWKS_TTL_MS = 60 * 60 * 1000;

function b64urlToBuf(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}
function b64urlToJson<T>(s: string): T {
  return JSON.parse(b64urlToBuf(s).toString('utf8')) as T;
}

async function getKeys(teamDomain: string): Promise<Map<string, ReturnType<typeof createPublicKey>>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < JWKS_TTL_MS) return cache.keys;
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS fetch falhou: HTTP ${res.status}`);
  const data = (await res.json()) as { keys: Jwk[] };
  const keys = new Map<string, ReturnType<typeof createPublicKey>>();
  for (const jwk of data.keys) {
    const key = createPublicKey({ key: { kty: jwk.kty, n: jwk.n, e: jwk.e }, format: 'jwk' });
    keys.set(jwk.kid, key);
  }
  cache = { keys, fetchedAt: now };
  return keys;
}

export async function verifyAccessJwt(
  token: string,
  cfg: AppConfig,
): Promise<{ ok: boolean; email?: string; reason?: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'formato inválido' };
  const [h, p, sig] = parts as [string, string, string];
  let header: { kid?: string; alg?: string };
  let payload: { aud?: string | string[]; exp?: number; email?: string };
  try {
    header = b64urlToJson(h);
    payload = b64urlToJson(p);
  } catch {
    return { ok: false, reason: 'json inválido' };
  }
  if (header.alg !== 'RS256') return { ok: false, reason: 'alg não suportado' };
  if (!header.kid) return { ok: false, reason: 'sem kid' };

  const keys = await getKeys(cfg.cfAccessTeamDomain);
  const key = keys.get(header.kid);
  if (!key) return { ok: false, reason: 'kid desconhecido' };

  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${h}.${p}`);
  verifier.end();
  if (!verifier.verify(key, b64urlToBuf(sig))) return { ok: false, reason: 'assinatura inválida' };

  if (payload.exp && Date.now() / 1000 > payload.exp) return { ok: false, reason: 'expirado' };
  const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (cfg.cfAccessAud && !auds.includes(cfg.cfAccessAud)) return { ok: false, reason: 'aud inválido' };

  return { ok: true, email: payload.email };
}

function isLocalhost(req: FastifyRequest): boolean {
  const ip = req.ip;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/** preHandler global de auth. */
export function registerAuth(app: FastifyInstance, cfg: AppConfig): void {
  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    // rotas públicas de saúde
    if (req.url === '/healthz' || req.url === '/api/health') return;
    // assets estáticos do dashboard (o Access já protege o perímetro)
    if (!req.url.startsWith('/api/')) return;

    if (cfg.authBypass) {
      if (isLocalhost(req)) return;
      // bypass só vale em localhost — fora disso exige JWT mesmo com flag
    }

    const token = req.headers['cf-access-jwt-assertion'];
    if (typeof token !== 'string' || !token) {
      return reply.code(401).send({ error: 'Cf-Access-Jwt-Assertion ausente' });
    }
    if (!cfg.cfAccessTeamDomain || !cfg.cfAccessAud) {
      return reply.code(500).send({ error: 'Access não configurado (team domain/aud).' });
    }
    try {
      const r = await verifyAccessJwt(token, cfg);
      if (!r.ok) return reply.code(401).send({ error: `Access negado: ${r.reason}` });
    } catch (e) {
      return reply.code(401).send({ error: `Falha ao validar JWT: ${(e as Error).message}` });
    }
  });
}

/** Headers de segurança (§5.4 item 4). */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply, payload) => {
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'",
    );
    reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Frame-Options', 'DENY');
    return payload;
  });
}
