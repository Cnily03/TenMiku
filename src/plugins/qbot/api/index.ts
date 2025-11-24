import ky, { type KyInstance } from "ky";
import type { Cache } from "@/core/net/cache";
import { ConfigError } from "../error";
import type { PrepareRichMediaRequest, RichMedia, SendMessageRequest, SendMessageResponse } from "./types";

const QBOT_ACCESS_TOKEN_ENDPOINT = "https://bots.qq.com/app/getAppAccessToken";
const QBOT_PROD_OPENAPI_ENDPOINT = "https://api.sgroup.qq.com";
const QBOT_SANDBOX_OPENAPI_ENDPOINT = "https://sandbox.api.sgroup.qq.com";

interface AccessTokenResponse {
  access_token: string;
  /**
   * in seconds
   */
  expires_in: string;
}

export interface QbotApiHttpOptions {
  prefixUrl?: string;
  retry?: number;
}

export interface QbotApiBaseOptions {
  /**
   * 是否使用沙箱环境
   * @default false
   */
  sandbox?: boolean;
  env?: Partial<QBotApiEnv>;
  cache?: Cache;
}

export type QbotApiOptions = QbotApiBaseOptions & QbotApiHttpOptions;

export interface QBotApiEnv {
  appId: string;
  appSecret: string;
}

export class QBotApi {
  private _sandbox: boolean;
  readonly http: KyInstance;
  protected cache?: Cache;
  private accessTokenCache = {
    token: "",
    /**
     * timestamp in milliseconds
     */
    expiresAt: 0,
  };
  protected optsHttp: Required<QbotApiHttpOptions>;
  private env: QBotApiEnv;

  constructor(options?: QbotApiOptions) {
    this.env = {
      appId: options?.env?.appId || process?.env?.QBOT_APP_ID || "",
      appSecret: options?.env?.appSecret || process?.env?.QBOT_APP_SECRET || "",
    };
    this._sandbox = options?.sandbox ?? false;
    this.cache = options?.cache;
    const _opts: Partial<QbotApiOptions> & Required<QbotApiHttpOptions> = Object.assign(
      {},
      {
        prefixUrl: this.OPENAPI_ENDPOINT,
        retry: 3,
      },
      options
    );
    delete _opts.sandbox;
    delete _opts.env;
    delete _opts.cache;
    this.optsHttp = _opts;
    const that = this;
    this.http = ky.create({
      // prefixUrl: this.opts.prefixUrl,
      get prefixUrl() {
        return that.OPENAPI_ENDPOINT;
      },
      ...this.optsHttp,
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

  get OPENAPI_ENDPOINT() {
    return this._sandbox ? QBOT_SANDBOX_OPENAPI_ENDPOINT : QBOT_PROD_OPENAPI_ENDPOINT;
  }

  get sandbox(): boolean {
    return this._sandbox;
  }

  setSandbox(sandbox: boolean) {
    this._sandbox = sandbox;
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
      .post(QBOT_ACCESS_TOKEN_ENDPOINT, {
        json: {
          appId: this.env.appId,
          clientSecret: this.env.appSecret,
        },
        ...this.optsHttp,
        prefixUrl: "",
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
