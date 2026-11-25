// CP-B6 — cadastro de alergias (onboarding e perfil): os 8 botões, o campo
// livre (sem repetir pela normalização, limite de 10, texto limpo) e o
// texto de honestidade sempre visível; a folha de confirmação.
import { fireEvent, render } from '@testing-library/react-native';
import { useState } from 'react';
import { ALLERGY_CODE_VALUES, ALLERGY_CUSTOM_MAX_ITEMS, type UserAllergies } from '@blendi/shared';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

import { AllergiesPicker } from './AllergiesPicker';
import { AllergyConfirmationSheet } from './AllergyConfirmationSheet';

function Harness({ initial, onChange }: { initial: UserAllergies; onChange: (next: UserAllergies) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <AllergiesPicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

function renderPicker(initial: UserAllergies = { common: [], custom: [] }) {
  const onChange = jest.fn<void, [UserAllergies]>();
  const utils = render(<Harness initial={initial} onChange={onChange} />);
  return { ...utils, onChange };
}

describe('AllergiesPicker (CP-B6)', () => {
  it('mostra os 8 botões e o texto de honestidade', () => {
    const utils = renderPicker();
    for (const code of ALLERGY_CODE_VALUES) {
      expect(utils.getByTestId(`allergy-option-${code}`)).toBeTruthy();
    }
    expect(utils.getByText('allergies.picker.honesty')).toBeTruthy();
  });

  it('tocar marca e desmarca (ordem fixa), com estado acessível', () => {
    const utils = renderPicker();
    fireEvent.press(utils.getByTestId('allergy-option-egg'));
    fireEvent.press(utils.getByTestId('allergy-option-peanut'));
    expect(utils.onChange).toHaveBeenLastCalledWith({ common: ['peanut', 'egg'], custom: [] });
    expect(utils.getByTestId('allergy-option-peanut').props.accessibilityState).toMatchObject({ checked: true });

    fireEvent.press(utils.getByTestId('allergy-option-peanut'));
    expect(utils.onChange).toHaveBeenLastCalledWith({ common: ['egg'], custom: [] });
  });

  it('campo livre: adiciona limpo, recusa repetido (acento/plural) e remove', () => {
    const utils = renderPicker();
    fireEvent.changeText(utils.getByTestId('allergy-custom-input'), '  Camarão<b>  ');
    fireEvent.press(utils.getByTestId('allergy-custom-add'));
    expect(utils.onChange).toHaveBeenLastCalledWith({ common: [], custom: ['Camarão'] });

    fireEvent.changeText(utils.getByTestId('allergy-custom-input'), 'kiwi');
    fireEvent.press(utils.getByTestId('allergy-custom-add'));
    fireEvent.changeText(utils.getByTestId('allergy-custom-input'), 'Kiwis');
    fireEvent.press(utils.getByTestId('allergy-custom-add'));
    expect(utils.getByText('allergies.picker.customDuplicate')).toBeTruthy();
    expect(utils.getAllByTestId('allergy-custom-item')).toHaveLength(2);

    fireEvent.press(utils.getByTestId('allergy-custom-remove-kiwi'));
    expect(utils.onChange).toHaveBeenLastCalledWith({ common: [], custom: ['Camarão'] });
  });

  it('no limite de 10 itens, o campo some e o aviso aparece', () => {
    const custom = Array.from({ length: ALLERGY_CUSTOM_MAX_ITEMS }, (_, index) => `item ${index}`);
    const utils = renderPicker({ common: [], custom });
    expect(utils.queryByTestId('allergy-custom-input')).toBeNull();
    expect(utils.getByText(`allergies.picker.customLimit:{"max":${ALLERGY_CUSTOM_MAX_ITEMS}}`)).toBeTruthy();
  });
});

describe('AllergyConfirmationSheet (CP-B6)', () => {
  it('texto com os alérgenos e os dois botões', () => {
    const onConfirm = jest.fn();
    const onDecline = jest.fn();
    const utils = render(
      <AllergyConfirmationSheet
        allergens={{ common: ['peanut', 'milk'], custom: ['kiwi'] }}
        onConfirm={onConfirm}
        onDecline={onDecline}
        onDismiss={jest.fn()}
      />,
    );

    const body = String(utils.getByTestId('allergy-confirmation-body').props.children);
    expect(body).toContain('allergies.confirm.body');
    expect(body).toContain('allergies.inSentence.peanut, allergies.inSentence.milkallergies.listAndkiwi');
    fireEvent.press(utils.getByTestId('allergy-confirmation-confirm'));
    fireEvent.press(utils.getByTestId('allergy-confirmation-decline'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it('fechada quando não há alérgenos', () => {
    const utils = render(
      <AllergyConfirmationSheet allergens={null} onConfirm={jest.fn()} onDecline={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(utils.queryByTestId('allergy-confirmation-sheet')).toBeNull();
  });
});
