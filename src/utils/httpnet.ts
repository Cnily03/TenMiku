// * some types and mind is from npm package 'ky'

export type HttpMethod = "get" | "post" | "put" | "patch" | "head" | "delete";

export type AdvRequest<T = unknown> = {
  json<J = T>(): Promise<J>;
  clone(): AdvRequest<T>;
} & Request;

export type AdvResponse<T = unknown> = {
  json: <J = T>() => Promise<J>;
} & Response;

export type ResponsePromise<T = unknown> = {
  arrayBuffer: () => Promise<ArrayBuffer>;
  blob: () => Promise<Blob>;
  /**
   * @deprecated
   */
  formData: () => Promise<FormData>;
  bytes: () => Promise<Uint8Array>;
  json: <J = T>() => Promise<J>;
  text: () => Promise<string>;
} & Promise<AdvResponse<T>>;

type HeadersInit = NonNullable<RequestInit["headers"]> | Record<string, string | undefined>;

type RequestRedirectInit = NonNullable<RequestInit["redirect"]>;

type SearchParamsInit =
  | URLSearchParams
  | Record<string, string | number | boolean | undefined | null>
  | Array<Array<string | number | boolean | undefined | null>>;

type FormDataInit = FormData | Record<string, string | Blob | undefined | null> | Array<Array<string | Blob>>;

export interface RequestOptions extends Omit<RequestInit, "headers"> {
  prefixUrl?: string;
  method?: HttpMethod;
  headers?: HeadersInit;
  searchParams?: URLSearchParams | Record<string, string | number | boolean | undefined>;
  body?: RequestInit["body"];
  json?: unknown;
  formSearch?: SearchParamsInit;
  formData?: FormDataInit;
  timeout?: number;
  retry?: number;
  redirect?: RequestRedirectInit;
  throwHttpErrors?: boolean;
}

// biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
function toStr(v: any, emptyAsEmptyString: boolean = false): string {
  if (v === null || v === undefined) {
    return emptyAsEmptyString ? "" : String(v);
  }
  return Object.hasOwn(v, "toString") ? v.toStr() : String(v);
}

function normalizeHeaders(init: HeadersInit): Headers {
  const headers = new Headers();
  if (init instanceof Headers) {
    return init;
  }
  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      if (value !== undefined) {
        headers.append(toStr(key), toStr(value, true));
      }
    }
  } else {
    // record
    Object.entries(init).forEach(([key, value]) => {
      if (value !== undefined) {
        headers.append(toStr(key), toStr(value, true));
      }
    });
  }
  return headers;
}

function normalizeSearchParams(init: SearchParamsInit): URLSearchParams {
  if (init instanceof URLSearchParams) {
    return init;
  }
  const searchParams = new URLSearchParams();
  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      searchParams.append(toStr(key), toStr(value, true));
    }
  } else {
    // record
    for (const key in init) {
      const value = init[key];
      if (value !== undefined && value !== null) {
        searchParams.append(toStr(key), toStr(value, true));
      }
    }
  }
  return searchParams;
}

function normalizeFormData(init: FormDataInit): FormData {
  if (init instanceof FormData) {
    return init;
  }
  const formData = new FormData();
  if (Array.isArray(init)) {
    for (const [key, value] of init) {
      formData.append(toStr(key), value);
    }
  } else {
    // record
    for (const key in init) {
      const value = init[key];
      if (value !== undefined && value !== null) {
        formData.append(toStr(key), value);
      }
    }
  }
  return formData;
}

function fetchTimeout<T = unknown>(request: AdvRequest<T>, timeout: number): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(request));
    }, timeout);
    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        if (err instanceof Error) {
          if (err.name === "Timeout") {
            reject(new TimeoutError(request));
          } else if (err.message.includes("SocketError")) {
            reject(new SocketError(request, err.message));
          } else {
            reject(new UnknownError(request, err.message));
          }
        } else {
          reject(new UnknownError(request));
        }
      });
  });
}

interface HTTPNetworkOptions {
  prefixUrl?: string;
  hooks?: {
    beforeRequest?: Array<(request: Request) => Promise<void> | void>;
    afterResponse?: Array<(response: Response) => Promise<void> | void>;
    beforeRetry?: Array<(retried: number) => Promise<void> | void>;
    beforeError?: Array<(error: HTTPError) => Promise<HTTPError | undefined> | HTTPError | undefined>;
  };
  timeout?: number;
  retry?: number;
  redirect?: RequestRedirectInit;
  throwHttpErrors?: boolean;
}

interface RequiredHTTPNetworkOptions extends HTTPNetworkOptions {
  prefixUrl?: string;
  hooks: {
    beforeRequest: Array<(request: Request) => Promise<void> | void>;
    afterResponse: Array<(response: Response) => Promise<void> | void>;
    beforeRetry: Array<(retried: number) => Promise<void> | void>;
    beforeError: Array<(error: HTTPError) => Promise<HTTPError | undefined> | HTTPError | undefined>;
  };
  timeout: number;
  retry: number;
  redirect: RequestRedirectInit;
  throwHttpErrors: boolean;
}

export default class HTTPNetwork {
  protected opts: RequiredHTTPNetworkOptions;
  constructor(options?: HTTPNetworkOptions) {
    this.opts = this.mergeClassOptions(options);
  }

  private mergeClassOptions(options?: HTTPNetworkOptions) {
    const merged = Object.assign(
      {},
      {
        hooks: {},
        timeout: 10 * 1000,
        retry: 0,
        redirect: "follow",
        throwHttpErrors: true,
      },
      options || {}
    );
    merged.hooks = Object.assign(
      {},
      {
        beforeRequest: [],
        afterResponse: [],
        beforeRetry: [],
        beforeError: [],
      },
      options?.hooks || {}
    );
    return merged as unknown as RequiredHTTPNetworkOptions;
  }

  private modifyResponse<T>(response: Promise<Response>): ResponsePromise<T> {
    const rp = response as unknown as ResponsePromise<T>;
    rp.arrayBuffer = async () => response.then((res) => res.arrayBuffer());
    rp.blob = async () => response.then((res) => res.blob());
    rp.formData = async () => response.then((res) => res.formData());
    rp.bytes = async () => response.then((res) => res.arrayBuffer().then((buf) => new Uint8Array(buf)));
    rp.json = async <J = T>() => response.then((res) => res.json()) as Promise<J>;
    rp.text = async () => response.then((res) => res.text());
    return rp;
  }

  private mergeURL(url: string, prefixUrl?: string): string {
    if (prefixUrl) {
      if (/^\s*\/+\s*$/.test(url)) return prefixUrl.replace(/\/+$/, "/");
      return `${prefixUrl.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
    }
    return url;
  }

  private isOkResponse(response: Response): boolean {
    if (response.ok) return true;
    const status = response.status;
    if (status >= 200 && status < 400) return true;
    return false;
  }

  private async processHTTPError(error: HTTPError): Promise<HTTPError> {
    const hooks = this.opts.hooks.beforeError;
    for (const hook of hooks) {
      error = (await hook(error)) || error;
    }
    return error;
  }

  private async _request<T>(url: string, options?: RequestOptions): Promise<AdvResponse<T>> {
    // options in this request
    const opts = {
      prefixUrl: options?.prefixUrl ?? this.opts.prefixUrl,
      timeout: options?.timeout ?? this.opts.timeout,
      redirect: options?.redirect ?? this.opts.redirect,
      retry: options?.retry ?? this.opts.retry,
      throwHttpErrors: options?.throwHttpErrors ?? this.opts.throwHttpErrors,
    };
    const method = options?.method ? options.method.toUpperCase() : "GET";
    // url
    let fullUrl = this.mergeURL(url, opts.prefixUrl);
    if (options?.searchParams) {
      const searchParams = normalizeSearchParams(options.searchParams);
      const urlObj = new URL(fullUrl);
      searchParams.forEach((value, key) => {
        urlObj.searchParams.append(key, value);
      });
      fullUrl = urlObj.toString();
    }
    // init
    const init: RequestInit = {};
    let contentType = "";
    if (options?.headers) init.headers = normalizeHeaders(options.headers);
    if (options?.body) init.body = options.body;
    if (options?.redirect) init.redirect = opts.redirect;
    if (options?.json) {
      contentType = "application/json;charset=UTF-8";
      init.body = JSON.stringify(options.json);
    }
    if (options?.formSearch) {
      contentType = "application/x-www-form-urlencoded;charset=UTF-8";
      init.body = normalizeSearchParams(options.formSearch).toString();
    }
    if (options?.formData) {
      contentType = "multipart/form-data";
      init.body = normalizeFormData(options.formData);
    }
    if (contentType) {
      const headers = init.headers ? new Headers(init.headers) : new Headers();
      headers.set("Content-Type", contentType);
      init.headers = headers;
    }
    const request = new Request(fullUrl, {
      method: method.toUpperCase(),
      ...init,
    }) as AdvRequest<T>;

    // before hooks
    for (const hook of this.opts.hooks.beforeRequest) {
      await hook(request);
    }

    // send request
    const requestClone = request.clone();
    let response = await fetchTimeout(requestClone.clone(), opts.timeout);
    for (let i = 0; i < opts.retry; i++) {
      if (this.isOkResponse(response)) break;
      else await this.processHTTPError(new HTTPError(request, response as AdvResponse));
      await Promise.all(this.opts.hooks.beforeRetry.map((hook) => hook(i)));
      response = await fetchTimeout(requestClone.clone(), opts.timeout);
    }
    if (!this.isOkResponse(response) && opts.throwHttpErrors) {
      throw await this.processHTTPError(new HTTPError(request, response as AdvResponse));
    }

    // after hooks
    for (const hook of this.opts.hooks.afterResponse) {
      await hook(response);
    }
    return response as AdvResponse<T>;
  }

  request<T>(url: string, options?: RequestOptions): ResponsePromise<T> {
    return this.modifyResponse<T>(this._request<T>(url, options)) as unknown as ResponsePromise<T>;
  }

  get<T>(url: string, options?: Omit<RequestOptions, "method">): ResponsePromise<T> {
    return this.request<T>(url, { ...options, method: "get" });
  }

  post<T>(url: string, options?: Omit<RequestOptions, "method">): ResponsePromise<T> {
    return this.request<T>(url, { ...options, method: "post" });
  }

  put<T>(url: string, options?: Omit<RequestOptions, "method">): ResponsePromise<T> {
    return this.request<T>(url, { ...options, method: "put" });
  }

  delete<T>(url: string, options?: Omit<RequestOptions, "method">): ResponsePromise<T> {
    return this.request<T>(url, { ...options, method: "delete" });
  }

  patch<T>(url: string, options?: Omit<RequestOptions, "method">): ResponsePromise<T> {
    return this.request<T>(url, { ...options, method: "patch" });
  }

  head(url: string, options?: Omit<RequestOptions, "method">): ResponsePromise {
    return this.request(url, { ...options, method: "head" });
  }
}

export class HTTPError extends Error {
  request: AdvRequest;
  response: AdvResponse;
  constructor(request: AdvRequest, response: AdvResponse) {
    super(`HTTPError: ${response.status} ${response.statusText} caused by request ${request.method} ${request.url}`);
    this.name = "HTTPError";
    this.request = request;
    this.response = response;
  }
}

export class UnknownError extends Error {
  public request: AdvRequest;

  constructor(request: AdvRequest, message?: string) {
    super(message || `An unknown error occurred during request: ${request.method} ${request.url}`);
    this.name = "UnknownError";
    this.request = request;
  }
}

export class SocketError extends Error {
  public request: AdvRequest;

  constructor(request: AdvRequest, message?: string) {
    super(message || `SocketError: error occurred during request: ${request.method} ${request.url}`);
    this.name = "SocketError";
    this.request = request;
  }
}

export class TimeoutError extends Error {
  public request: AdvRequest;

  constructor(request: AdvRequest) {
    super(`TimeoutError: Request timed out: ${request.method} ${request.url}`);
    this.name = "TimeoutError";
    this.request = request;
  }
}
