# Arquitetura proposta

```text
LibreHardwareMonitor ─┐
nvidia-smi ─────────────┼──> Providers -> Normalizer -> Cache TTL -> Threshold Engine -> Ulanzi Renderer
Windows Network APIs ─┤                                          └──> Alerts
ICMP/TCP probes ───────┘
```

## Contrato de amostra

`MetricSample = { id, value, unit, timestamp, source, quality }`

`quality`: `ok | stale | unavailable | error`. Um sensor que falhar nunca deverá ser interpretado como zero.

## Intervalos iniciais (configuráveis)

- Hardware: 1000 ms
- FPS: 500 ms (depende do provedor disponível)
- Rede: 1000 ms (taxas por delta de contadores)
- Ping: 2000 ms com timeout e janela de amostras
- Tela: atualizar apenas quando houver mudanças materiais, com rate limit

## Requisitos

- Limiares de atenção/crítico por métrica, histerese e debounce.
- Descoberta dos sensores por hardware, sem assumir rótulos iguais em todos os PCs.
- Cache global de métricas para múltiplos botões, em vez de um coletor por ação.
- Adaptadores de FPS sem técnicas invasivas incompatíveis com anti-cheat.
- Ping configurável: destino público não representa necessariamente o servidor do jogo.
- Degradação segura quando LHM, RTSS ou PresentMon estiverem ausentes.

## Fases

1. SDK oficial, estrutura real do plugin, stubs e testes unitários.
2. Provider LHM e descoberta de sensores Windows.
3. Provider FPS baseado na interface oficialmente disponível.
4. Provider rede, RTT, jitter, perda e alertas.
5. Property Inspector, temas e presets.
6. Testar em Ulanzi Studio e D200; validar licenças e publicação.

## Limitações atuais

As fases 1, 2 (com sensores lidos do código do LibreHardwareMonitor, não de uma máquina real), 4 e a parte do Property Inspector da fase 5 existem e têm testes. A fase 3 (FPS) lê um CSV do PresentMon e não foi testada com um jogo. Nada foi validado no Ulanzi Studio nem em um dispositivo. Veja `docs/IMPLEMENTATION.md` e `docs/VERIFY.md`.
