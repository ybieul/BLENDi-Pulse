// CP-C2 — Contexto do tutorial para as telas (hoje só a linha "Ver tutorial
// de novo" em Me). Arquivo leve: não importa o motor nem o cliente HTTP.
import { createContext, useContext } from 'react';

export interface TutorialContextValue {
  replay: () => void;
  isRunning: boolean;
}

export const TutorialContext = createContext<TutorialContextValue>({
  replay: () => undefined,
  isRunning: false,
});

export function useTutorial(): TutorialContextValue {
  return useContext(TutorialContext);
}
