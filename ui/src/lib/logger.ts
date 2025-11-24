/**
 * WebSocket-based logger for Chrome extension
 * Sends logs to local WebSocket server which writes to file
 */

class FileLogger {
  private ws: WebSocket | null = null;
  private reconnectTimeout: any = null; // Use any to handle both number (browser) and Timeout (node/worker)
  private messageQueue: string[] = [];
  private maxQueueSize = 100;

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      // Safe check for WebSocket availability in current scope
      const wsClass =
        (typeof globalThis !== 'undefined' ? globalThis.WebSocket : undefined) ||
        (typeof WebSocket !== 'undefined' ? WebSocket : undefined);

      if (!wsClass) {
        // console.warn('[Logger] WebSocket not available in this context, logging to console only');
        return;
      }

      this.ws = new wsClass('ws://localhost:9999');

      this.ws.onopen = () => {
        console.log('[Logger] Connected to log server');
        // Flush queued messages
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          if (msg && this.ws?.readyState === wsClass.OPEN) {
            this.ws.send(msg);
          }
        }
      };

      this.ws.onclose = () => {
        console.log('[Logger] Disconnected from log server, will retry...');
        // Retry connection after 5 seconds
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[Logger] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[Logger] Failed to connect to log server:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (typeof globalThis !== 'undefined' && globalThis.setTimeout) {
      this.reconnectTimeout = globalThis.setTimeout(() => this.connect(), 5000);
    }
  }

  private send(message: string): void {
    const wsClass =
      (typeof globalThis !== 'undefined' ? globalThis.WebSocket : undefined) ||
      (typeof WebSocket !== 'undefined' ? WebSocket : undefined);

    if (this.ws && wsClass && this.ws.readyState === wsClass.OPEN) {
      this.ws.send(message);
    } else {
      // Queue message if not connected
      this.messageQueue.push(message);
      if (this.messageQueue.length > this.maxQueueSize) {
        this.messageQueue.shift(); // Remove oldest
      }
    }
  }

  log(component: string, message: string, data?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${component}] ${message}`;

    // Log to console
    console.log(logEntry, data || '');

    // Send to file via WebSocket
    const fullLog = data ? `${logEntry} ${JSON.stringify(data)}` : logEntry;
    this.send(fullLog);
  }

  error(component: string, message: string, error?: any): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${component}] ERROR: ${message}`;

    // Log to console
    console.error(logEntry, error || '');

    // Send to file via WebSocket
    const fullLog = error
      ? `${logEntry} ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
      : logEntry;
    this.send(fullLog);
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      if (typeof globalThis !== 'undefined' && globalThis.clearTimeout) {
        globalThis.clearTimeout(this.reconnectTimeout);
      }
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Export singleton instance
export const logger = new FileLogger();
