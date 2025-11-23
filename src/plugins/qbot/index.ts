import { Hono, type Env as HonoEnv } from "hono";
import { HTTPException } from "hono/http-exception";
import { HTTPError } from "ky";
import { ZodError } from "zod";
import type { Cache } from "@/core/net/cache";
import type { Database } from "@/core/net/database";
import { TenMikuPlugin } from "@/core/plugin";
import type TenMiku from "@/index";
import type { TenmikuProtected } from "@/index";
import type { ServerRegion } from "@/utils";
import { QBotApi } from "./api";
import { ConfigError } from "./error";
import { QBotEventEmitter } from "./event/emitter";
import {
  type EventPayload,
  EventPayloadSchema,
  isWebhookOpCode,
  isWebhookReplyOpCode,
  isWebsocketOpCode,
  isWebsocketReplyOpCode,
  OpCode,
  type OpCodeKey,
} from "./event/types";
import { registerEmitter } from "./feature";
import { PreinspectSignMw } from "./mw/verify";

declare module "@/index" {
  interface TenMiku {
    createHonoApp: () => Hono<QBotHonoEnv>;
  }
}

export interface UserPreferences {
  serverRegion: ServerRegion;
}

export interface QBotHonoEnv extends HonoEnv {
  Bindings: {
    QBOT_APP_ID: string;
    QBOT_APP_SECRET: string;
  };
}

export interface QBotPluginOptions {
  cache?: Cache;
  database?: Database;
}

// function noContent() {
//   return new Response(null, {
//     status: 204,
//   });
// }

export default class QbotPlugin extends TenMikuPlugin {
  readonly api: QBotApi;
  protected cache?: Cache;
  protected database?: Database;

  constructor(options?: QBotPluginOptions) {
    super("qbot");
    this.api = new QBotApi();
    if (options?.cache) {
      this.cache = options.cache;
      this.api.setCache(options.cache);
    }
    if (options?.database) {
      this.database = options.database;
      this.database.check().then((ok) => {
        if (ok) console.log("[QBot] database connected.");
      });
      this.initDatabase();
    }
  }

  async initDatabase() {
    if (!this.database) return;
    const client = await this.database.conn();
    await client
      .query(`
      CREATE TABLE IF NOT EXISTS qbot_preferences (
        id SERIAL PRIMARY KEY,
        openid VARCHAR(64) NOT NULL UNIQUE,
        server_region VARCHAR(16)
      );
    `)
      .catch(console.error);
    client.release();
  }

  databaseAvailable() {
    return this.database !== undefined;
  }

  async storePreferences(openid: string, preferences: UserPreferences) {
    if (!this.database) return;
    const client = await this.database.conn();
    await client
      .query(
        `
      INSERT INTO qbot_preferences (openid, server_region)
      VALUES ($1, $2)
      ON CONFLICT(openid) DO UPDATE SET server_region=excluded.server_region;
    `,
        [openid, preferences.serverRegion]
      )
      .catch(console.error);
    client.release();
  }

  async queryPreferences(openid: string): Promise<UserPreferences | null> {
    if (!this.database) return null;
    const client = await this.database.conn();
    const res = await client
      .query(
        `
      SELECT server_region FROM qbot_preferences
      WHERE openid = $1;
    `,
        [openid]
      )
      .catch(console.error);
    client.release();
    if (res && res.rows.length > 0) {
      const row = res.rows[0] as { server_region: string };
      return { serverRegion: row.server_region as ServerRegion };
    }
    return null;
  }

  protected initEmitter(tenmiku: TenMiku) {
    const emitter = new QBotEventEmitter();
    registerEmitter(emitter, this, tenmiku);
    return emitter;
  }

  override setup(tenmiku: TenMiku, ext: TenmikuProtected) {
    const emitter = this.initEmitter(tenmiku);
    if (!this.cache && ext.cache) this.cache = ext.cache;
    if (this.cache) this.api.setCache(this.cache);
    tenmiku.createHonoApp = () => this.createHonoApp(emitter, tenmiku);
  }

  private checkEnv(env: QBotHonoEnv["Bindings"] = process.env as QBotHonoEnv["Bindings"]) {
    const APP_ID = env.QBOT_APP_ID || "";
    const APP_SECRET = env.QBOT_APP_SECRET || "";
    if (!APP_ID) {
      throw new ConfigError("environment variable QBOT_APP_ID is required");
    }
    if (!APP_SECRET) {
      throw new ConfigError("environment variable QBOT_APP_SECRET is required");
    }
  }

  protected createHonoApp(emitter: QBotEventEmitter, _tenmiku: TenMiku): Hono<QBotHonoEnv> {
    const app = new Hono<QBotHonoEnv>();
    const appV1 = new Hono<QBotHonoEnv>();

    app.use("*", async (c, next) => {
      this.api.updateApiEnv({
        appId: c.env.QBOT_APP_ID,
        appSecret: c.env.QBOT_APP_SECRET,
      });
      return await next();
    });

    app.all("/ping", (c) => c.text("pong"));

    app.get("/check", (c) => {
      try {
        this.checkEnv(c.env);
        return c.text("ok");
      } catch (e) {
        return c.text(e instanceof Error ? e.message : "error", 500);
      }
    });

    appV1.post("/event/callback", PreinspectSignMw, async (c) => {
      const json = await c.req.raw.clone().json();
      const payload = EventPayloadSchema.parse(json) as EventPayload;

      const lowerKey = <T extends OpCodeKey>(str: T) => str.toLowerCase() as Lowercase<T>;
      const opKey = <T extends OpCode>(op: T) => {
        return OpCode[op] as OpCodeKey<typeof op>;
      };

      emitter.emit("*", payload);
      emitter.emit(`*:${payload.op}`, payload);
      emitter.emit(`*:${lowerKey(opKey(payload.op))}`, payload);

      if (isWebhookOpCode(payload.op)) {
        emitter.emit("webhook", payload);
        emitter.emit(`webhook:${payload.op}`, payload);
        emitter.emit(`webhook:${lowerKey(opKey(payload.op))}`, payload);
      }
      if (isWebsocketOpCode(payload.op)) {
        // throw new HTTPException(501, { message: "websocket is deprecated" });
        // this.emitter.emit("websocket", payload);
        // this.emitter.emit(`websocket:${payload.op}`, payload);
        // this.emitter.emit(`websocket:${lowerKey(opKey(payload.op))}`, payload);
      }
      if (isWebhookReplyOpCode(payload.op)) {
        // biome-ignore lint/suspicious/noExplicitAny: any is used for generic payloads
        const resp = await emitter.run(`webhook:${payload.op}`, payload as any, c);
        return resp || c.json({});
      }
      if (isWebsocketReplyOpCode(payload.op)) {
        // throw new HTTPException(501, { message: "websocket is deprecated" });
        // // biome-ignore lint/suspicious/noExplicitAny: any is used for generic payloads
        // const resp = await this.emitter.fire(`websocket:${payload.op}`, payload as any);
        // return resp || "";
      }
      return c.json({});
    });

    app.route("/v1", appV1);

    app.onError(async (e, c) => {
      if (e instanceof HTTPException) {
        return c.text(e.message, e.status);
      } else if (e instanceof ZodError) {
        return c.text("request validation error", 400);
      } else if (e instanceof ConfigError) {
        return c.text(`configuration error: ${e.message}`, 500);
      } else if (e instanceof HTTPError) {
        console.error(`HTTP error: ${e.response.status} ${e.response.statusText}: ${await e.response.text()}`);
      }
      console.error(e);
      return c.text("internal server error", 500);
    });

    emitter.onError(async (e) => {
      if (e instanceof ZodError) {
        return console.warn(`request validation error: ${e.message}`);
      } else if (e instanceof ConfigError) {
        return console.error(`configuration error: ${e.message}`);
      } else if (e instanceof HTTPError) {
        return console.error(`HTTP error: ${e.response.status} ${e.response.statusText}: ${await e.response.text()}`);
      }
      return console.error("internal server error:", e);
    });

    return app;
  }
}
