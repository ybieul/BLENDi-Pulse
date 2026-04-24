// apps/mobile/src/config/api.ts
// Instância Axios compartilhada por todos os serviços do app.
//
// ⚠️  Interceptors de autenticação (attach token, retry 401) NÃO estão aqui.
//    Eles são registrados pelo auth.store.ts no momento em que o store é
//    inicializado — isso garante que o interceptor sempre leia o token mais
//    recente do estado Zustand, sem closures desatualizados.
//
// Esta separação evita o problema de circular dependency:
//    api.ts → auth.store.ts → api.ts (ciclo quebrado mantendo api.ts puro)

import axios from 'axios';

const API_URL: string | undefined = process.env['EXPO_PUBLIC_API_URL'] as string | undefined;

if (!API_URL) {
  throw new Error(
    '[api] EXPO_PUBLIC_API_URL is not defined.\n' +
      'Copy apps/mobile/.env.example to apps/mobile/.env and set the value.'
  );
}

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});
