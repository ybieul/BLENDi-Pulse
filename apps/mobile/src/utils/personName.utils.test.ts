// Teste no build EAS (25-26/11): validação de Nome/Sobrenome nas telas com
// os mesmos schemas do backend.
import { FIRST_NAME_MAX_LENGTH, LAST_NAME_MAX_LENGTH } from '@blendi/shared';

import { validatePersonName } from './personName.utils';

describe('validatePersonName', () => {
  it('nome obrigatório; sobrenome opcional', () => {
    expect(validatePersonName('', '')).toMatchObject({ isValid: false, firstNameError: 'errors.validation.required', lastNameError: null });
    expect(validatePersonName('Ana', '')).toMatchObject({ isValid: true, firstName: 'Ana', lastName: '' });
  });

  it('limpa espaços, controle e marcação', () => {
    expect(validatePersonName('  Gabriel  ', ' <i>Silva</i>‮ ')).toMatchObject({ firstName: 'Gabriel', lastName: 'Silva', isValid: true });
  });

  it('acima do teto → too_long', () => {
    expect(validatePersonName('a'.repeat(FIRST_NAME_MAX_LENGTH + 1), '').firstNameError).toBe('errors.validation.too_long');
    expect(validatePersonName('Ana', 'b'.repeat(LAST_NAME_MAX_LENGTH + 1)).lastNameError).toBe('errors.validation.too_long');
  });
});
