# CP1.0 — Navegacao, Query Cache e Ai Cache

## Decisoes tecnicas

1. TTLs centralizados em dois arquivos espelhados.
   O mobile usa milissegundos em [apps/mobile/src/config/cache.config.ts](apps/mobile/src/config/cache.config.ts) porque essa e a unidade esperada por React Query e pela persistencia local. A API usa segundos em [apps/api/src/config/cache.config.ts](apps/api/src/config/cache.config.ts) porque o indice TTL do MongoDB opera nessa unidade.

2. Persistencia do React Query limitada a uma whitelist explicita.
   Em [apps/mobile/src/config/queryClient.ts](apps/mobile/src/config/queryClient.ts), so queries cujas chaves raiz aparecem em QUERY_KEYS entram no MMKV. Isso evita persistir estados efemeros, como dados diarios que perdem valor rapidamente.

3. PersistQueryClientProvider como ponto unico de hidratacao.
   O App usa PersistQueryClientProvider em [apps/mobile/App.tsx](apps/mobile/App.tsx) em vez de manter persistQueryClient como efeito colateral de modulo. Isso garante ordem previsivel de restauracao, inscricao e re-render dentro da arvore React.

4. Splash nativa antes de qualquer provider.
   O carregamento das fontes e bloqueante para a UI inicial em [apps/mobile/App.tsx](apps/mobile/App.tsx). Enquanto as fontes nao estao prontas, o componente retorna null e a splash nativa do Expo continua visivel. Isso elimina flash de conteudo com tipografia incorreta.

5. RootNavigator separado do boot do App.
   A decisao de qual fluxo renderizar fica em [apps/mobile/src/navigation/RootNavigator.tsx](apps/mobile/src/navigation/RootNavigator.tsx), enquanto a restauracao da sessao continua no App root. O estado isRestoringSession do Zustand protege contra flicker entre auth e app.

6. Ai cache com chave composta materializada.
   O modelo [apps/api/src/models/AiCache.ts](apps/api/src/models/AiCache.ts) usa cacheKey unico em vez de depender de um indice composto multi-campo. Isso simplifica lookup O(1), invalida entradas antigas com menos logica e desacopla o service do formato interno de indices do Mongo.

7. Normalizacao agressiva da mensagem antes do hash.
   Em [apps/api/src/services/cache.service.ts](apps/api/src/services/cache.service.ts), a mensagem do usuario e reduzida para lowercase, sem pontuacao e com espacos normalizados antes do SHA-256. O objetivo e aumentar cache hit para prompts semanticamente iguais, mesmo com pequenas variacoes cosmeticas.

8. Placeholders com acoes minimas de validacao.
   Os placeholders de [apps/mobile/src/navigation/AuthNavigator.tsx](apps/mobile/src/navigation/AuthNavigator.tsx) e [apps/mobile/src/navigation/AppNavigator.tsx](apps/mobile/src/navigation/AppNavigator.tsx) ganharam controles minimos para navegar entre rotas e trocar idioma. Isso foi necessario porque o checkpoint ainda nao inclui telas reais, mas precisava permitir validacao manual do fluxo.

9. Gatilhos dev-only para simular sessao.
   O botao de simulacao de sessao autenticada no Login e o reset de sessao na aba Me existem apenas em __DEV__. Eles nao afetam producao e viabilizam smoke tests locais enquanto nao ha telas completas de auth.

## Limites da validacao neste ambiente

1. O ambiente atual nao possui Xcode CLI nem simctl, entao nao foi possivel executar testes no iOS Simulator.
2. O workspace mobile tambem nao sobe em fallback web sem adicionar react-native-web, entao a validacao visual ficou restrita a leitura de codigo, typecheck e scripts de backend.
3. O ambiente nao expoe MONGODB_URI nem binarios do MongoDB, entao a verificacao de colecao e indices em Atlas/Compass nao foi possivel daqui. A validacao do backend foi feita via introspecao de schema e script local sobre o service.