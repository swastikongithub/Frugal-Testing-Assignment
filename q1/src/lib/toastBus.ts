export interface Toast {
  id: number;
  title: string;
  message: string;
}

type Listener = () => void;

const TOAST_LIFETIME_MS = 8000;

/** Tiny external store for error toasts, so non-React code (order store, boundary) can raise them. */
class ToastBus {
  private toasts: Toast[] = [];
  private readonly listeners = new Set<Listener>();
  private nextId = 1;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.toasts;

  push(title: string, message: string): void {
    const toast = { id: this.nextId++, title, message };
    this.toasts = [...this.toasts, toast];
    this.emit();
    window.setTimeout(() => this.dismiss(toast.id), TOAST_LIFETIME_MS);
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }
}

export const toasts = new ToastBus();
