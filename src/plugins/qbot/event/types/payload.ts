import z from "zod";
import type { EVENT_TYPE, EventType } from "./event";
import type { OpCode } from "./opcode";

type RemovePartial<T> = {
  [K in keyof T as T extends Record<K, T[K]> ? K : never]: T[K];
};

type SwitchType<Has extends 1 | 0 | undefined, T> = Has extends 1 ? Required<T> : Has extends 0 ? RemovePartial<T> : T;

interface Has {
  id?: 1 | 0;
  t?: 1 | 0;
  s?: 1 | 0;
}

type AnyEventPayload<
  OP extends OpCode = OpCode,
  T extends EventType = EventType,
  // biome-ignore lint/suspicious/noExplicitAny: any is used for generic payloads
  D extends Record<string, any> = any,
  // biome-ignore lint/complexity/noBannedTypes: all undefined properties
  HAS extends Has = {},
> = SwitchType<
  HAS["id"],
  {
    /**
     * 事件 ID
     */
    id?: string;
  }
> & {
  /**
   * 操作码
   * @see https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.htm
   */
  op: OP;
} & SwitchType<
    HAS["t"],
    {
      /**
       * 事件类型
       * @description 主要用在 `op` 为 `0 Dispatch` 的时候
       */
      t?: T;
    }
  > &
  SwitchType<
    HAS["s"],
    {
      /**
       * 事件序列号
       * @description 下行消息都会有一个序列号，标识消息的唯一性，客户端需要再发送心跳的时候，携带客户端收到的最新的 `s`
       */
      s?: number;
    }
  > & {
    /**
     * 事件内容
     * @description 不同事件类型的事件内容格式都不同，请注意识别，主要用在 `op` 为 `0 Dispatch` 的时候
     */
    d: D;
  };

export const EventPayloadSchema = z.object({
  id: z.string().optional(),
  op: z.number().int(),
  t: z.string().optional(),
  s: z.number().int().optional(),
  d: z.object({}).catchall(z.any()),
});

type EventTypeDataMap_T<
  // biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
  TD extends Partial<Record<EventType, Record<string, any>>>,
> = RemovePartial<TD>;

type EventPayload_OP_T<
  OP extends OpCode = OpCode,
  T extends EventType = EventType,
  // biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
  M extends Record<string, Record<string, any>> = Record<EventType, Record<string, any>>,
  HAS extends Has = Has,
> = T extends keyof M ? AnyEventPayload<OP, T, M[T], HAS & { t: 1 }> : AnyEventPayload<OP, T>;

export type EventPayloadMap<T extends EventType = EventType> = {
  [OpCode.Dispatch]: EventPayload_OP_T<
    OpCode.Dispatch,
    T,
    EventTypeDataMap_T<{
      [EVENT_TYPE.C2C.MESSAGE_CREATE]: {
        id: string;
        content: string;
        timestamp: string;
        author: {
          id: string;
          user_openid: string;
          union_openid: string;
        };
        message_scene: {
          source: string;
        };
        message_type: number;
      };
      [EVENT_TYPE.GROUP.AT_MESSAGE_CREATE]: {
        id: string;
        content: string;
        timestamp: string;
        author: {
          id: string;
          member_openid: string;
          union_openid: string;
        };
        group_id: string;
        group_openid: string;
        message_scene: {
          source: string;
        };
        message_type: number;
      };
    }>,
    { id: 1 }
  >;
  [OpCode.VerifyCallback]: AnyEventPayload<
    OpCode.VerifyCallback,
    T,
    { plain_token: string; event_ts: string },
    { id: 0; t: 0; s: 0 }
  >;
};

export type EventPayload<K extends OpCode = OpCode, T extends EventType = EventType> = [K] extends [
  keyof EventPayloadMap<T>,
]
  ? EventPayloadMap<T>[K]
  : AnyEventPayload;
