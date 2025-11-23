import * as readline from "node:readline";
import colors from "colors";
import { TenMikuPlugin } from "@/core/plugin";
import type TenMiku from "@/index";
import { isSupportRegion, type ServerRegion, SUPPORT_REGIONS } from "@/utils";
import InteractiveCallerHelper from "./callers";

declare module "@/index" {
  interface TenMiku {
    interactive: () => Promise<void>;
  }
}

interface InteractiveCommand {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void> | void;
}

interface InteractiveOptions {
  /**
   * @default "jp"
   */
  defaultRegion?: ServerRegion;
}

export default class InteractivePlugin extends TenMikuPlugin {
  private TENMIKU: TenMiku | null = null;
  private commands: Map<string, InteractiveCommand> = new Map();
  private rl: readline.Interface | null = null;
  private isRunning = false;
  private callerHelper = new InteractiveCallerHelper();
  region: ServerRegion;

  constructor(options?: InteractiveOptions) {
    super("interactive");
    this.region = options?.defaultRegion ?? "jp";
    this.registerDefaultCommands();
  }

  /**
   * Register a custom command
   */
  register(name: string, description: string, handler: (args: string[]) => Promise<void> | void) {
    this.commands.set(name, { name, description, handler });
  }

  /**
   * Register default commands
   */
  private registerDefaultCommands() {
    this.register("?", "Show help information", async () => {
      console.log(colors.bold("Available commands:"));
      for (const cmd of this.commands.values()) {
        console.log(`  ${colors.cyan(cmd.name)} - ${cmd.description}`);
      }
    });

    this.register("exit", "Exit the interactive shell", async () => {
      await this.stop();
    });

    this.register("help", "Show help information", async () => {
      console.log(colors.bold("Available commands:"));
      for (const cmd of this.commands.values()) {
        console.log(`  ${colors.cyan(cmd.name)} - ${cmd.description}`);
      }
    });

    this.register("get", "Get current properties", async (args: string[]) => {
      if (args.length === 0) {
        console.log(colors.bold("Current properties:"));
        console.log(`  ${colors.yellow("region")}: ${colors.green(this.region)}`);
      } else {
        const property = args[0]!;
        switch (property) {
          case "region":
            console.log(`  ${colors.yellow("region")}: ${colors.green(this.region)}`);
            break;
          default:
            console.log(colors.red(`Unknown property: ${property}`));
        }
      }
    });

    this.register("set", "Set a property", async (args: string[]) => {
      if (args.length < 2) {
        console.log(colors.red("Usage: set <property> <value>"));
        return;
      }
      const property = args[0]!;
      const value = args[1]!;

      switch (property) {
        case "region":
          if (!isSupportRegion(value)) {
            console.log(colors.red(`Unsupported region: ${value}`));
            console.log(`Supported regions: ${SUPPORT_REGIONS.join(", ")}`);
            return;
          }
          this.region = value;
          console.log(`Set ${colors.yellow("region")} to ${colors.green(this.region)}`);
          break;
        default:
          console.log(colors.red(`Unknown property: ${property}`));
      }
    });

    this.register("call", "Call a registered caller", async (args: string[]) => {
      if (args.length === 0) {
        console.log(colors.red("Usage: call <caller-name> [args...]"));
        return;
      }
      const callerName = args[0]!;
      const callerArgs = args.slice(1);
      try {
        await this.callerHelper.call(callerName, callerArgs);
      } catch (error) {
        console.log(
          colors.red(`Error calling ${callerName}: ${error instanceof Error ? error.message : String(error)}`)
        );
      }
    });

    this.register("callers", "List all registered callers", async () => {
      const callers = this.callerHelper.getAll();
      console.log(colors.bold("Registered callers:"));
      for (const caller of callers) {
        console.log(`  ${colors.blue(caller.name)} - Args: ${colors.magenta(caller.argsDescription.join(" "))}`);
      }
    });
  }

  /**
   * Start interactive shell
   */
  async start() {
    if (!this.TENMIKU) {
      throw new Error("InteractivePlugin is not set up with TenMiku instance");
    }

    if (this.isRunning) {
      console.log(colors.yellow("Interactive shell is already running"));
      return;
    }

    this.isRunning = true;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(colors.green.bold("Welcome to TenMiku Interactive Shell\n"));

    await this.promptLoop();
  }

  /**
   * Stop interactive shell
   */
  async stop() {
    this.isRunning = false;
    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
    console.log(colors.green("Exiting interactive shell..."));
  }

  /**
   * Main prompt loop
   */
  private async promptLoop() {
    while (this.isRunning && this.rl) {
      await new Promise<void>((resolve) => {
        const prompt = colors.cyan("TenMiku> ");
        this.rl!.question(prompt, async (input) => {
          const trimmed = input.trim();

          // Show help hint if input is empty
          if (trimmed === "") {
            console.log(colors.dim("type ? for help"));
            resolve();
            return;
          }

          await this.executeCommand(trimmed);
          resolve();
        });
      });
    }
  }

  /**
   * Execute a command
   */
  private async executeCommand(input: string) {
    const parts = input.split(/\s+/);
    const command = parts[0];
    const args = parts.slice(1);

    if (!command) return;

    const cmd = this.commands.get(command);
    if (cmd) {
      try {
        await Promise.resolve(cmd.handler(args));
      } catch (error) {
        console.log(colors.red(`Error executing command: ${error instanceof Error ? error.message : String(error)}`));
      }
    } else {
      console.log(colors.yellow(`Unknown command: ${command}. Type ? for help.`));
    }
  }

  /**
   * Setup plugin with TenMiku instance
   */
  override setup(tenmiku: TenMiku) {
    this.TENMIKU = tenmiku;
    this.callerHelper.useIntegrated(tenmiku, this);
    tenmiku.interactive = async () => {
      await this.start();
    };
  }
}
