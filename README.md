# Ulanzi Deck System Monitor Pro

Plugin open source planejado para Ulanzi D200 / Ulanzi Studio: métricas de CPU, GPU, RAM, VRAM, FPS e rede, com alertas configuráveis.

> **Status atual:** scaffold de arquitetura. A integração com sensores, FPS, SDK Ulanzi e testes no dispositivo ainda não foi implementada.

## Objetivos
- Hardware: sensores disponibilizados pelo LibreHardwareMonitor, com detecção de indisponibilidade.
- FPS: adaptador RTSS ou PresentMon condicionado à verificação das interfaces e limitações reais.
- Rede: upload/download por interface, RTT/ping, jitter e perda em janelas explícitas.
- UI: cores dinâmicas, thresholds configuráveis, histerese e alertas sem flicker.
- Privacidade: medições locais e destinos de ping configuráveis, sem telemetria enviada a servidor do produto.

## Princípios
- Consultar SDK oficial Ulanzi antes de escrever a integração; não inventar métodos.
- Telemetria compartilhada entre botões, coleta por frequência configurável, render por mudança material.
- Valores ausentes mostrados como N/D; nunca substituir falha por zero.
- Verificar licenças de dependências antes de incluir binários.

## Estrutura
- `docs/ARCHITECTURE.md`: arquitetura, contratos e fases
- `config/defaults.json`: limites e intervalos propostos
- `.github/workflows/ci.yml`: validação básica do scaffold (não é teste do plugin)

## Desenvolvimento
Ainda não existe build executável do plugin. O plano é implementar primeiro o contrato de métricas e o renderer com stub Ulanzi, depois LHM, FPS, rede e Property Inspector. Testes no Ulanzi Studio e D200 deverão ser executados antes de uma release.

Contribuições são bem-vindas após definição de licença e fluxo de PRs.
