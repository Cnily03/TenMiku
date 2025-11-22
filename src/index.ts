import type { Cache } from "@/core/net/cache";
import type { TenMikuPlugin } from "@/core/plugin";
import InteractivePlugin from "@/plugins/interactive";
import QbotPlugin from "@/plugins/qbot";
import { TenMikuUtils } from "@/utils";
import type { Database } from "./core/net/database";

export interface TenmikuProtected {
  cache?: Cache;
}

interface TenMikuOptions {
  cache?: Cache;
  /**
   * For `QbotPlugin`
   */
  database?: Database;
}

export class TenMiku {
  private plugins: TenMikuPlugin[] = [];
  protected cache?: Cache;
  readonly utils: TenMikuUtils;

  constructor(options?: TenMikuOptions) {
    this.cache = options?.cache;
    this?.cache?.check().then((ok) => {
      if (ok) console.log("[TenMiku] Cache is ready.");
    });
    this.utils = new TenMikuUtils({ cache: this.cache });
    // integrated plugins
    this.use(new InteractivePlugin());
    this.use(new QbotPlugin({ cache: this.cache, database: options?.database }));
  }

  use(plugin: TenMikuPlugin) {
    this.plugins.push(plugin);
    plugin.setup(this, { cache: this.cache });
    return this;
  }
}

export default TenMiku;
