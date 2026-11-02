// What Studio shows for each action, in each language. The metrics themselves are in plugin/core.js.
// Names stay within the store's 30 characters. The order is the order of the manifest, because the
// language files list actions by position. Every usage is a percentage.
export const ACTIONS = [
  { id: 'cpu.usage', en: ['CPU usage', 'Shows how much of the processor is in use, in percent.'], pt: ['Uso da CPU', 'Mostra quanto do processador está em uso, em porcentagem.'] },
  { id: 'cpu.temperature', en: ['CPU temperature', 'Shows the processor temperature. Needs LibreHardwareMonitor.'], pt: ['Temperatura da CPU', 'Mostra a temperatura do processador. Precisa do LibreHardwareMonitor.'] },
  { id: 'gpu.usage', en: ['GPU usage', 'Shows how much of the graphics card is in use, in percent. NVIDIA only.'], pt: ['Uso da GPU', 'Mostra quanto da placa de vídeo está em uso, em porcentagem. Só NVIDIA.'] },
  { id: 'gpu.temperature', en: ['GPU temperature', 'Shows the graphics card temperature. NVIDIA only.'], pt: ['Temperatura da GPU', 'Mostra a temperatura da placa de vídeo. Só NVIDIA.'] },
  { id: 'gpu.vram.usage', en: ['Video memory usage', 'Shows how much video memory is in use, in percent. NVIDIA only.'], pt: ['Uso da memória de vídeo', 'Mostra quanta memória de vídeo está em uso, em porcentagem. Só NVIDIA.'] },
  { id: 'ram.usage', en: ['Memory usage', 'Shows how much memory is in use, in percent.'], pt: ['Uso da memória', 'Mostra quanta memória está em uso, em porcentagem.'] },
  { id: 'network.ping', en: ['Ping', 'Shows the round trip to a server.'], pt: ['Ping', 'Mostra o tempo de ida e volta até um servidor.'] },
  { id: 'network.loss', en: ['Packet loss', 'Shows the share of pings that got no answer.'], pt: ['Perda de pacotes', 'Mostra a parte dos pings sem resposta.'] },
  { id: 'disk.usage', en: ['Disk usage', 'Shows how busy the disks are, in percent.'], pt: ['Uso do disco', 'Mostra o quanto os discos estão ocupados, em porcentagem.'] },
  { id: 'disk.temperature', en: ['Disk temperature', 'Shows the hottest disk. Needs LibreHardwareMonitor.'], pt: ['Temperatura do disco', 'Mostra o disco mais quente. Precisa do LibreHardwareMonitor.'] },
];

export const PLUGIN_TEXT = {
  en: {
    Description: "See your PC's CPU, GPU, memory, disk and network on the keys: a number, a bar and a two-minute graph for each. Windows only. Not affiliated with Ulanzi.",
    Detail: "Puts the health of your PC on your Ulanzi deck. Every key shows one reading as a big number with a bar and a graph of the last two minutes, and turns yellow or red, with a mark, when it gets hot or busy. Usage is always a percentage. Processor, memory, disk and network readings need nothing else. The graphics card readings come from nvidia-smi, which ships with NVIDIA's driver. The processor and disk temperatures can only come from LibreHardwareMonitor, which is optional and loads a driver that some game anti-cheats block. A reading that is missing says why on the key and is never shown as zero. Nothing is sent over the internet: the only network traffic is a ping to the server you choose. Windows only. Not affiliated with Ulanzi, NVIDIA or LibreHardwareMonitor.",
  },
  pt: {
    Description: 'Veja CPU, GPU, memória, disco e rede do seu PC nas teclas: um número, uma barra e um gráfico dos últimos dois minutos em cada uma. Só Windows. Sem vínculo com a Ulanzi.',
    Detail: 'Coloca a saúde do seu PC no deck Ulanzi. Cada tecla mostra uma leitura em número grande, com uma barra e o gráfico dos últimos dois minutos, e fica amarela ou vermelha, com uma marca, quando esquenta ou fica ocupada. O uso é sempre em porcentagem. As leituras de processador, memória, disco e rede não precisam de mais nada. As da placa de vídeo vêm do nvidia-smi, que acompanha o driver da NVIDIA. As temperaturas do processador e do disco só podem vir do LibreHardwareMonitor, que é opcional e carrega um driver que alguns anticheats de jogos bloqueiam. Uma leitura que falta diz o motivo na tecla e nunca aparece como zero. Nada é enviado pela internet: o único tráfego é um ping para o servidor escolhido. Só Windows. Sem vínculo com a Ulanzi, a NVIDIA ou o LibreHardwareMonitor.',
  },
};

// The English texts are listed too: a key with no translation comes back as the key, and these are not sentences.
export const LOCALIZATION = {
  en: {
    'Reading.': 'Reading normally.',
    'lhm.offline': 'LibreHardwareMonitor does not answer. This reading needs it, and it is optional: it loads a driver that some game anti-cheats block, so close it before such a game. To use it, open it and turn on Options > Remote Web Server > Run.',
    'lhm.unconfigured': 'The LibreHardwareMonitor address is turned off in the plugin\'s environment variables.',
    'nvidia.missing': 'nvidia-smi was not found. It ships with the NVIDIA driver, and these readings only work with an NVIDIA card.',
    'nvidia.offline': 'nvidia-smi stopped answering. It is started again shortly.',
    'windows.offline': 'The disk counters could not be read.',
    'ping.offline': 'The ping failed.',
    'os.offline': 'The processor and memory could not be read.',
    unsupported: 'This reading only exists on Windows.',
  },
  pt: {
    Usage: 'Uso', Temp: 'Temp', VRAM: 'VRAM', Ping: 'Ping', Loss: 'Perda',
    'LHM closed': 'LHM fechado', 'No reading': 'Sem leitura', 'Not set up': 'Não configurado', 'Windows only': 'Só Windows',
    'No NVIDIA': 'Sem NVIDIA', 'No sensor': 'Sem sensor', 'No data': 'Sem dados', Measuring: 'Medindo',
    Appearance: 'Aparência', Status: 'Estado', Color: 'Cor', Automatic: 'Automática', Cyan: 'Ciano', Green: 'Verde', Violet: 'Violeta',
    Orange: 'Laranja', Pink: 'Rosa', Blue: 'Azul', White: 'Branco', 'Show the graph': 'Mostrar o gráfico',
    'Reading.': 'Lendo normalmente.', 'Waiting for the first reading.': 'Esperando a primeira leitura.',
    'lhm.offline': 'O LibreHardwareMonitor não responde. Esta leitura depende dele, e ele é opcional: carrega um driver que alguns anticheats bloqueiam, então feche-o antes de jogar um desses. Para usar, abra-o e ligue Options > Remote Web Server > Run.',
    'lhm.unconfigured': 'O endereço do LibreHardwareMonitor está desligado nas variáveis de ambiente do plugin.',
    'nvidia.missing': 'O nvidia-smi não foi encontrado. Ele acompanha o driver da NVIDIA, e estas leituras só funcionam com placa NVIDIA.',
    'nvidia.offline': 'O nvidia-smi parou de responder. Ele é iniciado de novo em instantes.',
    'windows.offline': 'Não foi possível ler os contadores do disco.',
    'ping.offline': 'O ping falhou.',
    'os.offline': 'Não foi possível ler o processador e a memória.',
    unsupported: 'Esta leitura só existe no Windows.',
    'The readings stay on this computer. Nothing is sent over the internet.': 'As leituras ficam neste computador. Nada é enviado pela internet.',
  },
};
