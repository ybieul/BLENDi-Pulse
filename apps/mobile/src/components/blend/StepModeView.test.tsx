// Testa a navegação entre passos do StepModeView (contador de posição,
// avançar/voltar, conclusão no último passo) e o contador de pulso — que é
// só uma referência visual e nunca bloqueia o avanço, mesmo sem atingir a
// contagem alvo. useColors é mockado pra isolar da store de tema (MMKV);
// useAppTranslation usa identidade pra podermos checar a chave+interpolação
// renderizada sem depender do i18next real.
import { fireEvent, fireEventAsync, render } from '@testing-library/react-native';

jest.mock('../../hooks/useColors', () => ({
  useColors: () => ({
    overlay: { plum: { 8: '#000', 12: '#000' }, pulse: { 20: '#000', 40: '#000' } },
    brand: { pulse: '#000' },
    text: { primary: '#000', inverse: '#fff' },
  }),
}));

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options ? `${key}:${JSON.stringify(options)}` : key,
  }),
}));

import { StepModeView, type StepModeViewStep } from './StepModeView';

const STEPS: StepModeViewStep[] = [
  { text: 'Add oats and milk to the cup.' },
  { text: 'Add frozen mango and pulse to break it up.', pulseCount: 8 },
  { text: 'Blend on high for 30 seconds.' },
];

function renderStepMode(steps: StepModeViewStep[], onComplete: () => void) {
  return render(<StepModeView steps={steps} onComplete={onComplete} />);
}

describe('StepModeView — navegação entre passos', () => {
  it('mostra o primeiro passo e o contador de posição', () => {
    const { getByText } = renderStepMode(STEPS, jest.fn());

    expect(getByText('Add oats and milk to the cup.')).toBeTruthy();
    expect(getByText('blend.stepCounter:{"current":1,"total":3}')).toBeTruthy();
  });

  it('avança para o próximo passo ao pressionar "avançar"', () => {
    const { getByRole, getByText } = renderStepMode(STEPS, jest.fn());

    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));

    expect(getByText('Add frozen mango and pulse to break it up.')).toBeTruthy();
    expect(getByText('blend.stepCounter:{"current":2,"total":3}')).toBeTruthy();
  });

  it('volta para o passo anterior ao pressionar "voltar"', () => {
    const { getByRole, getByText } = renderStepMode(STEPS, jest.fn());

    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));
    fireEvent.press(getByRole('button', { name: 'blend.stepBack' }));

    expect(getByText('Add oats and milk to the cup.')).toBeTruthy();
    expect(getByText('blend.stepCounter:{"current":1,"total":3}')).toBeTruthy();
  });

  it('desabilita "voltar" no primeiro passo', () => {
    const { getByRole } = renderStepMode(STEPS, jest.fn());

    expect(getByRole('button', { name: 'blend.stepBack' })).toBeDisabled();
  });

  it('chama onComplete ao avançar a partir do último passo, sem estourar o array', () => {
    const onComplete = jest.fn();
    const { getByRole, getByText } = renderStepMode(STEPS, onComplete);

    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));
    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));

    expect(getByText('Blend on high for 30 seconds.')).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

describe('StepModeView — contador de pulso', () => {
  it('não mostra contador de pulso em passos sem pulseCount', () => {
    const { queryByText } = renderStepMode([STEPS[0]], jest.fn());

    expect(queryByText('blend.pulseButton')).toBeNull();
  });

  it('incrementa o contador de pulso a cada toque, sem travar o avanço antes de atingir o alvo', async () => {
    const { getByRole, getByText } = renderStepMode(STEPS, jest.fn());

    fireEvent.press(getByRole('button', { name: 'blend.stepNext' })); // vai para o passo com pulseCount: 8

    expect(getByText('blend.pulseCounter:{"current":0,"target":8}')).toBeTruthy();

    // o toque de pulso dispara haptics (async) antes de incrementar o
    // contador — fireEventAsync aguarda esse handler terminar, diferente
    // de fireEvent (síncrono), que não esperaria a Promise resolver.
    const pulseButton = getByRole('button', { name: 'blend.pulseButton' });
    await fireEventAsync.press(pulseButton);
    await fireEventAsync.press(pulseButton);

    expect(getByText('blend.pulseCounter:{"current":2,"target":8}')).toBeTruthy();

    // avançar continua disponível mesmo sem bater os 8 pulsos alvo
    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));
    expect(getByText('Blend on high for 30 seconds.')).toBeTruthy();
  });

  it('reseta o contador de pulso ao navegar para outro passo', async () => {
    const { getByRole, getByText } = renderStepMode(STEPS, jest.fn());

    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));
    await fireEventAsync.press(getByRole('button', { name: 'blend.pulseButton' }));

    expect(getByText('blend.pulseCounter:{"current":1,"target":8}')).toBeTruthy();

    fireEvent.press(getByRole('button', { name: 'blend.stepBack' }));
    fireEvent.press(getByRole('button', { name: 'blend.stepNext' }));

    expect(getByText('blend.pulseCounter:{"current":0,"target":8}')).toBeTruthy();
  });
});
