import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GoogleServiceAccountAuth,
  readServiceAccountKey,
  SHEETS_READONLY_SCOPE,
} from '../src/datasource/googleAuth.js';

/** SA sintética com par de chaves REAL — a assinatura é verificada de verdade. */
function fakeServiceAccount(): { path: string; publicKey: string; email: string } {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const email = 'mda-dashboard@mda-test.iam.gserviceaccount.com';
  const dir = mkdtempSync(join(tmpdir(), 'mda-sa-'));
  const path = join(dir, 'service-account-mda.json');
  writeFileSync(
    path,
    JSON.stringify({ type: 'service_account', client_email: email, private_key: privateKey }),
  );
  return { path, publicKey, email };
}

function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
}

test('readServiceAccountKey — erro acionável quando o arquivo não existe', () => {
  assert.throws(() => readServiceAccountKey(join(tmpdir(), 'nao-existe-mda.json')), /não encontrada/);
});

test('readServiceAccountKey — recusa JSON que não é service account (ex.: client_secret do OAuth)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mda-sa-'));
  const path = join(dir, 'oauth.json');
  writeFileSync(path, JSON.stringify({ type: 'authorized_user', client_id: 'x' }));
  assert.throws(() => readServiceAccountKey(path), /não é uma chave de service account/);
});

test('readServiceAccountKey — recusa SA sem private_key', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mda-sa-'));
  const path = join(dir, 'incompleta.json');
  writeFileSync(path, JSON.stringify({ type: 'service_account', client_email: 'a@b.com' }));
  assert.throws(() => readServiceAccountKey(path), /incompleta/);
});

test('readServiceAccountKey — JSON inválido não vira TypeError opaco', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mda-sa-'));
  const path = join(dir, 'quebrado.json');
  writeFileSync(path, '{ isso não é json');
  assert.throws(() => readServiceAccountKey(path), /não é JSON válido/);
});

test('getAccessToken — monta JWT RS256 com assinatura VÁLIDA, escopo read-only e aud correto', async () => {
  const { path, publicKey, email } = fakeServiceAccount();
  let sentAssertion = '';

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: string, init: { body: URLSearchParams }) => {
    sentAssertion = init.body.get('assertion') as string;
    assert.equal(init.body.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
    return new Response(JSON.stringify({ access_token: 'token-abc', expires_in: 3600 }), {
      status: 200,
    });
  }) as unknown as typeof fetch;

  try {
    const auth = GoogleServiceAccountAuth.fromFile(path);
    assert.equal(await auth.getAccessToken(), 'token-abc');

    const [h, c, s] = sentAssertion.split('.');
    // A assinatura confere contra a chave pública → o JWT é aceitável pelo Google.
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${h}.${c}`);
    verifier.end();
    const sigOk = verifier.verify(
      publicKey,
      Buffer.from(s!.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
    );
    assert.equal(sigOk, true, 'assinatura RS256 do JWT deve ser válida');

    assert.deepEqual(decodeSegment(h!), { alg: 'RS256', typ: 'JWT' });
    const claims = decodeSegment(c!);
    assert.equal(claims.iss, email);
    assert.equal(claims.scope, SHEETS_READONLY_SCOPE, 'dashboard nunca escreve na planilha');
    assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
    assert.ok((claims.exp as number) > (claims.iat as number));
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('getAccessToken — cacheia o token e só refaz a chamada após invalidate()', async () => {
  const { path } = fakeServiceAccount();
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ access_token: `t${calls}`, expires_in: 3600 }), {
      status: 200,
    });
  }) as unknown as typeof fetch;

  try {
    const auth = GoogleServiceAccountAuth.fromFile(path);
    assert.equal(await auth.getAccessToken(), 't1');
    assert.equal(await auth.getAccessToken(), 't1');
    assert.equal(calls, 1, 'segunda chamada deve vir do cache');
    auth.invalidate();
    assert.equal(await auth.getAccessToken(), 't2');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('getAccessToken — token quase expirado é renovado (skew)', async () => {
  const { path } = fakeServiceAccount();
  let calls = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls += 1;
    // expires_in de 30s < skew de 60s → nunca deve ser reaproveitado.
    return new Response(JSON.stringify({ access_token: `t${calls}`, expires_in: 30 }), {
      status: 200,
    });
  }) as unknown as typeof fetch;

  try {
    const auth = GoogleServiceAccountAuth.fromFile(path);
    await auth.getAccessToken();
    await auth.getAccessToken();
    assert.equal(calls, 2, 'token dentro da janela de skew deve ser renovado');
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('getAccessToken — erro do Google vira mensagem com o e-mail da SA', async () => {
  const { path } = fakeServiceAccount();
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })) as unknown as typeof fetch;
  try {
    const auth = GoogleServiceAccountAuth.fromFile(path);
    await assert.rejects(auth.getAccessToken(), /Falha ao obter access_token.*mda-dashboard@/s);
  } finally {
    globalThis.fetch = realFetch;
  }
});
