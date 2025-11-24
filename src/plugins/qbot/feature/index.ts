import { sha256 } from "@noble/hashes/sha2.js";
import { calcSign } from "@plugins/qbot/mw/verify";
import ky, { HTTPError } from "ky";
import { z } from "zod";
import type TenMiku from "@/index";
import {
  isSupportRegion,
  type MusicDifficultyItem,
  type MusicListItem,
  type ServerRegion,
  SUPPORT_REGIONS,
} from "@/utils";
import type QbotPlugin from "..";
import type { UserPreferences } from "..";
import type { QBotApi } from "../api";
import type { Ark, SendMessageRequest } from "../api/types";
import { type QBotEventEmitter, whenType } from "../event/emitter";
import { EVENT_TYPE, type EventPayload, type OpCode } from "../event/types";
import CommandHelper from "./cmd";

const VerifyRequestSchema = z.object({
  plain_token: z.string(),
  event_ts: z.string(),
});

interface VerifyResponse {
  plain_token: string;
  signature: string;
}

function capitalize(s: string) {
  return s.charAt(0)!.toUpperCase() + s.slice(1);
}

// from level, color to difficulty name
function parseDifficulty(s: string, items: MusicDifficultyItem[] = []) {
  s = s.trim().toLowerCase();
  const map: Record<string, (string | RegExp)[]> = {
    easy: ["ez", /^ea/, "绿", "简单", "容易", "简易", "green", "简", "易"],
    normal: ["n", /^no/, "nm", "蓝", "普通", "普", "blue"],
    hard: ["h", /^ha/, "hd", "黄", "困难", "难", "yellow"],
    expert: ["e", /^ex/, "exp", "红", "专家", "red"],
    master: ["m", /^ma/, "mst", "紫", "大师", "master", "秘", "师"],
    append: ["a", /^ap/, "apd", "彩", "多指", "colorful", "color", "附"],
  };
  if (items.length > 0) {
    for (const item of items) {
      const d = item.musicDifficulty.toLowerCase();
      const lv = String(item.playLevel);
      if (!Object.hasOwn(map, d)) {
        Object.defineProperty(map, d, { value: [] });
      }
      map[d]?.push(lv);
      map[d]?.push(d);
    }
  }
  for (const [key, values] of Object.entries(map)) {
    if (s === key) return key;
    for (const v of values) {
      if (typeof v === "string" && s === v) return key;
      if (v instanceof RegExp && v.test(s)) return key;
    }
  }
  return s;
}

const SERVER_REGION_TRANSLATION: Record<ServerRegion, string> = {
  cn: "国服",
  jp: "日服",
};

function openuid<T extends EventPayload<OpCode.Dispatch>>(event: T) {
  if (event.t === EVENT_TYPE.C2C.MESSAGE_CREATE) {
    return event.d.author.user_openid;
  } else if (event.t === EVENT_TYPE.GROUP.AT_MESSAGE_CREATE) {
    return event.d.author.member_openid;
  }
  return "";
}

function opengid<T extends EventPayload<OpCode.Dispatch>>(event: T) {
  if (event.t === EVENT_TYPE.GROUP.AT_MESSAGE_CREATE) {
    return event.d.group_openid;
  }
  return "";
}

// biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
type WithVoid<T extends (...args: any[]) => any> = T extends (...args: infer P) => infer R
  ? (...args: P) => R & { void(): R extends Promise<infer _> ? Promise<void> : void }
  : never;

// biome-ignore lint/suspicious/noExplicitAny: any is used for generic inputs
function withVoid<T extends (...args: any[]) => any>(fn: T): WithVoid<T> {
  return ((...args: unknown[]) => {
    const res = fn(...args);
    // biome-ignore lint/suspicious/noExplicitAny: bypass complex type checking
    (res as any).void = () => {
      if (res instanceof Promise) {
        return res.then(() => {});
      }
    };
    return res;
  }) as WithVoid<T>;
}

function _sendPassiveMessage<T extends EventPayload<OpCode.Dispatch>>(
  this: QBotApi,
  event: T,
  type: "content" | "markdown" | "ark" | "embed" | "media",
  o: string | Partial<SendMessageRequest>,
  newLineAfterAt = true
) {
  const map = {
    content: 0,
    markdown: 2,
    ark: 3,
    embed: 4,
    media: 7,
  } as const;
  const msg_type = map[type];
  const request: SendMessageRequest = {
    event_id: event.id,
    msg_id: event.d.id,
    ...(typeof o === "string" ? { content: o } : o),
    msg_type,
  };
  if (event.t === EVENT_TYPE.C2C.MESSAGE_CREATE) {
    return this.sendC2CMessage(openuid(event), request);
  } else {
    if (request.content && newLineAfterAt) request.content = `\n${request.content}`;
    return this.sendGroupMessage(opengid(event), request);
  }
}

function _prepareRichMedia<T extends EventPayload<OpCode.Dispatch>>(
  this: QBotApi,
  event: T,
  type: "image" | "video" | "audio" | "file",
  url: string,
  srv_send_msg = false
) {
  const map = {
    image: 1,
    video: 2,
    audio: 3,
    file: 4,
  } as const;
  const file_type = map[type];
  const request = {
    file_type,
    url: url,
    srv_send_msg,
  };
  if (event.t === EVENT_TYPE.C2C.MESSAGE_CREATE) {
    return this.prepareC2CRichMedia(openuid(event), request);
  } else {
    return this.prepareGroupRichMedia(opengid(event), request);
  }
}

function filterSearchResults<T extends { score: number }>(
  results: T[],
  absReduce = 0.25,
  reduceRate = 0.4,
  maxRateReduce = 0.25
) {
  if (results.length === 0) return results;
  const scores = results.map((r) => r.score);
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  if (max <= absReduce) return [];
  // 找到一个点，两边到这个点的距离的标准差差最小
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  // 离中位数最近的点，从小到大排序
  const sortedScores = [...scores].sort((a, b) => Math.abs(a - mean) - Math.abs(b - mean));
  // 对每个点，求两边到这个点的距离的标准差的差
  let found = {
    score: 0,
    d: Infinity,
  };
  for (const score of sortedScores) {
    let up = 0;
    let down = 0;
    for (const s of scores) {
      if (s > score) up += (s - score) ** 2;
      else down += (s - score) ** 2;
    }
    const sigma = Math.abs(up - down);
    if (sigma < found.d) {
      found = {
        score,
        d: sigma,
      };
    } else {
      break;
    }
  }
  const opt = found.score; // 找到了筛选基线
  // 可变降低值 = (基线 - 最低分数) * 降低比例
  const rateReduce = (opt - min) * reduceRate;
  // 筛选基线 - 绝对降低值 - 可变降低值
  const threshold = opt - absReduce - Math.min(rateReduce, maxRateReduce);
  if (threshold < 0) return results;
  return results.filter((r) => r.score >= threshold);
}

export function registerEmitter(emitter: QBotEventEmitter, qbot: QbotPlugin, tenmiku: TenMiku) {
  const logger = qbot.logger.head(qbot.api.sandbox ? { sandbox: qbot.api.sandbox } : {});
  const calcHashKey = () =>
    sha256(new TextEncoder().encode(qbot.api.getApiEnv().appSecret))
      .toBase64()
      .replace(/\//g, "_")
      .replace(/\+/g, "-")
      .replace(/=+$/, "");

  const sendPassiveMsg = withVoid(_sendPassiveMessage.bind(qbot.api));
  const prepareRichMedia = withVoid(_prepareRichMedia.bind(qbot.api));

  interface CmdEnv {
    hashKey: string;
    preferences: UserPreferences;
    event: EventPayload<OpCode.Dispatch, EVENT_TYPE.C2C.MESSAGE_CREATE | EVENT_TYPE.GROUP.AT_MESSAGE_CREATE>;
  }

  const cmd = new CommandHelper<CmdEnv>("/");

  cmd.handle("server", async (ctx) => {
    const preferences = ctx.env.preferences;
    const data = ctx.env.event;

    if (!qbot.databaseAvailable()) return sendPassiveMsg(data, "content", "该功能暂不可用").void();

    const help = () => {
      return ["指令格式: /server 地区", `地区 可选值: ${SUPPORT_REGIONS.join(", ")}`].join("\n");
    };

    if (ctx.restArgs.at(0) === undefined) {
      const region = preferences.serverRegion;
      return await sendPassiveMsg(
        data,
        "content",
        [`当前服务区偏好: ${SERVER_REGION_TRANSLATION[region]} (${region})`, help()].join("\n")
      ).void();
    }
    const region = ctx.restArgs[0]!.trim().toLowerCase();
    if (isSupportRegion(region)) {
      await qbot.storePreferences(openuid(data), { serverRegion: region });
      return await sendPassiveMsg(
        data,
        "content",
        `已将默认服务区偏好设置为: ${SERVER_REGION_TRANSLATION[region]} (${region})`
      ).void();
    }
    return await sendPassiveMsg(data, "content", help()).void();
  });

  cmd.handle("谱面", async (ctx) => {
    const preferences = ctx.env.preferences;
    const event = ctx.env.event;
    const region = preferences.serverRegion;

    const [difficulty, musicName] = ctx.restArgs;

    const help = () => {
      return ["指令格式: /谱面 难度 歌曲名", "难度和歌曲名支持模糊匹配"].join("\n");
    };

    if (!difficulty || !musicName) {
      return await sendPassiveMsg(event, "content", help()).void();
    }

    const searchResult = filterSearchResults(await tenmiku.utils.at(region).search(musicName));
    if (searchResult.length === 0) {
      return await sendPassiveMsg(event, "content", `未找到歌曲: ${musicName}`).void();
    }

    // same scores as the top
    const topMusicResults: MusicListItem[] = [];
    for (const result of searchResult) {
      if (result.score === searchResult[0]!.score) {
        topMusicResults.push(result.item);
      } else {
        break;
      }
    }
    const topdifficultyItems = await tenmiku.utils
      .at(region)
      .getDifficultiesByMusicId(topMusicResults.map((m) => m.id));
    let _j = -1;
    let _i = topdifficultyItems.findIndex((it) => {
      const dname = parseDifficulty(difficulty, it);
      return it.some((d, i) => {
        _j = i;
        return d.musicDifficulty.toLowerCase() === dname;
      });
    });
    if (_i < 0) {
      _i = 0;
      _j = -1;
    }

    const music = searchResult[_i]!.item;
    const info = music.infos?.at(0) ?? music;
    const difficultyItem = topdifficultyItems[_i]!.at(_j);
    if (!difficultyItem) {
      return await sendPassiveMsg(event, "content", `未找到歌曲 ${info.title} 的难度: ${difficulty}`).void();
    }

    const imageLink = await tenmiku.utils.at(region).getMusicChartById(music.id, difficultyItem.musicDifficulty);
    logger.debug(
      `Sending music chart for ${info.title} - Lv. ${difficultyItem.playLevel} ${difficultyItem.musicDifficulty}`
    );

    logger.debug(`Uploading music chart for ${music.title} - ${difficultyItem.musicDifficulty}: ${imageLink}`);
    const uploadResp = await ky
      .post(`http://silkup.cnily.top:21747/v1/file/store/${ctx.env.hashKey}`, {
        json: {
          url: imageLink,
        },
        timeout: 30 * 1000,
        throwHttpErrors: false,
      })
      .json<{ name: string }>();

    if (!uploadResp.name) {
      return logger.error(
        `Failed to upload music chart for ${info.title} - ${difficultyItem.musicDifficulty}: ${imageLink}`
      );
    }
    const content = [
      `歌曲: ${info.title}`,
      `难度: Lv. ${difficultyItem.playLevel} ${capitalize(difficultyItem.musicDifficulty)}`,
      `物量: ${difficultyItem.totalNoteCount} nts`,
      `作词: ${info.lyricist}`,
      `作曲: ${info.composer}`,
      `编曲: ${info.arranger}`,
    ].join("\n");

    try {
      const media = await prepareRichMedia(
        event,
        "image",
        `http://silkup.cnily.top:21747/v1/file/store/${ctx.env.hashKey}?name=${encodeURIComponent(uploadResp.name)}`
      );
      await sendPassiveMsg(event, "media", { content, media }).void();
    } catch (e) {
      if (e instanceof HTTPError) {
        logger
          .head({
            openuid: openuid(event),
            opengid: opengid(event),
            title: info.title,
            info: info.title,
            difficulty: difficultyItem.musicDifficulty,
          })
          .error(
            `Failed to send music chart: ${e.response.status} ${e.response.statusText}: ${await e.response.text().catch(() => "<response body>")}`
          );
      }
      await sendPassiveMsg(event, "content", "处理时遇到错误，请稍后重试", false).void();
      throw e;
    }
  });

  cmd.handle("查曲", async (ctx) => {
    const preferences = ctx.env.preferences;
    const event = ctx.env.event;
    const region = preferences.serverRegion;

    const musicName = ctx.rest.trim();
    if (!musicName) {
      return await sendPassiveMsg(event, "content", "指令格式: /查曲 歌曲名").void();
    }

    const searchResult = filterSearchResults(await tenmiku.utils.at(region).search(musicName));
    if (searchResult.length === 0) {
      return await sendPassiveMsg(event, "content", `未找到歌曲: ${musicName}`).void();
    }

    const music = searchResult[0]!.item;
    const difficultyItems = await tenmiku.utils.at(region).getDifficultiesByMusicId(music.id);
    const vocals = (await tenmiku.utils.at(region).getAllMusicVocals()).filter((v) => v.musicId === music.id);
    const [gameCharacters, outsideCharacters] = await Promise.all([
      tenmiku.utils.at(region).getGameCharacters(),
      tenmiku.utils.at(region).getOutsideCharacters(),
    ]);

    const unique = (arr: string[]) => Array.from(new Set(arr));
    const info = music.infos?.at(0) ?? music;

    const promptText = info.title;
    const descText = `歌曲详情 - ${info.title}`;
    const titleText = unique([music.title, info.title]).join("\n");
    const difficultyText = difficultyItems
      .map((d) => `Lv. ${d.playLevel} / ${capitalize(d.musicDifficulty)} / ${d.totalNoteCount} nts`)
      .join("\n");
    const vocalsText = vocals
      .map((v) => {
        const i18n = {
          original_song: "虚拟歌手 ver.",
          sekai: "「世界」ver.",
          virtual_singer: "虚拟歌手 ver.",
          another_vocal: "Another Vocal ver.",
          instrumental: "纯音乐 ver.",
          april_fool_2022: "愚人节 ver.",
        };
        const ver =
          i18n[v.musicVocalType] ||
          v.caption.replace(/(.\b)ver.?$/i, (_, p1: string) => `${p1.replace(/\s$/, "")} ver.`);
        const charNames = tenmiku.utils
          .at(region)
          .getVocalCharacterItemsSpecified(v, { gameCharacters, outsideCharacters })
          .map((c) => {
            if (c.name) return c.name;
            else return [c.firstName, c.givenName].filter(Boolean).join(" ");
          });
        return `${ver} ★ ${charNames.join("、")}`;
      })
      .join("\n");
    const creditText = [`作词: ${info.lyricist}`, `作曲: ${info.composer}`, `编曲: ${info.arranger}`].join("\n");

    const ark: Ark = {
      template_id: 23,
      kv: [
        { key: "#DESC#", value: descText },
        { key: "#PROMPT#", value: promptText },
        {
          key: "#LIST#",
          obj: [
            { obj_kv: [{ key: "desc", value: titleText }] },
            { obj_kv: [{ key: "desc", value: difficultyText }] },
            { obj_kv: [{ key: "desc", value: vocalsText }] },
            { obj_kv: [{ key: "desc", value: creditText }] },
          ],
        },
      ],
    };

    logger.debug(`Sending music details for ${music.title}`);
    await sendPassiveMsg(event, "ark", { ark }).void();
  });

  cmd.handle("听曲", async (ctx) => {
    const preferences = ctx.env.preferences;
    const event = ctx.env.event;
    const region = preferences.serverRegion;

    const musicName = ctx.rest.trim();
    if (!musicName) {
      return await sendPassiveMsg(event, "content", "指令格式: /听曲 歌曲名").void();
    }

    const searchResult = filterSearchResults(await tenmiku.utils.at(region).search(musicName));
    if (searchResult.length === 0) {
      return await sendPassiveMsg(event, "content", `未找到歌曲: ${musicName}`).void();
    }

    const music = searchResult[0]!.item;
    const vocals = (await tenmiku.utils.at(region).getAllMusicVocals()).filter((v) => v.musicId === music.id);
    const sekai = vocals.find((v) => v.musicVocalType === "sekai");
    const item = sekai || vocals[0]!;
    const bn = item.assetbundleName;
    const mp3Url = tenmiku.utils.at(region).getMusicMp3Url(bn, false);

    logger.debug(`Generating music silk for ${music.title} - ${item.musicVocalType}: ${mp3Url}`);
    const uploadResp = await ky
      .post(`http://silkup.cnily.top:21747/v1/silk/encode/${ctx.env.hashKey}`, {
        json: {
          url: mp3Url,
          offset: music.fillerSec,
        },
        timeout: 30 * 1000,
        throwHttpErrors: false,
      })
      .json<{ name: string }>();

    if (!uploadResp.name) {
      return logger.error(`Failed to generate music silk for ${music.title} - ${item.musicVocalType}: ${mp3Url}`);
    }

    logger.debug(`Sending music silk for ${music.title} - ${item.musicVocalType}`);
    try {
      const media = await prepareRichMedia(
        event,
        "audio",
        `http://silkup.cnily.top:21747/v1/silk/encode/${ctx.env.hashKey}?name=${encodeURIComponent(uploadResp.name)}`
      );
      await sendPassiveMsg(event, "media", { media }).void();
    } catch (e) {
      if (e instanceof HTTPError) {
        logger
          .head({
            openuid: openuid(event),
            opengid: opengid(event),
            title: music.title,
          })
          .error(
            `Failed to send music silk: ${e.response.status} ${e.response.statusText}: ${await e.response.text().catch(() => "<response body>")}`
          );
      }
      await sendPassiveMsg(event, "content", "处理时遇到错误，请稍后重试", false).void();
      throw e;
    }
  });

  // emitter.on("*", (data) => {
  //   console.log(data);
  // });

  emitter.on(
    "*:dispatch",
    whenType([EVENT_TYPE.C2C.MESSAGE_CREATE, EVENT_TYPE.GROUP.AT_MESSAGE_CREATE], async (data) => {
      logger.tail({ op: data.op, t: data.t, content: data.d.content }).debug("Received message event");
      const content = data.d.content.trim();
      const preferences = (await qbot.queryPreferences(openuid(data))) ?? {
        serverRegion: "cn",
      };
      const env: CmdEnv = {
        event: data,
        preferences,
        hashKey: calcHashKey(),
      };
      const executed = await cmd.runPrefix(content, env).catch((e) => {
        logger.error(`Failed to execute command: ${content}`);
        throw e;
      });
      if (executed) {
        logger.info(`Command executed: ${content}`);
      }
    })
  );

  emitter.handle("webhook:verifycallback", async (data, c, _next) => {
    const validPayload = VerifyRequestSchema.parse(data.d);
    const sig = calcSign(c, validPayload.event_ts, validPayload.plain_token);
    const res: VerifyResponse = {
      plain_token: validPayload.plain_token,
      signature: sig,
    };
    return c.json(res);
  });
}
