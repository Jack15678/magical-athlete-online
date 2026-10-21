interface AssetRecoveryOptions {
  clearCache: () => void;
  isOnline: () => boolean;
  watchOnline: (listener: () => void) => () => void;
  delays?: readonly number[];
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
}

/** One shared GLB request needs one retry budget, regardless of mounted racers. */
export class AssetRecovery {
  private revision = 0;
  private attempts = 0;
  private failed = false;
  private timer: unknown;
  private unwatch?: () => void;
  private listeners = new Set<() => void>();
  private readonly delays: readonly number[];
  private readonly schedule: NonNullable<AssetRecoveryOptions['schedule']>;
  private readonly cancel: NonNullable<AssetRecoveryOptions['cancel']>;

  constructor(private options: AssetRecoveryOptions) {
    this.delays = options.delays ?? [400, 1200, 3000];
    this.schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    this.cancel = options.cancel ?? (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  snapshot = () => this.revision;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.unwatch) this.unwatch = this.options.watchOnline(this.online);
    // A caught first-render failure can precede this subscription. If the
    // browser came online in that gap, its event has already been missed.
    if (this.failed && this.options.isOnline()) this.failure();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.unwatch?.(); this.unwatch = undefined; this.cancelPending(); }
    };
  };

  failure = () => {
    this.failed = true;
    if (this.timer !== undefined || this.attempts >= this.delays.length || !this.options.isOnline()) return;
    this.timer = this.schedule(() => {
      this.timer = undefined;
      if (this.options.isOnline()) this.retry();
    }, this.delays[this.attempts]!);
  };

  success = () => { this.failed = false; this.attempts = 0; this.cancelPending(); };

  private online = () => {
    if (!this.failed || !this.options.isOnline()) return;
    this.cancelPending(); this.attempts = 0; this.retry();
  };

  private retry() {
    if (!this.failed) return;
    this.attempts++;
    // Evict the rejected promise only. Geometry already in use remains owned
    // by the loader/material caches and must never be disposed here.
    this.options.clearCache();
    this.revision++;
    this.listeners.forEach(listener => listener());
  }

  private cancelPending() {
    if (this.timer !== undefined) { this.cancel(this.timer); this.timer = undefined; }
  }
}
