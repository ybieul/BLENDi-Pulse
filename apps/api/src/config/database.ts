// apps/api/src/config/database.ts
// Gerencia a conexão com o MongoDB Atlas via Mongoose.
// O servidor não sobe sem banco — se a conexão falhar, o processo encerra.

import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(): Promise<void> {
  try {
    const conn = await mongoose.connect(env.MONGODB_URI, {
      // Reconexão automática habilitada por padrão no Mongoose 8+
      serverSelectionTimeoutMS: 10_000, // 10s para selecionar servidor
      socketTimeoutMS: 45_000,          // 45s para operações
    });

    console.log(`✅  MongoDB conectado: ${conn.connection.name} (${conn.connection.host})`);
  } catch (error) {
    console.error('❌  Falha ao conectar com o MongoDB:');
    console.error(error);
    process.exit(1);
  }

  // Eventos de conexão — úteis para monitorar drops em produção
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️   MongoDB desconectado. Reconectando…');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('✅  MongoDB reconectado.');
  });

  mongoose.connection.on('error', err => {
    console.error('❌  Erro na conexão MongoDB:', err);
  });
}
