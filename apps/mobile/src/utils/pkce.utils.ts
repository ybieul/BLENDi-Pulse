// apps/mobile/src/utils/pkce.utils.ts
// Verificador e desafio do login Google (CP-1.1.1d), no espírito do PKCE
// (RFC 7636, método S256):
//   verificador = 32 bytes aleatórios (CSPRNG nativo) em base64url
//   desafio     = base64url(SHA-256(verificador))
//
// O verificador fica só em memória durante o fluxo (variável local do hook):
// nunca vai para log, storage ou analytics. Só o desafio sai para o backend
// ao pedir a URL de login; o verificador só sai na troca do código.
//
// Usa o expo-crypto que o projeto já tem (também em config/storage.ts).

import * as Crypto from 'expo-crypto';

const CODE_VERIFIER_BYTES = 32;

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // btoa está disponível no Hermes (RN 0.74+).
  return base64ToBase64Url(btoa(binary));
}

export async function createPkcePair(): Promise<PkcePair> {
  const randomBytes = await Crypto.getRandomBytesAsync(CODE_VERIFIER_BYTES);
  const codeVerifier = bytesToBase64Url(randomBytes);

  const challengeBase64 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    codeVerifier,
    { encoding: Crypto.CryptoEncoding.BASE64 }
  );

  return { codeVerifier, codeChallenge: base64ToBase64Url(challengeBase64) };
}
