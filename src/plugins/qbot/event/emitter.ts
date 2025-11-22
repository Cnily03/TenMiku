import EventEmitter from "eventemitter3";
import type { Context } from "hono";
import type { QBotHonoEnv } from "..";
import {
  type EventPayload,
  type EventType,
  OpCode,
  type OpCodeKey,
  type WebhookOpCode,
  type WebhookReplyOpCode,
  type WebsocketOpCode,
  type WebsocketReplyOpCode,
} from "./types";

type InjectVoid<T> = (T extends Promise<infer R> ? Promise<R | undefined> : T) | undefined;

type NextFunction<T = undefined> = () => InjectVoid<T>;
// biome-ignore lint/suspicious/noExplicitAny: any is used for generic payloads
type WithNext<T extends (...args: any[]) => any> = T extends (...args: infer P) => infer R
  ? (...args: [...P, next: NextFunction<R>]) => R
  : never;

/**
 * Used for `Reply` needed events
 */
type QbotHandleMap = {
  [K in WebhookReplyOpCode as `webhook:${K | Lowercase<OpCodeKey<K>>}`]: (
    data: EventPayload<K>,
    c: Context<QBotHonoEnv>
  ) => InjectVoid<Promise<Response> | Response>;
} & {
  [K in WebsocketReplyOpCode as `websocket:${K | Lowercase<OpCodeKey<K>>}`]: (
    data: EventPayload<K>
  ) => InjectVoid<Promise<string> | string>;
};

type QbotEventMap = {
  "*": [data: EventPayload];
  webhook: [data: EventPayload<WebhookOpCode>];
  websocket: [data: EventPayload<WebsocketOpCode>];
} & {
  [K in OpCode as `*:${K | Lowercase<OpCodeKey<K>>}`]: [data: EventPayload<K>];
} & {
  [K in WebhookOpCode as `webhook:${K | Lowercase<OpCodeKey<K>>}`]: [data: EventPayload<K>];
} & {
  [K in WebsocketOpCode as `websocket:${K | Lowercase<OpCodeKey<K>>}`]: [data: EventPayload<K>];
};

export class QBotEventEmitter extends EventEmitter<QbotEventMap> {
  handlers: {
    [k in keyof QbotHandleMap]?: Array<WithNext<QbotHandleMap[k]>>;
  };

  private errorHandlers: Array<(e: unknown) => Promise<void> | void> = [];

  // biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
  private safeMap = new Map<(...args: any[]) => any, (...args: any[]) => any>();

  constructor() {
    super();
    this.handlers = {};
  }

  private unifyEvent<E extends keyof QbotHandleMap>(event: E): E {
    // convert opcode string to number
    const [scope, opstr] = event.split(":");
    if (opstr && !/^\d+$/.test(opstr)) {
      const opnum = Object.entries(OpCode).find(([k, _v]) => k.toLowerCase() === opstr!.toLowerCase())?.[1];
      if (opnum !== undefined) {
        return `${scope}:${opnum}` as E;
      }
    }
    return event;
  }

  handle(event: keyof QbotHandleMap, handler: WithNext<QbotHandleMap[typeof event]>) {
    event = this.unifyEvent(event);
    if (!this.handlers[event]) {
      this.handlers[event] = [];
    }
    // biome-ignore lint/suspicious/noExplicitAny: push cannot specify type
    this.handlers[event]!.push(handler as unknown as any);
  }

  trigger<E extends keyof QbotHandleMap>(
    event: E,
    ...args: Parameters<QbotHandleMap[E]>
  ): InjectVoid<ReturnType<QbotHandleMap[E]>> {
    // event = this.unifyEvent(event);
    const handlers = this.handlers[event] as Array<WithNext<QbotHandleMap[E]>> | undefined;
    if (handlers && handlers.length > 0) {
      const createNext = (index: number): NextFunction<ReturnType<QbotHandleMap[E]>> => {
        return () => {
          if (index >= handlers.length) return;
          const handler = handlers[index];
          if (handler) {
            // biome-ignore lint/suspicious/noExplicitAny: must be correct type
            return (handler as unknown as (...args: any) => any)(...args, createNext(index + 1));
          }
        };
      };
      return createNext(0)();
    }
  }

  onError(handler: (e: unknown) => Promise<void> | void) {
    this.errorHandlers.push(handler);
  }

  private async emitError(e: unknown) {
    if (this.errorHandlers.length > 0) {
      await Promise.all(
        this.errorHandlers.map(async (handler) => {
          try {
            await handler(e);
          } catch {
            // ignore
          }
        })
      );
    }
  }

  // biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
  private makeSafeFunc<T extends (...args: any[]) => any>(func: T): T {
    return ((...innerArgs: Parameters<typeof func>) => {
      try {
        const p = func(...innerArgs);
        if (p instanceof Promise) {
          return p.catch((e) => {
            this.emitError(e);
          });
        }
      } catch (e) {
        this.emitError(e);
      }
    }) as T;
  }

  override on<T extends EventEmitter.EventNames<QbotEventMap>>(
    event: T,
    listener: EventEmitter.EventListener<QbotEventMap, T>
  ): this;
  override on(...args: Parameters<EventEmitter<QbotEventMap>["on"]>): this {
    const func = args[1];
    args[1] = this.makeSafeFunc(func);
    this.safeMap.set(func, args[1]);
    super.on(...args);
    return this;
  }

  override once<T extends EventEmitter.EventNames<QbotEventMap>>(
    event: T,
    listener: EventEmitter.EventListener<QbotEventMap, T>
  ): this;
  override once(...args: Parameters<EventEmitter<QbotEventMap>["once"]>): this {
    const func = args[1];
    args[1] = this.makeSafeFunc(func);
    this.safeMap.set(func, args[1]);
    super.once(...args);
    return this;
  }

  override off<T extends EventEmitter.EventNames<QbotEventMap>>(
    event: T,
    listener: EventEmitter.EventListener<QbotEventMap, T>
  ): this;
  override off(...args: Parameters<EventEmitter<QbotEventMap>["off"]>): this {
    const func = args[1] as unknown as (...args: unknown[]) => unknown;
    const safeFunc = this.safeMap.get(func);
    if (safeFunc) {
      args[1] = safeFunc;
      this.safeMap.delete(func);
    }
    super.off(...args);
    return this;
  }

  override addListener<T extends EventEmitter.EventNames<QbotEventMap>>(
    event: T,
    listener: EventEmitter.EventListener<QbotEventMap, T>
  ): this;
  override addListener(...args: Parameters<EventEmitter<QbotEventMap>["addListener"]>): this {
    const func = args[1];
    args[1] = this.makeSafeFunc(func);
    this.safeMap.set(func, args[1]);
    super.addListener(...args);
    return this;
  }

  override removeListener<T extends EventEmitter.EventNames<QbotEventMap>>(
    event: T,
    listener: EventEmitter.EventListener<QbotEventMap, T>
  ): this;
  override removeListener(...args: Parameters<EventEmitter<QbotEventMap>["removeListener"]>): this {
    const func = args[1] as unknown as (...args: unknown[]) => unknown;
    const safeFunc = this.safeMap.get(func);
    if (safeFunc) {
      args[1] = safeFunc;
      this.safeMap.delete(func);
    }
    super.removeListener(...args);
    return this;
  }
}

export function isEventTypeOf<EP extends EventPayload, T extends EventType>(
  data: EP,
  eventType: T | T[]
): data is EP & { t: T } {
  const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
  return (data as EventPayload).t !== undefined && eventTypes.some((et) => et === (data as EventPayload).t);
}

// biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
type FuncWithEventType<F extends (data: EventPayload, ...args: any[]) => any, T extends EventType> = F extends (
  data: { op: infer OP extends OpCode } & infer _,
  ...args: infer P
) => infer R
  ? (data: EventPayload<OP, T>, ...args: P) => R
  : never;

/**
 * Trigger the handler only when the event type matches property `t` of the first argument.
 */
// biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
export function whenType<F extends (...args: any[]) => any, T extends EventType>(
  eventType: T | T[],
  then: FuncWithEventType<F, T>
): F {
  const eventTypes = Array.isArray(eventType) ? eventType : [eventType];
  return ((data?: EventPayload, ...args: unknown[]) => {
    if (data && eventTypes.some((et) => et === data.t)) {
      return then(data, ...args);
    }
  }) as F;
}
