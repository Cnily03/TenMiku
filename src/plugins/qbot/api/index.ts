import ky, { type KyInstance } from "ky";
import type { Cache } from "@/core/net/cache";
import { ConfigError } from "../error";
import type { PrepareRichMediaRequest, RichMedia, SendMessageRequest, SendMessageResponse } from "./types";

const QBOT_OPENAPI_ENDPOINT = "https://api.sgroup.qq.com";

interface AccessTokenResponse {
  access_token: string;
  /**
   * in seconds
   */
  expires_in: string;
}

export interface QbotApiOptions {
  prefixUrl?: string;
  retry?: number;
  env?: Partial<QBotApiEnv>;
  cache?: Cache;
}

export interface QBotApiEnv {
  appId: string;
  appSecret: string;
}

export class QBotApi {
  readonly http: KyInstance;
  protected cache?: Cache;
  private accessTokenCache = {
    token: "",
    /**
     * timestamp in milliseconds
     */
    expiresAt: 0,
  };
  protected opts: Omit<Required<QbotApiOptions>, "env" | "cache">;
  private env: QBotApiEnv;

  constructor(options?: QbotApiOptions) {
    this.env = {
      appId: options?.env?.appId || process?.env?.QBOT_APP_ID || "",
      appSecret: options?.env?.appSecret || process?.env?.QBOT_APP_SECRET || "",
    };
    this.cache = options?.cache;
    const _opts = Object.assign(
      {},
      {
        prefixUrl: QBOT_OPENAPI_ENDPOINT,
        retry: 3,
      },
      options
    );
    delete (_opts as Partial<QbotApiOptions>).env;
    delete (_opts as Partial<QbotApiOptions>).cache;
    this.opts = _opts;

    this.http = ky.create({
      prefixUrl: this.opts.prefixUrl,
      retry: this.opts.retry,
      hooks: {
        beforeRequest: [
          async (request) => {
            const accessToken = await this.getValidAccessToken();
            request.headers.set("Authorization", `QQBot ${accessToken}`);
          },
        ],
      },
    });
  }

  private async getValidAccessToken() {
    if (this.accessTokenCache.token && Date.now() < this.accessTokenCache.expiresAt) {
      return this.accessTokenCache.token;
    }
    return this.updateAccessToken();
  }

  private async updateAccessToken() {
    if (!this.env.appId || !this.env.appSecret) {
      throw new ConfigError("QBotApi env not set");
    }
    const resp = await ky
      .post("https://bots.qq.com/app/getAppAccessToken", {
        // prefixUrl: "",
        json: {
          appId: this.env.appId,
          clientSecret: this.env.appSecret,
        },
        retry: this.opts.retry,
      })
      .json<AccessTokenResponse>();

    const expiresInSec = parseInt(resp.expires_in, 10) - 60; // subtract 60 seconds as buffer
    if (this.accessTokenCache.token !== resp.access_token) {
      this.accessTokenCache.token = resp.access_token;
      this.accessTokenCache.expiresAt = Date.now() + expiresInSec * 1000;
    }

    return resp.access_token;
  }

  getApiEnv() {
    return { ...this.env };
  }

  updateApiEnv(newEnv: Partial<QBotApiEnv>) {
    if (newEnv.appId && newEnv.appId !== this.env.appId) {
      this.env.appId = newEnv.appId;
    }
    if (newEnv.appSecret && newEnv.appSecret !== this.env.appSecret) {
      this.env.appSecret = newEnv.appSecret;
    }
  }

  setCache(cache: Cache) {
    this.cache = cache;
  }

  async sendC2CMessage(user_openid: string, request: SendMessageRequest) {
    return this.http.post(`v2/users/${user_openid}/messages`, { json: request }).json<SendMessageResponse>();
  }

  async sendGroupMessage(group_openid: string, request: SendMessageRequest) {
    return this.http.post(`v2/groups/${group_openid}/messages`, { json: request }).json<SendMessageResponse>();
  }

  async prepareC2CRichMedia(user_openid: string, request: PrepareRichMediaRequest, noCache = false) {
    if (!noCache && this.cache) {
      const cacheKey = this.cache.at("qbot").at("api").at("media").at("user").at(request.url);
      const cached = await cacheKey.get();
      if (cached) {
        const cachedObj: RichMedia = JSON.parse(cached);
        const ttl = (await cacheKey.ttl()) ?? cachedObj.ttl;
        return { ...cachedObj, ttl };
      }
    }
    const richMedia = await this.http
      .post(`v2/users/${user_openid}/files`, {
        json: request,
      })
      .json<RichMedia>();
    if (!noCache && this.cache) {
      const cacheKey = this.cache.at("qbot").at("api").at("media").at("user").at(request.url);
      await cacheKey.set(JSON.stringify(richMedia), richMedia.ttl === 0 ? undefined : richMedia.ttl);
    }
    return richMedia;
  }

  async prepareGroupRichMedia(group_openid: string, request: PrepareRichMediaRequest, noCache = false) {
    if (!noCache && this.cache) {
      const cacheKey = this.cache.at("qbot").at("api").at("media").at("group").at(request.url);
      const cached = await cacheKey.get();
      if (cached) {
        const cachedObj: RichMedia = JSON.parse(cached);
        const ttl = (await cacheKey.ttl()) ?? cachedObj.ttl;
        return { ...cachedObj, ttl };
      }
    }
    const richMedia = await this.http
      .post(`v2/groups/${group_openid}/files`, {
        json: request,
      })
      .json<RichMedia>();
    if (!noCache && this.cache) {
      const cacheKey = this.cache.at("qbot").at("api").at("media").at("group").at(request.url);
      await cacheKey.set(JSON.stringify(richMedia), richMedia.ttl === 0 ? undefined : richMedia.ttl);
    }
    return richMedia;
  }
}
