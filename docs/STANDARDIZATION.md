# Paridade com Clima Pro — status verificável

Referência: https://github.com/Weslley08/ulanzi-deck-clima-pro

## Já versionado nesta branch
- Gate com testes 3 sistemas, actionlint, auditoria, CodeQL e dependency review.
- Dependabot, templates de PR e issues, .nvmrc (Node 20.12.2), Apache-2.0.
- Scripts do Clima Pro importados para versionamento, fluxo Git, empacotamento, segurança e medição.
- Branch develop e PR em draft para revisão.
- Checklist de verificação real em docs/VERIFY.md.
- Gate e Delivery vêm de https://github.com/Weslley08/ulanzi-plugin-pipeline, a mesma pipeline do Clima Pro. O que é específico deste plugin fica em .github/pipeline.json.

## NÃO É PARIDADE FUNCIONAL
Os scripts de Clima Pro trazem imports, fixtures, esquema de manifesto, dependências e convenções internas específicas de clima. O simples transporte dos arquivos NÃO os torna executáveis para System Monitor. Em particular, measure.mjs e verify-package.mjs requerem adaptação completa; package.mjs exige um plugin distribuível e SDK oficial local.

A publicação automática fica desligada até a variável PUBLISHING_ENABLED do repositório ser true: até lá, o merge em main deixa o rascunho como está. Não há validação funcional do SDK, LHM ou FPS em hardware real.

## Bloqueadores de release (obrigatórios)
1. Adaptar código, bibliotecas e scripts do Clima Pro para o plugin System Monitor.
2. Copiar SDK oficial integral sem edições e fixar hashes em sdk-lock.json.
3. Prover manifest e assets PNG conforme schema e pacote que inicia de fato.
4. Testes com mocks de sensores, nvidia-smi e rede, cobertura mínima, segurança e performance.
5. Validar package e verify-package em CI Windows + macOS.
6. Aplicar proteções de main/develop/release; configurar AUTOMATION_TOKEN; testar ciclo real work -> develop -> release -> main.
7. Verificar Ulanzi Studio, D200, termos e licenças com evidências.
8. Somente então ativar publicação automática de main.

**Nunca marcar checklist como concluído sem resultados.**