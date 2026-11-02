// What Studio shows for each action, in each language. The metrics themselves are in plugin/core.js.
// Names stay within the store's 30 characters. The order is the order of the manifest, because the
// language files list actions by position. Every usage is a percentage.
export const ACTIONS = [
  { id: 'cpu.usage', en: ['CPU usage', 'Shows how much of the processor is in use, in percent.'], pt: ['Uso da CPU', 'Mostra quanto do processador está em uso, em porcentagem.'] },
  { id: 'cpu.temperature', en: ['CPU temperature', 'Shows the processor temperature.'], pt: ['Temperatura da CPU', 'Mostra a temperatura do processador.'] },
  { id: 'gpu.usage', en: ['GPU usage', 'Shows how much of the graphics card is in use, in percent.'], pt: ['Uso da GPU', 'Mostra quanto da placa de vídeo está em uso, em porcentagem.'] },
  { id: 'gpu.temperature', en: ['GPU temperature', 'Shows the graphics card temperature.'], pt: ['Temperatura da GPU', 'Mostra a temperatura da placa de vídeo.'] },
  { id: 'gpu.vram.usage', en: ['Video memory usage', 'Shows how much video memory is in use, in percent.'], pt: ['Uso da memória de vídeo', 'Mostra quanta memória de vídeo está em uso, em porcentagem.'] },
  { id: 'ram.usage', en: ['Memory usage', 'Shows how much memory is in use, in percent.'], pt: ['Uso da memória', 'Mostra quanta memória está em uso, em porcentagem.'] },
  { id: 'network.ping', en: ['Ping', 'Shows the round trip to a server.'], pt: ['Ping', 'Mostra o tempo de ida e volta até um servidor.'] },
  { id: 'network.loss', en: ['Packet loss', 'Shows the share of pings that got no answer.'], pt: ['Perda de pacotes', 'Mostra a parte dos pings sem resposta.'] },
  { id: 'disk.usage', en: ['Disk usage', 'Shows how busy the busiest disk is, in percent.'], pt: ['Uso do disco', 'Mostra o quanto o disco mais ocupado está ocupado, em porcentagem.'] },
  { id: 'disk.temperature', en: ['Disk temperature', 'Shows the hottest disk.'], pt: ['Temperatura do disco', 'Mostra o disco mais quente.'] },
];

export const PLUGIN_TEXT = {
  en: {
    Description: "See your PC's CPU, GPU, memory, disk and network on the keys: a number, a bar and a two-minute graph for each. Needs LibreHardwareMonitor. Windows only. Not affiliated with Ulanzi.",
    Detail: "Puts the health of your PC on your Ulanzi deck. Every key shows one reading as a big number with a bar and a graph of the last two minutes, and turns yellow or red, with a mark, when it gets hot or busy. Usage is always a percentage. Every reading except ping and packet loss comes from LibreHardwareMonitor, which you run yourself, as administrator, with its web server turned on. It loads a driver that some game anti-cheats block, so close it before such a game. A reading that is missing says why on the key and is never shown as zero. Nothing is sent over the internet: the plugin only talks to LibreHardwareMonitor on your own computer and pings the server you choose. Windows only. Not affiliated with Ulanzi or LibreHardwareMonitor.",
  },
  pt: {
    Description: 'Veja CPU, GPU, memória, disco e rede do seu PC nas teclas: um número, uma barra e um gráfico dos últimos dois minutos em cada uma. Precisa do LibreHardwareMonitor. Só Windows. Sem vínculo com a Ulanzi.',
    Detail: 'Coloca a saúde do seu PC no deck Ulanzi. Cada tecla mostra uma leitura em número grande, com uma barra e o gráfico dos últimos dois minutos, e fica amarela ou vermelha, com uma marca, quando esquenta ou fica ocupada. O uso é sempre em porcentagem. Toda leitura, menos ping e perda de pacotes, vem do LibreHardwareMonitor, que você abre por conta própria, como administrador, com o servidor web ligado. Ele carrega um driver que alguns anticheats de jogos bloqueiam, então feche-o antes de jogar um desses. Uma leitura que falta diz o motivo na tecla e nunca aparece como zero. Nada é enviado pela internet: o plugin só fala com o LibreHardwareMonitor no seu próprio computador e dá ping no servidor escolhido. Só Windows. Sem vínculo com a Ulanzi nem com o LibreHardwareMonitor.',
  },
};

// The English texts are listed too: a key with no translation comes back as the key, and these are not sentences.
export const LOCALIZATION = {
  en: {
    'Reading.': 'Reading normally.',
    'lhm.offline': 'LibreHardwareMonitor does not answer. Open it as administrator, then turn on Options > Remote Web Server > Run. It loads a driver that some game anti-cheats block, so close it before such a game.',
    'lhm.unconfigured': 'The LibreHardwareMonitor address is turned off in the plugin\'s environment variables.',
    'ping.offline': 'The ping failed.',
  },
  pt: {
    Usage: 'Uso', Temp: 'Temp', VRAM: 'VRAM', Ping: 'Ping', Loss: 'Perda',
    'LHM closed': 'LHM fechado', 'No reading': 'Sem leitura', 'Not set up': 'Não configurado',
    'No sensor': 'Sem sensor', 'No data': 'Sem dados', Measuring: 'Medindo',
    Appearance: 'Aparência', Status: 'Estado', Color: 'Cor', Automatic: 'Automática', Cyan: 'Ciano', Green: 'Verde', Violet: 'Violeta',
    Orange: 'Laranja', Pink: 'Rosa', Blue: 'Azul', White: 'Branco', 'Show the graph': 'Mostrar o gráfico',
    'Reading.': 'Lendo normalmente.', 'Waiting for the first reading.': 'Esperando a primeira leitura.',
    'lhm.offline': 'O LibreHardwareMonitor não responde. Abra-o como administrador e ligue Options > Remote Web Server > Run. Ele carrega um driver que alguns anticheats bloqueiam, então feche-o antes de jogar um desses.',
    'lhm.unconfigured': 'O endereço do LibreHardwareMonitor está desligado nas variáveis de ambiente do plugin.',
    'ping.offline': 'O ping falhou.',
    'The readings stay on this computer. Nothing is sent over the internet.': 'As leituras ficam neste computador. Nada é enviado pela internet.',
  },
};
