// What Studio shows for each action, in each language. The metrics themselves are in plugin/core.js.
// Names stay within the store's 30 characters. The order is the order of the manifest, because the
// language files list actions by position.
export const ACTIONS = [
  { id: 'cpu.usage', en: ['CPU usage', 'Shows how busy the processor is.'], pt: ['Uso da CPU', 'Mostra o quanto o processador está ocupado.'] },
  { id: 'cpu.temperature', en: ['CPU temperature', 'Shows the processor temperature.'], pt: ['Temperatura da CPU', 'Mostra a temperatura do processador.'] },
  { id: 'cpu.clock', en: ['CPU clock', 'Shows the processor speed.'], pt: ['Clock da CPU', 'Mostra a velocidade do processador.'] },
  { id: 'cpu.power', en: ['CPU power', 'Shows the power the processor draws.'], pt: ['Consumo da CPU', 'Mostra a energia que o processador consome.'] },
  { id: 'gpu.usage', en: ['GPU usage', 'Shows how busy the graphics card is.'], pt: ['Uso da GPU', 'Mostra o quanto a placa de vídeo está ocupada.'] },
  { id: 'gpu.temperature', en: ['GPU temperature', 'Shows the graphics card temperature.'], pt: ['Temperatura da GPU', 'Mostra a temperatura da placa de vídeo.'] },
  { id: 'gpu.clock', en: ['GPU clock', 'Shows the graphics card speed.'], pt: ['Clock da GPU', 'Mostra a velocidade da placa de vídeo.'] },
  { id: 'gpu.power', en: ['GPU power', 'Shows the power the graphics card draws.'], pt: ['Consumo da GPU', 'Mostra a energia que a placa de vídeo consome.'] },
  { id: 'gpu.vram.used', en: ['Video memory used', 'Shows the graphics card memory in use.'], pt: ['Memória de vídeo usada', 'Mostra a memória da placa de vídeo em uso.'] },
  { id: 'gpu.vram.total', en: ['Video memory total', 'Shows how much memory the graphics card has.'], pt: ['Memória de vídeo total', 'Mostra a memória total da placa de vídeo.'] },
  { id: 'ram.used', en: ['Memory used', 'Shows the memory in use.'], pt: ['Memória usada', 'Mostra a memória em uso.'] },
  { id: 'ram.total', en: ['Memory total', 'Shows how much memory the PC has.'], pt: ['Memória total', 'Mostra a memória total do PC.'] },
  { id: 'ram.usage', en: ['Memory usage', 'Shows the share of memory in use.'], pt: ['Uso da memória', 'Mostra a parte da memória em uso.'] },
  { id: 'fps.current', en: ['Frame rate', 'Shows frames per second. Needs PresentMon.'], pt: ['Quadros por segundo', 'Mostra os quadros por segundo. Precisa do PresentMon.'] },
  { id: 'fps.frametime', en: ['Frame time', 'Shows the time between frames. Needs PresentMon.'], pt: ['Tempo de quadro', 'Mostra o tempo entre quadros. Precisa do PresentMon.'] },
  { id: 'network.ping', en: ['Ping', 'Shows the round trip to a server.'], pt: ['Ping', 'Mostra o tempo de ida e volta até um servidor.'] },
  { id: 'network.jitter', en: ['Jitter', 'Shows how much the ping varies.'], pt: ['Jitter', 'Mostra o quanto o ping varia.'] },
  { id: 'network.loss', en: ['Packet loss', 'Shows the share of pings that got no answer.'], pt: ['Perda de pacotes', 'Mostra a parte dos pings sem resposta.'] },
  { id: 'network.download', en: ['Download speed', 'Shows what the PC is receiving now.'], pt: ['Velocidade de download', 'Mostra o que o PC está recebendo agora.'] },
  { id: 'network.upload', en: ['Upload speed', 'Shows what the PC is sending now.'], pt: ['Velocidade de upload', 'Mostra o que o PC está enviando agora.'] },
];

export const PLUGIN_TEXT = {
  en: {
    Description: "See your PC's CPU, GPU, memory, FPS and network on the keys: a number, a bar and a two-minute graph for each. Windows only. Not affiliated with Ulanzi.",
    Detail: "Puts the health of your PC on your Ulanzi deck. Every key shows one reading as a big number with a bar and a graph of the last two minutes, and turns yellow or red, with a mark, when it gets hot or busy. CPU and GPU readings come from LibreHardwareMonitor, which has to be running with its web server on. Memory, network speed and ping need nothing else. Frame rate needs PresentMon. A reading that is missing says why on the key and is never shown as zero. Nothing is sent over the internet: the only network traffic is a ping to the server you choose. Windows only. Not affiliated with Ulanzi, LibreHardwareMonitor or PresentMon.",
  },
  pt: {
    Description: 'Veja CPU, GPU, memória, FPS e rede do seu PC nas teclas: um número, uma barra e um gráfico dos últimos dois minutos em cada uma. Só Windows. Sem vínculo com a Ulanzi.',
    Detail: 'Coloca a saúde do seu PC no deck Ulanzi. Cada tecla mostra uma leitura em número grande, com uma barra e o gráfico dos últimos dois minutos, e fica amarela ou vermelha, com uma marca, quando esquenta ou fica ocupada. As leituras de CPU e GPU vêm do LibreHardwareMonitor, que precisa estar aberto com o servidor web ligado. Memória, velocidade da rede e ping não precisam de mais nada. Os quadros por segundo precisam do PresentMon. Uma leitura que falta diz o motivo na tecla e nunca aparece como zero. Nada é enviado pela internet: o único tráfego é um ping para o servidor escolhido. Só Windows. Sem vínculo com a Ulanzi, o LibreHardwareMonitor ou o PresentMon.',
  },
};

// The English texts are listed too: a key with no translation comes back as the key, and these are not sentences.
export const LOCALIZATION = {
  en: {
    'Reading.': 'Reading normally.',
    'lhm.offline': 'LibreHardwareMonitor does not answer. Open it, then turn on Options > Remote Web Server > Run.',
    'lhm.unconfigured': 'The LibreHardwareMonitor address is turned off in the plugin\'s environment variables.',
    'fps.unconfigured': 'Frame rate needs PresentMon writing a CSV file. Set PRESENTMON_CSV to its path, then restart Studio.',
    'fps.idle': 'Waiting for a game: the PresentMon file has no frames yet.',
    'fps.offline': 'The PresentMon file could not be read.',
    'network.offline': 'The network counters could not be read.',
    'ping.offline': 'The ping failed.',
    'os.offline': 'The memory could not be read.',
    unsupported: 'This reading only exists on Windows.',
  },
  pt: {
    Usage: 'Uso', Temp: 'Temp', Clock: 'Clock', Power: 'Consumo', 'VRAM used': 'VRAM usada', 'VRAM total': 'VRAM total',
    Used: 'Usada', Total: 'Total', Current: 'Atual', 'Frame time': 'Tempo de quadro', Ping: 'Ping', Jitter: 'Jitter',
    Loss: 'Perda', Download: 'Download', Upload: 'Upload',
    'LHM closed': 'LHM fechado', Offline: 'Sem conexão', 'Not set up': 'Não configurado', 'Windows only': 'Só Windows',
    'No game': 'Sem jogo', 'No sensor': 'Sem sensor', 'No data': 'Sem dados', Measuring: 'Medindo',
    Appearance: 'Aparência', Status: 'Estado', Color: 'Cor', Automatic: 'Automática', Cyan: 'Ciano', Green: 'Verde', Violet: 'Violeta',
    Orange: 'Laranja', Pink: 'Rosa', Blue: 'Azul', White: 'Branco', 'Show the graph': 'Mostrar o gráfico',
    'Reading.': 'Lendo normalmente.', 'Waiting for the first reading.': 'Esperando a primeira leitura.',
    'lhm.offline': 'O LibreHardwareMonitor não responde. Abra-o e, em Options, ligue Remote Web Server > Run.',
    'lhm.unconfigured': 'O endereço do LibreHardwareMonitor está desligado nas variáveis de ambiente do plugin.',
    'fps.unconfigured': 'Os quadros por segundo precisam do PresentMon gravando um arquivo CSV. Defina PRESENTMON_CSV com o caminho dele e reinicie o Studio.',
    'fps.idle': 'Esperando um jogo: o arquivo do PresentMon ainda não tem quadros.',
    'fps.offline': 'Não foi possível ler o arquivo do PresentMon.',
    'network.offline': 'Não foi possível ler os contadores de rede.',
    'ping.offline': 'O ping falhou.',
    'os.offline': 'Não foi possível ler a memória.',
    unsupported: 'Esta leitura só existe no Windows.',
    Help: 'Ajuda',
    'The readings stay on this computer. Nothing is sent over the internet.': 'As leituras ficam neste computador. Nada é enviado pela internet.',
  },
};
