import type { Cache } from "@/core/net/cache";
import type { TenMikuPlugin } from "@/core/plugin";
import InteractivePlugin from "@/plugins/interactive";
import QbotPlugin from "@/plugins/qbot";
import { type ServerRegion, TenMikuUtils } from "@/utils";
import { Logger } from "@/utils/logger";
import type { Database } from "./core/net/database";

export interface TenmikuProtected {
  cache?: Cache;
}

interface TenMikuOptions {
  cache?: Cache;
  /**
   * @default "jp"
   */
  defaultRegion?: ServerRegion;
  /**
   * For `QbotPlugin`
   */
  database?: Database;
  /**
   * For `QbotPlugin`
   */
  sandbox?: boolean;
}

export class TenMiku {
  private plugins: TenMikuPlugin[] = [];
  protected cache?: Cache;
  readonly utils: TenMikuUtils;
  readonly logger: Logger;

  constructor(options?: TenMikuOptions) {
    this.logger = new Logger("TenMiku");
    this.cache = options?.cache;
    this?.cache?.check().then((ok) => {
      if (ok) this.logger.info("Cache is ready.");
    });
    this.utils = new TenMikuUtils({
      cache: this.cache,
      defaultRegion: options?.defaultRegion ?? "jp",
    });
    // integrated plugins
    this.use(new InteractivePlugin());
    this.use(
      new QbotPlugin({
        cache: this.cache,
        database: options?.database,
        sandbox: options?.sandbox ?? false,
      })
    );
  }

  use(plugin: TenMikuPlugin) {
    this.plugins.push(plugin);
    plugin.setup(this, { cache: this.cache });
    return this;
  }
}

export default TenMiku;
