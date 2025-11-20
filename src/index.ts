import type { TenMikuPlugin } from "@/core/plugin";
import type { Cache } from "./core/net/cache";
import { TenMikuUtils } from "./utils";

interface TenMikuOptions {
  cache?: Cache;
}

export default class TenMiku {
  private plugins: TenMikuPlugin[] = [];
  private cache?: Cache;
  readonly utils: TenMikuUtils;

  constructor(options?: TenMikuOptions) {
    this.cache = options?.cache;
    this.utils = new TenMikuUtils({ cache: this.cache });
  }

  // reserve for integrated plugin: interactive
  async interactive(): Promise<void> {}

  use(plugin: TenMikuPlugin) {
    this.plugins.push(plugin);
    plugin.setup(this);
    return this;
  }
}
