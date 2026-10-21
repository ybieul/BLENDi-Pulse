// apps/api/scripts/backfill-daily-fat-target.ts
//
// Preenche dailyFatTarget para contas criadas antes desta correção (ver
// docs/fixes/cp-a.8-dailyfattarget-criacao-de-conta-e-campo-mobile.md), que
// nunca tiveram esse campo setado em
// UserModel.create(). Cada documento recebe o valor derivado do seu PRÓPRIO
// dailyCalorieTarget (round(dailyCalorieTarget*0.3/9) — mesma fórmula de
// calculateFatTargetFromCalories, apps/api/src/utils/macroCalculation.utils.ts),
// nunca um número fixo. Só preenche quem não tem o campo ($exists: false) —
// nenhum valor já salvo é sobrescrito.
//
// Uso: npx tsx apps/api/scripts/backfill-daily-fat-target.ts
import 'dotenv/config';
import mongoose from 'mongoose';

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI não definida.');
  }

  await mongoose.connect(uri, { dbName: 'test' });
  const users = mongoose.connection.db!.collection('users');

  const before = await users.countDocuments({ dailyFatTarget: { $exists: false } });
  console.log('MISSING_BEFORE:', before);

  const result = await users.updateMany({ dailyFatTarget: { $exists: false } }, [
    {
      $set: {
        dailyFatTarget: {
          $round: [{ $divide: [{ $multiply: ['$dailyCalorieTarget', 0.3] }, 9] }, 0],
        },
      },
    },
  ]);
  console.log('MATCHED:', result.matchedCount, 'MODIFIED:', result.modifiedCount);

  const after = await users.countDocuments({ dailyFatTarget: { $exists: false } });
  console.log('MISSING_AFTER:', after);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exit(1);
});
