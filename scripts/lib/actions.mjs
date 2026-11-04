// What Studio shows for each action, in each language. The metrics themselves are in plugin/core.js.
// Names stay within the store's 30 characters. The order is the order of the manifest, because the
// language files list actions by position. Every usage is a percentage.
export const ACTIONS = [
  { id: 'cpu.usage', en: ['CPU usage', 'Shows how much of the processor is in use, in percent.'], pt: ['Uso da CPU', 'Mostra quanto do processador está em uso, em porcentagem.'] },
  { id: 'cpu.temperature', en: ['CPU temperature', 'Shows the processor temperature.'], pt: ['Temperatura da CPU', 'Mostra a temperatura do processador.'] },
  { id: 'gpu.usage', en: ['GPU usage', 'Shows how much of a graphics card is in use, in percent. NVIDIA or AMD.'], pt: ['Uso da GPU', 'Mostra quanto de uma placa de vídeo está em uso, em porcentagem. NVIDIA ou AMD.'] },
  { id: 'gpu.temperature', en: ['GPU temperature', 'Shows the graphics card temperature.'], pt: ['Temperatura da GPU', 'Mostra a temperatura da placa de vídeo.'] },
  { id: 'gpu.vram.usage', en: ['Video memory usage', 'Shows how much video memory is in use, in percent.'], pt: ['Uso da memória de vídeo', 'Mostra quanta memória de vídeo está em uso, em porcentagem.'] },
  { id: 'ram.usage', en: ['Memory usage', 'Shows how much memory is in use, in percent.'], pt: ['Uso da memória', 'Mostra quanta memória está em uso, em porcentagem.'] },
  { id: 'network.ping', en: ['Ping', 'Shows the round trip to a server.'], pt: ['Ping', 'Mostra o tempo de ida e volta até um servidor.'] },
  { id: 'network.loss', en: ['Packet loss', 'Shows the share of pings that got no answer.'], pt: ['Perda de pacotes', 'Mostra a parte dos pings sem resposta.'] },
  { id: 'network.jitter', en: ['Jitter', 'Shows how much the ping varies from one reply to the next.'], pt: ['Jitter', 'Mostra o quanto o ping varia de uma resposta para a outra.'] },
  { id: 'network.speed', en: ['Speed test', 'Shows the download and the upload of your connection in one ring. The last test stays until the next.'], pt: ['Teste de velocidade', 'Mostra o download e o upload da sua conexão em um anel. O último teste fica até o próximo.'] },
  { id: 'disk.usage', en: ['Disk usage', 'Shows how full a drive is, in percent.'], pt: ['Uso do disco', 'Mostra o quanto de uma unidade está ocupado, em porcentagem.'] },
];

export const PLUGIN_TEXT = {
  en: {
    Description: "See your PC's CPU, GPU, memory, disk and network on the keys, and test your connection speed: a number, a bar and a graph for each. Windows only. Not affiliated with Ulanzi.",
    Detail: "Puts the health of your PC on your Ulanzi deck. Every key shows one reading as a big number with a bar and a graph, and turns yellow or red, with a mark, when it gets hot or busy. Usage is always a percentage. Processor, memory, drive and network readings, and an NVIDIA card (through nvidia-smi, which ships with its driver), load no driver. The processor temperature comes from the Windows thermal zone, when the PC has one. An AMD card, and a PC with no thermal zone, need LibreHardwareMonitor, which you run yourself as administrator: it loads a driver that some game anti-cheats block, so close it before such a game. A missing reading says why on the key and is never shown as zero. The ping goes to 1.1.1.1. The speed test key shows download and upload in one ring, as often as you choose or when you press it, using Cloudflare's public speed servers and up to about 240 MB each time. Windows only. Not affiliated with Ulanzi, NVIDIA, AMD, Cloudflare or LibreHardwareMonitor.",
  },
  pt: {
    Description: 'Veja CPU, GPU, memória, disco e rede do seu PC nas teclas e teste a velocidade da conexão: um número, uma barra e um gráfico em cada uma. Só Windows. Sem vínculo com a Ulanzi.',
    Detail: 'Coloca a saúde do seu PC no deck Ulanzi. Cada tecla mostra uma leitura em número grande, com uma barra e um gráfico, e fica amarela ou vermelha, com uma marca, quando esquenta ou fica ocupada. O uso é sempre em porcentagem. Processador, memória, unidades e rede, e uma placa NVIDIA (pelo nvidia-smi), não carregam driver. A temperatura do processador vem da zona térmica do Windows, quando o PC tem uma. Uma placa AMD, e um PC sem zona térmica, precisam do LibreHardwareMonitor, que você abre como administrador: ele carrega um driver que alguns anticheats bloqueiam, então feche-o antes de jogar um desses. Uma leitura que falta diz o motivo na tecla e nunca aparece como zero. O ping vai para 1.1.1.1. A tecla de teste de velocidade mostra download e upload em um anel, na frequência que você escolher ou ao apertá-la, usando os servidores públicos de velocidade da Cloudflare e até cerca de 240 MB por vez. Só Windows. Sem vínculo com a Ulanzi, NVIDIA, AMD, Cloudflare nem LibreHardwareMonitor.',
  },
};

// The English texts are listed too: a key with no translation comes back as the key, and these are not sentences.
export const LOCALIZATION = {
  en: {
    'Reading.': 'Reading normally.',
    'lhm.offline': 'LibreHardwareMonitor does not answer. It is only needed for an AMD card, or for a PC with no thermal zone. Open it as administrator, then turn on Options > Remote Web Server > Run. It loads a driver that some game anti-cheats block, so close it before such a game.',
    'nvidia.missing': 'nvidia-smi was not found, so there is no NVIDIA card to read.',
    'nvidia.offline': 'nvidia-smi stopped answering. It is started again shortly.',
    'windows.missing': 'This PC has no thermal zone for Windows to read.',
    'windows.offline': 'The thermal zone could not be read.',
    'node.offline': 'The processor, memory or drive could not be read.',
    'lhm.unconfigured': 'The LibreHardwareMonitor address is turned off in the plugin\'s environment variables.',
    'ping.offline': 'The ping failed.',
    'speed.offline': 'The speed test failed. Check the connection; it tries again at the next interval, or when you press the key.',
  },
  pt: {
    Usage: 'Uso', Used: 'Usado', Temp: 'Temp', VRAM: 'VRAM', Ping: 'Ping', Loss: 'Perda', 'Graphics card': 'Placa de vídeo', Drive: 'Unidade',
    'Needs LHM': 'Precisa do LHM', 'No reading': 'Sem leitura', 'Not set up': 'Não configurado',
    'No sensor': 'Sem sensor', 'No NVIDIA': 'Sem NVIDIA', 'No data': 'Sem dados', Measuring: 'Medindo',
    Appearance: 'Aparência', Status: 'Estado', Color: 'Cor', Automatic: 'Automática', Cyan: 'Ciano', Green: 'Verde', Violet: 'Violeta',
    Orange: 'Laranja', Pink: 'Rosa', Blue: 'Azul', White: 'Branco', 'Show the graph': 'Mostrar o gráfico',
    'Reading.': 'Lendo normalmente.', 'Waiting for the first reading.': 'Esperando a primeira leitura.',
    'lhm.offline': 'O LibreHardwareMonitor não responde. Ele só é necessário para uma placa AMD, ou para um PC sem zona térmica. Abra-o como administrador e ligue Options > Remote Web Server > Run. Ele carrega um driver que alguns anticheats bloqueiam, então feche-o antes de jogar um desses.',
    'nvidia.missing': 'O nvidia-smi não foi encontrado, então não há placa NVIDIA para ler.',
    'nvidia.offline': 'O nvidia-smi parou de responder. Ele é iniciado de novo em instantes.',
    'windows.missing': 'Este PC não tem zona térmica para o Windows ler.',
    'windows.offline': 'Não foi possível ler a zona térmica.',
    'node.offline': 'Não foi possível ler o processador, a memória ou a unidade.',
    'lhm.unconfigured': 'O endereço do LibreHardwareMonitor está desligado nas variáveis de ambiente do plugin.',
    'ping.offline': 'O ping falhou.',
    'speed.offline': 'O teste de velocidade falhou. Verifique a conexão; ele tenta de novo no próximo intervalo, ou quando você apertar a tecla.',
    Jitter: 'Jitter', Speed: 'Velocidade', Testing: 'Testando', 'Press to test': 'Aperte p/ testar',
    'Ping every': 'Ping a cada', 'Test every': 'Testar a cada', 'Only when pressed': 'Só ao apertar',
    'Each test uses up to about 240 MB of data. Press the key to test now. The outer ring and the top number are the download, the inner ring and the bottom number are the upload.': 'Cada teste usa até cerca de 240 MB de dados. Aperte a tecla para testar agora. O anel de fora e o número de cima são o download; o anel de dentro e o número de baixo são o upload.',
    'Only the ping and the speed test reach the internet.': 'Só o ping e o teste de velocidade acessam a internet.',
    'The readings stay on this computer. Only the ping and the speed test reach the internet.': 'As leituras ficam neste computador. Só o ping e o teste de velocidade acessam a internet.',
  },
};
