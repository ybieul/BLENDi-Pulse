// apps/api/src/config/env.ts
// Valida e exporta todas as variáveis de ambiente.
// O servidor NÃO sobe se qualquer variável obrigatória estiver ausente.
// Importe SEMPRE daqui — nunca acesse process.env diretamente nos outros arquivos.

import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // Servidor
  PORT: z
    .string()
    .default('3000')
    .transform(Number)
    .refine(n => n > 0 && n < 65536, 'PORT deve ser um número entre 1 e 65535'),
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  API_VERSION: z.string().min(1, 'API_VERSION é obrigatória'),

  // MongoDB
  MONGODB_URI: z
    .string()
    .min(1, 'MONGODB_URI é obrigatória')
    .refine(
      uri => uri.startsWith('mongodb://') || uri.startsWith('mongodb+srv://'),
      'MONGODB_URI deve começar com mongodb:// ou mongodb+srv://'
    ),

  // JWT
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET deve ter pelo menos 32 caracteres'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET deve ter pelo menos 32 caracteres'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // CORS
  ALLOWED_ORIGINS: z.string().default('http://localhost:8081'),
});

// Valida sincronamente — se falhar, lança erro e mata o processo
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map(i => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');

  console.error('❌  Variáveis de ambiente inválidas ou ausentes:\n');
  console.error(issues);
  console.error('\n👉  Verifique o arquivo .env.example e corrija o .env\n');
  process.exit(1);
}

export const env = parsed.data;

// Tipos inferidos
export type Env = typeof env;
