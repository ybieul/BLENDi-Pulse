// Troca de modelo no Me: as mesmas 5 opções do onboarding, campo de marca/modelo
// só em "Other" (pré-preenchido com o valor salvo) e o que vai no onConfirm.
import { fireEvent, render } from '@testing-library/react-native';
import { TextInput } from 'react-native';

jest.mock('../../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({ t: (key: string) => key }),
}));

import { EditSettingSheet } from './EditSettingSheet';

const onConfirm = jest.fn<void, [string | number, { otherBlenderModel: string }?]>();
const onClose = jest.fn();

function renderModelSheet(currentValue: string, currentOtherBlenderModel?: string | null) {
  return render(
    <EditSettingSheet
      type="model"
      currentValue={currentValue}
      currentOtherBlenderModel={currentOtherBlenderModel}
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}

beforeEach(() => {
  onConfirm.mockReset();
  onClose.mockReset();
});

describe('EditSettingSheet — modelo', () => {
  it('lista as 5 opções com os badges 70W/120W/180W nas três primeiras', () => {
    const { getByText, queryByText } = renderModelSheet('Lite');

    for (const title of [
      'onboarding.model.lite.name',
      'onboarding.model.pro_plus.name',
      'onboarding.model.steel.name',
      'onboarding.modelOtherTitle',
      'onboarding.modelNoneTitle',
    ]) {
      expect(getByText(title)).toBeTruthy();
    }
    expect(getByText('70W')).toBeTruthy();
    expect(getByText('120W')).toBeTruthy();
    expect(getByText('180W')).toBeTruthy();
    expect(queryByText('Starter')).toBeNull();
  });

  it('só um card selecionado: o da posse atual (conta "other" abre em "Other")', () => {
    const { getAllByRole } = renderModelSheet('other', 'Ninja');
    const selected = getAllByRole('button', { selected: true });
    expect(selected).toHaveLength(1);
  });

  it('campo de texto só aparece em "Other" e vem pré-preenchido com o valor salvo (máx. 60)', () => {
    const { UNSAFE_getAllByType, UNSAFE_queryAllByType, getByText } = renderModelSheet('other', 'Ninja BN401');

    const inputs = UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.props.value).toBe('Ninja BN401');
    expect(inputs[0]?.props.maxLength).toBe(60);

    fireEvent.press(getByText('onboarding.model.steel.name'));
    expect(UNSAFE_queryAllByType(TextInput)).toHaveLength(0);
  });

  it('conta com "other" sem texto salvo abre o campo vazio', () => {
    const { UNSAFE_getAllByType } = renderModelSheet('other', null);
    expect(UNSAFE_getAllByType(TextInput)[0]?.props.value).toBe('');
  });

  it('salvar "other" com texto editado envia a chave da opção e o texto (com trim)', () => {
    const { UNSAFE_getAllByType, getByRole } = renderModelSheet('other', 'Ninja');

    fireEvent.changeText(UNSAFE_getAllByType(TextInput)[0], '  Oster Blend  ');
    fireEvent.press(getByRole('button', { name: 'me.edit.confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('other', { otherBlenderModel: 'Oster Blend' });
  });

  it('trocar para "No BLENDi yet" e salvar envia a chave "none"', () => {
    const { getByText, getByRole } = renderModelSheet('Steel');

    fireEvent.press(getByText('onboarding.modelNoneTitle'));
    fireEvent.press(getByRole('button', { name: 'me.edit.confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0]?.[0]).toBe('none');
  });

  it('trocar de "Other" para um BLENDi real envia o modelo', () => {
    const { getByText, getByRole } = renderModelSheet('other', 'Ninja');

    fireEvent.press(getByText('onboarding.model.pro_plus.name'));
    fireEvent.press(getByRole('button', { name: 'me.edit.confirm' }));

    expect(onConfirm.mock.calls[0]?.[0]).toBe('ProPlus');
  });
});

describe('EditSettingSheet — outros tipos não mudam', () => {
  it('goal não mostra campo de texto de modelo e confirma sem detalhes', () => {
    const { UNSAFE_queryAllByType, getByRole } = render(
      <EditSettingSheet type="goal" currentValue="Muscle" onConfirm={onConfirm} onClose={onClose} />
    );

    expect(UNSAFE_queryAllByType(TextInput)).toHaveLength(0);

    fireEvent.press(getByRole('button', { name: 'me.edit.confirm' }));
    expect(onConfirm).toHaveBeenCalledWith('Muscle');
  });

  // Proteína, carboidratos, calorias e hidratação saíram daqui (agora na tela
  // "Minhas metas"); a gordura continua existindo, com a linha comentada no Me.
  it('fat continua com campo numérico e confirma o valor digitado como número', () => {
    const { UNSAFE_getAllByType, getByRole } = render(
      <EditSettingSheet type="fat" currentValue={67} onConfirm={onConfirm} onClose={onClose} />
    );

    const inputs = UNSAFE_getAllByType(TextInput);
    expect(inputs).toHaveLength(1);
    expect(inputs[0]?.props.value).toBe('67');
    expect(inputs[0]?.props.keyboardType).toBe('numeric');

    fireEvent.changeText(inputs[0], '80');
    fireEvent.press(getByRole('button', { name: 'me.edit.confirm' }));

    expect(onConfirm).toHaveBeenCalledWith(80);
  });
});
