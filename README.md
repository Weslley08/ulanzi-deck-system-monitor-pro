# Ulanzi Deck System Monitor Pro

Plugin open source planejado para Ulanzi D200 / Ulanzi Studio: nove leituras de CPU, GPU, memória, disco e rede, com alertas por cor.

> **Status atual:** protótipo funcional, ainda sem uso no Ulanzi Studio nem em um dispositivo. As teclas, o painel e os leitores (LibreHardwareMonitor e ping) existem e são testados contra hosts e sensores simulados. Nada foi visto num D200, e o LibreHardwareMonitor nunca foi lido de verdade. [docs/VERIFY.md](docs/VERIFY.md) é o roteiro da primeira execução real.

![Teclas em cada estado: normal, aviso, crítico e sem leitura](docs/keys.png)

**Leituras (todo uso é porcentagem):** uso da CPU, da GPU, da memória de vídeo, da RAM e do disco, ping, perda de pacotes e as temperaturas da CPU e da GPU. Tudo, menos ping e perda, vem do [LibreHardwareMonitor](https://github.com/LibreHardwareMonitor/LibreHardwareMonitor), que você abre como administrador com *Options > Remote Web Server > Run*. **Atenção:** ele carrega um driver que alguns anticheats de jogos bloqueiam, então feche-o antes de jogar um desses. Sem ele, as teclas dizem "LHM fechado". Cada leitura que falta diz o motivo na própria tecla.

## Objetivos
- Hardware: sensores disponibilizados pelo LibreHardwareMonitor, com detecção de indisponibilidade.
- Rede: ping e perda de pacotes em janelas explícitas.
- UI: cores dinâmicas, thresholds configuráveis, histerese e alertas sem flicker.
- Privacidade: medições locais e destinos de ping configuráveis, sem telemetria enviada a servidor do produto.

## Princípios
- Consultar SDK oficial Ulanzi antes de escrever a integração; não inventar métodos.
- Telemetria compartilhada entre botões, coleta por frequência configurável, render por mudança material.
- Valores ausentes mostrados como N/D; nunca substituir falha por zero.
- Verificar licenças de dependências antes de incluir binários.

## Estrutura
- `docs/ARCHITECTURE.md`: arquitetura, contratos e fases
- `docs/IMPLEMENTATION.md`: de onde vem cada leitura, o que cada tecla mostra e o que ainda falta
- `com.ulanzi.systemmonitorpro.ulanziPlugin/plugin/defaults.json`: limites e intervalos
- `.github/workflows/ci.yml`: validação básica do scaffold (não é teste do plugin)

## Desenvolvimento
Ainda não existe build executável do plugin. O plano é implementar primeiro o contrato de métricas e o renderer com stub Ulanzi, depois LHM, FPS, rede e Property Inspector. Testes no Ulanzi Studio e D200 deverão ser executados antes de uma release.

Contribuições são bem-vindas após definição de licença e fluxo de PRs.
