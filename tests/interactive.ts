import { Cache } from "@/core/net/cache";
import TenMiku from "@/index";
import config from "@/utils/config";

const cache = config.cache.enable ? new Cache(config.cache.url) : undefined;

const tenmiku = new TenMiku({ cache });

tenmiku.interactive();
