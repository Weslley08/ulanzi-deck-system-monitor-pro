import UlanziApi from './ulanzi-api/index.js';

const SOCKET_OPEN = 1;

/**
 * The SDK writes every message to the console, including the API key and each base64 image.
 * This keeps the secret out of the logs and skips serializing every frame twice,
 * without patching the vendored SDK.
 */
export class HostConnection extends UlanziApi {
  send(cmd, params) {
    if (this.websocket?.readyState !== SOCKET_OPEN) return;
    this.websocket.send(JSON.stringify({ cmd, uuid: this.uuid, key: this.key, actionid: this.actionid, ...params }));
  }

  /** connect() consumes process.argv on its first call, so a second one would fall back to the default port and English. */
  reconnect() {
    const { uuid, port, address, language } = this;
    this.connect(uuid, port, address);
    this.language = language;
  }
}

/** Incoming messages are logged by the SDK too, and those cannot be intercepted any other way. */
export function silenceConsole() {
  const quiet = () => {};
  for (const method of ['log', 'info', 'debug', 'warn', 'error']) console[method] = quiet;
}
