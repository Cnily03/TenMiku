export interface CommandContext<Env> {
  userInput: string;
  commandLine: string;
  prefix: string;
  command: string;
  rest: string;
  restArgs: string[];
  env: Env;
}

export type Handler<Env> = (
  ctx: Readonly<CommandContext<Env>>,
  next: () => void | Promise<void>
) => void | Promise<void>;

// biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
// biome-ignore lint/complexity/noBannedTypes: defaults as empty object
export class CommandHelper<Env extends Record<string, any> = {}> {
  readonly prefix: string;
  protected env: Env;
  private handlers: Map<string, Handler<Env>[]> = new Map();

  constructor(prefix: string = "", env: Env = {} as Env) {
    this.prefix = prefix;
    this.env = env;
  }

  // biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
  clone<E extends Record<string, any>>(env: E & Env = this.env as any): CommandHelper<E & Env> {
    const newHelper = new CommandHelper<E & Env>(this.prefix, env);
    this.handlers.forEach((handlers, command) => {
      handlers.forEach((handler) => {
        newHelper.handle(command, handler);
      });
    });
    return newHelper;
  }

  handle(command: string, handler: Handler<Env>) {
    if (!this.handlers.has(command)) {
      this.handlers.set(command, []);
    }
    this.handlers.get(command)!.push(handler);
  }

  private prepareContext(input: string, env: Partial<Env> = {}, withStart = false) {
    const userPrefix = withStart ? this.prefix : "";
    if (!input.startsWith(userPrefix)) return null;
    const commandLine = input.slice(userPrefix.length);
    const [_command, ...restArgs] = commandLine.split(/\s+/);
    const command = _command || "";

    return {
      userInput: input,
      commandLine,
      prefix: userPrefix,
      command,
      rest: commandLine.slice(command.length),
      restArgs,
      env: { ...this.env, ...env } as Env,
    } as CommandContext<Env>;
  }

  private async internalRun(input: string, env: Partial<Env> = {}, withPrefix = false) {
    const ctx = this.prepareContext(input, env, withPrefix);
    if (!ctx) return false;

    const handlers = this.handlers.get(ctx.command);
    if (!handlers || handlers.length === 0) return false;

    const createNext = (index: number): (() => Promise<void>) => {
      return async () => {
        if (index >= handlers.length) return;
        const handler = handlers[index];
        if (handler) {
          await handler(ctx, createNext(index + 1));
        }
      };
    };
    await createNext(0)();
    return true;
  }

  async run(input: string, env: Partial<Env> = {}) {
    return await this.internalRun(input, env, false);
  }

  async runPrefix(input: string, env: Partial<Env> = {}) {
    return await this.internalRun(input, env, true);
  }

  dryRun(input: string, withPrefix = false) {
    const ctx = this.prepareContext(input, {}, withPrefix);
    if (!ctx) return false;
    return this.handlers.has(ctx.command);
  }
}

export default CommandHelper;
