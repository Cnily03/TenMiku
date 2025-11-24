import colors from "colors";

export class Logger {
  private silent = false;
  private prefixes: string[];
  private extraHead: Record<string, unknown> = {};
  private extraTail: Record<string, unknown> = {};
  constructor(...prefixes: string[]) {
    this.prefixes = prefixes.filter(Boolean);
  }

  private timeFmt(date: Date): string {
    const Y = date.getFullYear();
    const M = String(date.getMonth() + 1).padStart(2, "0");
    const D = String(date.getDate()).padStart(2, "0");
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    const s = String(date.getSeconds()).padStart(2, "0");
    const ms = String(date.getMilliseconds()).padStart(3, "0");
    return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
  }

  private extraFmt<T extends Record<string, unknown>>(extra: T): string[] {
    return Object.entries(extra).map(([k, v]) => `${colors.italic(k)}=${v}`);
  }

  get scope() {
    return this.prefixes.join(":");
  }

  disable() {
    this.silent = true;
    return this;
  }

  enable() {
    this.silent = false;
    return this;
  }

  extend(...prefixes: string[]): Logger {
    const p = prefixes.filter(Boolean);
    return new Logger(...this.prefixes, ...p);
  }

  head<T extends Record<string, unknown>>(extra: T): Logger {
    const lg = new Logger(...this.prefixes);
    lg.extraHead = { ...this.extraHead, ...extra };
    lg.extraTail = { ...this.extraTail };
    return lg;
  }

  tail<T extends Record<string, unknown>>(extra: T): Logger {
    const lg = new Logger(...this.prefixes);
    lg.extraHead = { ...this.extraHead };
    lg.extraTail = { ...this.extraTail, ...extra };
    return lg;
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic inputs
  log(message?: any, ...args: any[]) {
    if (this.silent) return;
    console.log(
      colors.dim(this.timeFmt(new Date())),
      ...(this.scope ? [colors.dim(this.scope.green)] : []),
      ...this.extraFmt(this.extraHead).map((s) => s.cyan),
      message,
      ...args,
      ...this.extraFmt(this.extraTail).map((s) => s.cyan)
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic inputs
  error(message?: any, ...args: any[]) {
    if (this.silent) return;
    console.error(
      colors.dim(this.timeFmt(new Date())),
      colors.bold(colors.red("ERROR")),
      ...(this.scope ? [colors.dim(this.scope.green)] : []),
      ...this.extraFmt(this.extraHead).map((s) => s.cyan),
      message,
      ...args,
      ...this.extraFmt(this.extraTail).map((s) => s.cyan)
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic inputs
  warn(message?: any, ...args: any[]) {
    if (this.silent) return;
    console.warn(
      colors.dim(this.timeFmt(new Date())),
      colors.bold(colors.yellow(" WARN")),
      ...(this.scope ? [colors.dim(this.scope.green)] : []),
      ...this.extraFmt(this.extraHead).map((s) => s.cyan),
      message,
      ...args,
      ...this.extraFmt(this.extraTail).map((s) => s.cyan)
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic inputs
  info(message?: any, ...args: any[]) {
    if (this.silent) return;
    console.info(
      colors.dim(this.timeFmt(new Date())),
      colors.bold(colors.blue(" INFO")),
      ...(this.scope ? [colors.dim(this.scope.green)] : []),
      ...this.extraFmt(this.extraHead).map((s) => s.cyan),
      message,
      ...args,
      ...this.extraFmt(this.extraTail).map((s) => s.cyan)
    );
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic inputs
  debug(message?: any, ...args: any[]) {
    if (this.silent) return;
    console.debug(
      colors.dim(this.timeFmt(new Date())),
      colors.bold(colors.magenta("DEBUG")),
      ...(this.scope ? [colors.dim(this.scope.green)] : []),
      ...this.extraFmt(this.extraHead).map((s) => s.cyan),
      message,
      ...args,
      ...this.extraFmt(this.extraTail).map((s) => s.cyan)
    );
  }
}

const defaultLogger = new Logger();

export default defaultLogger;
