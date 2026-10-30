import { Socket } from 'socket.io-client';
import { ClockPingPayload, ClockPongPayload, SocketEvent } from '@dyswis/shared-types';

/**
 * Serviço responsável por medir a diferença de tempo (offset)
 * entre o relógio local do cliente e o relógio do servidor (NTP Simplificado).
 */
export class ClockSyncService {
  private socket: Socket;
  // Quantidade de amostras a serem coletadas
  private readonly SAMPLES_NEEDED = 5;
  private samples: { rtt: number; offset: number }[] = [];
  
  // O valor final consolidado (serverTime - localTime)
  // Se for positivo, o servidor está na frente.
  // Se for negativo, o servidor está atrás.
  private offset = 0;
  private rtt = 0;
  private isSynced = false;

  private resolveSyncPromise!: (offset: number) => void;
  private syncPromise: Promise<number>;

  constructor(socket: Socket) {
    this.socket = socket;
    
    this.syncPromise = new Promise((resolve) => {
      this.resolveSyncPromise = resolve;
    });

    this.setupListeners();
  }

  private setupListeners() {
    this.socket.on(SocketEvent.CLOCK_PONG, (payload: ClockPongPayload) => {
      const t3 = Date.now();
      const t0 = payload.clientTime;
      const t1_t2 = payload.serverTime; // Assumimos que processar o ping no servidor é instantâneo (t1 = t2)

      // Tempo de ida e volta (Round Trip Time)
      const rtt = t3 - t0;
      
      // O offset é a diferença entre o tempo do servidor e o tempo local,
      // corrigindo pela metade do RTT (assumindo latência simétrica)
      const currentOffset = (t1_t2 + rtt / 2) - t3;
      
      this.samples.push({ rtt, offset: currentOffset });

      if (this.samples.length < this.SAMPLES_NEEDED) {
        // Pede a próxima amostra
        this.ping();
      } else {
        // Temos amostras suficientes. A melhor amostra é sempre a de menor RTT,
        // pois ela sofreu menos jitter de rede (mais próxima da simetria perfeita).
        this.calculateBestOffset();
      }
    });
  }

  /**
   * Inicia o processo de sincronização enviando o primeiro ping.
   */
  public start(): Promise<number> {
    this.samples = [];
    this.isSynced = false;
    this.ping();
    return this.syncPromise;
  }

  private ping() {
    this.socket.emit(SocketEvent.CLOCK_PING, { clientTime: Date.now() } as ClockPingPayload);
  }

  private calculateBestOffset() {
    // Encontra a amostra com o menor RTT
    let bestSample = this.samples[0];
    for (const sample of this.samples) {
      if (sample.rtt < bestSample.rtt) {
        bestSample = sample;
      }
    }
    
    this.offset = bestSample.offset;
    this.rtt = bestSample.rtt;
    this.isSynced = true;
    console.log(`⏱️ ClockSync concluído. RTT mínimo: ${bestSample.rtt}ms. Offset aplicado: ${Math.round(this.offset)}ms`);
    this.resolveSyncPromise(this.offset);
  }

  /**
   * Retorna o offset atual em milissegundos.
   * `localTime + offset = serverTime`
   */
  public getOffset(): number {
    return this.offset;
  }

  /**
   * Retorna o Round Trip Time (RTT) medido na melhor amostra.
   */
  public getRTT(): number {
    return this.rtt;
  }

  /**
   * Converte um timestamp absoluto do servidor para o tempo local equivalente.
   * Ex: Quando o servidor disser "toque o vídeo no timestamp X",
   * use `getLocalTime(X)` para saber qual o `Date.now()` local equivalente.
   */
  public getLocalTime(serverTimestamp: number): number {
    return serverTimestamp - this.offset;
  }

  public isReady(): boolean {
    return this.isSynced;
  }
}
