// apps/api/src/utils/accountDefaults.utils.ts
//
// Valores-placeholder aplicados SÓ na criação da conta (POST /auth/register
// e POST /auth/google/callback, Caso 3 — primeiro acesso via Google).
//
// birthDate/biologicalSex/weightGoal/activityLevel são obrigatórios no
// modelo (User.ts) desde a correção de BMR/TDEE real (ver cp-a-macros.md),
// mas o app mobile ainda não tem nenhuma tela que colete esses 4 dados do
// usuário — isso quebrava literalmente a criação de conta nos dois
// caminhos, porque UserModel.create() sempre falhava com ValidationError
// por campo obrigatório ausente (achado 1 do CP-A, Tarefa 6, "Desvio 2":
// aceito e documentado como pendência na época, nunca corrigido até agora).
//
// Estes valores só destravam a criação da conta — são sobrescritos pelo
// primeiro PATCH /users/me real que trouxer os dados verdadeiros do usuário
// (a tela de onboarding/perfil que os coletaria é outro CP, ainda não
// construído). biologicalSex='male' e idade 30 (via birthDate) reproduzem
// deliberadamente a MESMA suposição que o próprio sistema já fazia,
// hardcoded dentro da fórmula, antes de toda esta linha de correção (ver
// diagnostico-macros.md: "idade sempre 30, sexo sempre a constante
// masculina") — não é um viés novo introduzido aqui, é o mesmo placeholder
// histórico, agora um dado explícito no documento em vez de uma constante
// escondida dentro do cálculo.
import { subYears } from 'date-fns';

import type { ActivityLevel, BiologicalSex, WeightGoal } from '../models/User';

export interface AccountCreationBodyProfileDefaults {
  weightGoal: WeightGoal;
  biologicalSex: BiologicalSex;
  activityLevel: ActivityLevel;
  birthDate: Date;
}

export function getAccountCreationBodyProfileDefaults(): AccountCreationBodyProfileDefaults {
  return {
    weightGoal: 'maintain',
    biologicalSex: 'male',
    activityLevel: 'moderatelyActive',
    birthDate: subYears(new Date(), 30),
  };
}
