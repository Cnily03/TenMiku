export namespace EVENT_TYPE {
  /**
   * 单聊事件
   */
  export enum C2C {
    /**
     * C2C 消息事件
     */
    MESSAGE_CREATE = "C2C_MESSAGE_CREATE",
    /**
     * C2C 添加好友
     */
    FRIEND_ADD = "FRIEND_ADD",
    /**
     * C2C 删除好友
     */
    FRIEND_DEL = "FRIEND_DEL",
    /**
     * C2C 关闭消息推送
     */
    MESSAGE_REJECT = "C2C_MESSAGE_REJECT",
    /**
     * C2C 打开消息推送
     */
    MESSAGE_RECEIVE = "C2C_MESSAGE_RECEIVE",
  }

  /**
   * 群事件
   */
  export enum GROUP {
    /**
     * 群消息事件 AT 事件
     */
    AT_MESSAGE_CREATE = "GROUP_AT_MESSAGE_CREATE",
    /**
     * 群添加机器人
     */
    ADD_ROBOT = "GROUP_ADD_ROBOT",
    /**
     * 群移除机器人
     */
    DEL_ROBOT = "GROUP_DEL_ROBOT",
    /**
     * 群打开消息推送
     */
    MSG_RECEIVE = "GROUP_MSG_RECEIVE",
    /**
     * 群关闭消息推送
     */
    MSG_REJECT = "GROUP_MSG_REJECT",
    /**
     * 订阅消息授权状态变更
     */
    SUBSCRIBE_MESSAGE_STATUS = "SUBSCRIBE_MESSAGE_STATUS",
  }

  /**
   * 频道事件
   */
  export enum CHANNEL {
    /**
     * 频道内发送的所有消息的事件
     */
    MESSAGE_CREATE = "MESSAGE_CREATE",
    /**
     * 撤回频道消息的事件
     */
    MESSAGE_DELETE = "MESSAGE_DELETE",
    /**
     * 频道内 AT 机器人的消息的事件
     */
    AT_MESSAGE_CREATE = "AT_MESSAGE_CREATE",
    /**
     * 撤回频道消息公域事件
     */
    PUBLIC_MESSAGE_DELETE = "PUBLIC_MESSAGE_DELETE",
    /**
     * 私信创建事件
     */
    DIRECT_MESSAGE_CREATE = "DIRECT_MESSAGE_CREATE",
    /**
     * 频道私信删除事件
     */
    DIRECT_MESSAGE_DELETE = "DIRECT_MESSAGE_DELETE",
    /**
     * 为消息添加表情表态
     */
    MESSAGE_REACTION_ADD = "MESSAGE_REACTION_ADD",
    /**
     * 为消息删除表情表态
     */
    MESSAGE_REACTION_REMOVE = "MESSAGE_REACTION_REMOVE",
    /**
     * 频道内消息审核通过
     */
    MESSAGE_AUDIT_PASS = "MESSAGE_AUDIT_PASS",
    /**
     * 频道内消息审核不通过
     */
    MESSAGE_AUDIT_REJECT = "MESSAGE_AUDIT_REJECT",
    /**
     * 当用户创建主题时
     */
    FORUM_THREAD_CREATE = "FORUM_THREAD_CREATE",
    /**
     * 当用户删除主题时
     */
    FORUM_THREAD_DELETE = "FORUM_THREAD_DELETE",
    /**
     * 当用户更新主题时
     */
    FORUM_THREAD_UPDATE = "FORUM_THREAD_UPDATE",
    /**
     * 当用户创建帖子时
     */
    FORUM_POST_CREATE = "FORUM_POST_CREATE",
    /**
     * 当用户回复评论时
     */
    FORUM_REPLY_CREATE = "FORUM_REPLY_CREATE",
    /**
     * 当用户删除帖子时
     */
    FORUM_POST_DELETE = "FORUM_POST_DELETE",
    /**
     * 当用户回复评论时
     */
    FORUM_REPLY_DELETE = "FORUM_REPLY_DELETE",
    /**
     * 公域论坛事件：用户创建主题
     */
    OPEN_FORUM_THREAD_CREATE = "OPEN_FORUM_THREAD_CREATE",
    /**
     * 公域论坛事件：用户创建帖子
     */
    OPEN_FORUM_POST_CREATE = "OPEN_FORUM_POST_CREATE",
    /**
     * 公域论坛事件：用户回复帖子
     */
    OPEN_FORUM_REPLY_CREATE = "OPEN_FORUM_REPLY_CREATE",
    /**
     * 公域论坛事件：用户更新主题
     */
    OPEN_FORUM_THREAD_UPDATE = "OPEN_FORUM_THREAD_UPDATE",
    /**
     * 公域论坛事件：用户删除帖子
     */
    OPEN_FORUM_POST_DELETE = "OPEN_FORUM_POST_DELETE",
    /**
     * 公域论坛事件：用户回复被删除
     */
    OPEN_FORUM_REPLY_DELETE = "OPEN_FORUM_REPLY_DELETE",
    /**
     * 公域论坛事件：用户删除主题
     */
    OPEN_FORUM_THREAD_DELETE = "OPEN_FORUM_THREAD_DELETE",
    /**
     * 频道创建事件
     */
    GUILD_CREATE = "GUILD_CREATE",
    /**
     * 频道信息变更事件
     */
    GUILD_UPDATE = "GUILD_UPDATE",
    /**
     * 频道删除事件
     */
    GUILD_DELETE = "GUILD_DELETE",
    /**
     * 子频道创建事件
     */
    CHANNEL_CREATE = "CHANNEL_CREATE",
    /**
     * 子频道修改事件
     */
    CHANNEL_UPDATE = "CHANNEL_UPDATE",
    /**
     * 子频道删除事件
     */
    CHANNEL_DELETE = "CHANNEL_DELETE",
    /**
     * 新成员加入频道事件
     */
    GUILD_MEMBER_ADD = "GUILD_MEMBER_ADD",
    /**
     * 频道成员离开频道事件
     */
    GUILD_MEMBER_REMOVE = "GUILD_MEMBER_REMOVE",
    /**
     * 频道成员信息更新
     */
    GUILD_MEMBER_UPDATE = "GUILD_MEMBER_UPDATE",
    /**
     * 音频开始播放事件
     */
    AUDIO_START = "AUDIO_START",
    /**
     * 音频播放结束事件
     */
    AUDIO_FINISH = "AUDIO_FINISH",
    /**
     * 机器人上麦事件
     */
    AUDIO_ON_MIC = "AUDIO_ON_MIC",
    /**
     * 机器人下麦事件
     */
    AUDIO_OFF_MIC = "AUDIO_OFF_MIC",
  }

  /**
   * 互动事件
   */
  export enum INTERACT {
    /**
     * 创建互动事件
     */
    INTERACTION_CREATE = "INTERACTION_CREATE",
  }
}

export type EventType = EVENT_TYPE.C2C | EVENT_TYPE.GROUP | EVENT_TYPE.CHANNEL | EVENT_TYPE.INTERACT;
