/**
 * QQ 机器人操作码
 * @see https://bot.q.qq.com/wiki/develop/api-v2/dev-prepare/interface-framework/event-emit.htm
 */
export enum OpCode {
  /**
   * 服务端进行消息推送
   * @type WebHook / WebSocket - Receive
   * @note QQ 官方不再支持 WebSocket 接入
   */
  Dispatch = 0,

  /**
   * 客户端或服务端发送心跳
   * @type WebSocket - Send / Receive
   * @deprecated QQ 官方不再支持 WebSocket 接入
   */
  Heartbeat = 1,

  /**
   * 客户端发送鉴权
   * @type WebSocket - Send
   * @deprecated QQ 官方不再支持 WebSocket 接入
   */
  Identify = 2,

  /**
   * 客户端恢复连接
   * @type WebSocket - Send
   * @deprecated QQ 官方不再支持 WebSocket 接入
   */
  Resume = 6,

  /**
   * 服务端通知客户端重新连接
   * @type WebSocket - Receive
   * @deprecated QQ 官方不再支持 WebSocket 接入
   */
  Reconnect = 7,

  /**
   * 当 identify 或 resume 的时候，如果参数有错，服务端会返回该消息
   * @type WebSocket - Receive
   * @deprecated QQ 官方不再支持 WebSocket 接入
   */
  InvalidSession = 9,

  /**
   * 当客户端与网关建立 ws 连接之后，网关下发的第一条消息
   * @type WebSocket - Receive
   * @deprecated QQ 官方不再支持 WebSocket 接入
   */
  Hello = 10,

  /**
   * 当发送心跳成功之后，就会收到该消息
   * @type WebSocket - Receive / Reply
   * @deprecated QQ 官方不再支持 WebSocket 接入
   */
  HeartbeatACK = 11,

  /**
   * 仅用于 http 回调模式的回包，代表机器人收到了平台推送的数据
   * @type WebHook - Reply
   */
  HTTPCallbackACK = 12,

  /**
   * 开放平台对机器人服务端进行验证
   * @type WebHook - Receive
   */
  VerifyCallback = 13,
}

export type OpCodeKey<FilterCode = OpCode> = {
  [K in keyof typeof OpCode]: (typeof OpCode)[K] extends FilterCode ? K : never;
}[keyof typeof OpCode];

export const WebhookOpCodesValues = [OpCode.Dispatch, OpCode.HTTPCallbackACK, OpCode.VerifyCallback] as const;
export const WebsocketOpCodesValues = [
  OpCode.Dispatch,
  OpCode.Heartbeat,
  OpCode.Identify,
  OpCode.Resume,
  OpCode.Reconnect,
  OpCode.InvalidSession,
  OpCode.Hello,
  OpCode.HeartbeatACK,
] as const;

export const WebhookReplyOpCodes = [OpCode.VerifyCallback] as const;
export const WebsocketReplyOpCodes = [OpCode.HeartbeatACK] as const;

export type WebhookOpCode = (typeof WebhookOpCodesValues)[number];
export type WebsocketOpCode = (typeof WebsocketOpCodesValues)[number];

export type WebhookReplyOpCode = (typeof WebhookReplyOpCodes)[number];
export type WebsocketReplyOpCode = (typeof WebsocketReplyOpCodes)[number];

export function isWebhookOpCode(op: OpCode | number): op is WebhookOpCode {
  return WebhookOpCodesValues.includes(op as WebhookOpCode);
}
export function isWebsocketOpCode(op: OpCode | number): op is WebsocketOpCode {
  return WebsocketOpCodesValues.includes(op as WebsocketOpCode);
}

export function isWebhookReplyOpCode(op: OpCode | number): op is WebhookReplyOpCode {
  return WebhookReplyOpCodes.includes(op as WebhookReplyOpCode);
}

export function isWebsocketReplyOpCode(op: OpCode | number): op is WebsocketReplyOpCode {
  return WebsocketReplyOpCodes.includes(op as WebsocketReplyOpCode);
}
