/**
 * Markdown 对象
 * @see https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/markdown.html#数据结构与协议
 */
export interface Markdown {
  /**
   * 原生 Markdown 文本内容
   */
  content?: string;
  /**
   * Markdown 模版 ID
   */
  custom_template_id?: string;
  /**
   * 模版内变量与填充值的 KV 映射
   */
  params?: Array<{
    key: string;
    value: string;
  }>;
}

export interface KeyboardButton {
  /**
   * 按钮 ID
   * @description 在一个 Keyboard 消息内设置唯一
   */
  id?: string;
  /**
   * 按钮显示相关的数据
   */
  render_data: {
    /**
     * 按钮上的文字
     */
    label: string;
    /**
     * 点击后按钮的文字
     */
    visited_label: string;
    /**
     * 按钮样式
     * @description
     * - `0` 灰色线框
     * - `1` 蓝色线框
     */
    style: 0 | 1;
  };
  /**
   * 按钮操作相关的数据
   */
  action: {
    /**
     * 按钮类型
     * @description
     * - `0` 跳转按钮：http 或 小程序 客户端识别 scheme
     * - `1` 回调按钮：回调后台接口, `data` 传给后台
     * - `2` 指令按钮：自动在输入框插入 `@Bot` 和 `data` 内容
     */
    type: 0 | 1 | 2;
    /**
     * 权限相关的数据
     */
    permission: {
      /**
       * 权限类型
       * @description
       * - `0` 指定用户可操作
       * - `1` 仅管理者可操作
       * - `2` 所有人可操作
       * - `3` 指定身份组可操作（仅频道可用）
       */
      type: 0 | 1 | 2 | 3;
      /**
       * 有权限的用户 id 的列表
       */
      specify_user_ids?: string[];
      /**
       * 有权限的身份组 id 的列表（仅频道可用）
       */
      specify_role_ids?: string[];
    };
    /**
     * 操作相关的数据
     */
    data: string;
    /**
     * 指令按钮可用，指令是否带引用回复本消息
     * @note 支持版本 8983
     * @default false
     */
    reply?: boolean;
    /**
     * 指令按钮可用，点击按钮后直接自动发送 data
     * @note 支持版本 8983
     * @default false
     */
    enter?: boolean;
    /**
     * 指令按钮相关的锚点字段
     * @description 本字段仅在指令按钮下有效，设置后会忽略 `action.enter` 配置
     * @description 设置为 `1` 时，点击按钮自动唤起手机 QQ 选图器，其他值暂无效果
     * @note 仅支持手机端版本 `8983+` 的单聊场景，桌面端不支持
     */
    anchor?: number;
    /**
     * 可操作点击的次数
     * @deprecated
     */
    click_limit?: number;
    /**
     * 弹出子频道选择器
     * @default false
     * @deprecated 指令按钮可用
     */
    at_bot_show_channel_list?: boolean;
    /**
     * 客户端不支持本 action 的时候，弹出的 Toast 文案
     */
    unsupport_tips: string;
  };
}

/**
 * Keyboard 对象
 * @description 在 Markdown 消息的基础上，支持消息最底部挂载按钮。
 * @see https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/trans/msg-btn.html#数据结构与协议
 */
interface Keyboard {
  /**
   * 模板 ID
   * @note 与 `content` 二选一使用
   */
  id?: string;
  /**
   * 按钮内容
   * @note 与 `id` 二选一使用
   */
  content?: {
    rows: {
      buttons: KeyboardButton[];
    }[];
  };
}

// 属性	类型	说明
// file_uuid	string	文件 ID
// file_info	string	文件信息，用于发消息接口的 media 字段使用
// ttl	int	有效期，表示剩余多少秒到期，到期后 file_info 失效，当等于 0 时，表示可长期使用
// id	string	发送消息的唯一ID，当srv_send_msg设置为true时返回

/**
 * 富媒体消息
 * @see https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/send-receive/rich-media.html
 */
export interface RichMedia {
  /**
   * 文件 ID
   */
  file_uuid: string;
  /**
   * 文件信息，用于发消息接口的 media 字段使用
   */
  file_info: string;
  /**
   * 有效期，表示剩余多少秒到期，到期后 file_info 失效，当等于 0 时，表示可长期使用
   */
  ttl: number;
  /**
   * 发送消息的唯一 ID，当 srv_send_msg 设置为 `true` 时返回
   */
  id?: string;
}

export interface PrepareRichMediaRequest {
  /**
   * @description 媒体类型
   * - `1` 图片
   * - `2` 视频
   * - `3` 语音
   * - `4` 文件（暂不开放）
   * @description 资源格式要求
   * - 图片: `png/jpg`
   * - 视频: `mp4`
   * - 语音: `silk`
   */
  file_type: 1 | 2 | 3 | 4;
  /**
   * 需要发送媒体资源的 URL
   */
  url: string;
  /**
   * 设置 `true` 会直接发送消息到目标端，且会占用主动消息频次
   */
  srv_send_msg: boolean;
  /**
   * @deprecated 暂未支持
   */
  file_data?: unknown;
}

/**
 * Ark 对象
 * @see https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/ark.html#数据结构与协议
 */
export interface Ark {
  /**
   * Ark 模版 ID
   * @description 官方提供了默认可用的模板
   * @see [23 链接+文本列表模板](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/template/template_23.html)
   * @see [24 文本+缩略图模板](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/template/template_24.html)
   * @see [37 大图模板](https://bot.q.qq.com/wiki/develop/api-v2/server-inter/message/type/template/template_37.html)
   */
  template_id: number;
  /**
   * 模版内变量与填充值的 KV 映射
   */
  kv: Array<{
    key: string;
    value?: string;
    obj?: {
      obj_kv: Ark["kv"];
    }[];
  }>;
}

export interface SendMessageRequest {
  /**
   * 文本内容
   */
  content?: string;
  /**
   * @description
   * - `0` 文本
   * - `2` Markdown
   * - `3` Ark 消息
   * - `4` Embed
   * - `7` Media 富媒体
   */
  msg_type: 0 | 2 | 3 | 4 | 7;
  /**
   * Markdown 对象
   */
  markdown?: Markdown;
  /**
   * Keyboard 对象
   */
  keyboard?: Keyboard;
  /**
   * 富媒体群聊的 file_info
   */
  media?: RichMedia;
  /**
   * Ark 对象
   */
  ark?: Ark;
  /**
   * 消息引用
   * @deprecated 暂未支持
   */
  message_reference?: unknown;
  /**
   * 前置收到的事件 ID，用于发送被动消息，支持事件：`INTERACTION_CREATE` `GROUP_ADD_ROBOT`
   */
  event_id?: string;
  /**
   * 前置收到的用户发送过来的消息 ID，用于发送被动消息（回复）
   */
  msg_id?: string;
  /**
   * 回复消息的序号，与 `msg_id` 联合使用，避免相同消息 ID 回复重复发送，相同的 `msg_id` + `msg_seq` 重复发送会失败。
   * @default 1
   */
  msg_seq?: number;
}

export interface SendMessageResponse {
  id: string;
  timestamp: number;
}
