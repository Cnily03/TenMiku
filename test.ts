import dotenv from "dotenv";
import { Cache } from "@/core/net/cache";
import { Database } from "@/core/net/database";
import TenMiku from "@/index";
import config from "@/utils/config";

const bindings = dotenv.config({ path: [".env.local", ".env"] }).parsed;

const cache = config.cache.enable ? new Cache(config.cache.url) : undefined;
const database = config.database.enable ? new Database(config.database) : undefined;

const tenmiku = new TenMiku({ cache, database });

const app = tenmiku.createHonoApp();

export default {
  fetch: ((req) => app.fetch(req, bindings)) as typeof app.fetch,
  port: 1331,
};
