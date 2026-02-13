declare module 'mqtt' {
  interface MqttClient {
    subscribe(topic: string | string[], callback?: (err: Error | null) => void): void;
    on(event: 'message', callback: (topic: string, payload: Buffer) => void): void;
    on(event: 'error', callback: (err: Error) => void): void;
    on(event: 'connect', callback: () => void): void;
    end(force?: boolean, callback?: () => void): void;
    publish(topic: string, message: string | Buffer, callback?: (err?: Error) => void): void;
  }
  function connect(url: string, options?: Record<string, unknown>): MqttClient;
  export { MqttClient };
  export default { connect };
}
