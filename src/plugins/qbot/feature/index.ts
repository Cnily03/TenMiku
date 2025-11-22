import { sha256 } from "@noble/hashes/sha2.js";
import { calcSign } from "@plugins/qbot/mw/verify";
import ky from "ky";
import { z } from "zod";
import type TenMiku from "@/index";
import type { MusicDifficultyItem, ServerRegion } from "@/utils";
import type QbotPlugin from "..";
import type { SendMessageRequest } from "../api/types";
import { type QBotEventEmitter, whenType } from "../event/emitter";
import { EVENT_TYPE } from "../event/types";

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
function parseDifficulty(s: string | number, items: MusicDifficultyItem[]): MusicDifficultyItem | undefined {
  s = String(s).trim().toLowerCase();
  if (/\d+/.test(s)) {
    const item = items.find((i) => i.playLevel === Number(s));
    if (item) return item;
  }
  if (/^(绿|蓝|黄|红|紫|彩)/.test(s)) s = s[0]!;
  s =
    {
      e: "easy",
      n: "normal",
      h: "hard",
      ex: "expert",
      m: "master",
      ap: "append",
      简: "easy",
      普: "normal",
      难: "hard",
      专: "expert",
      秘: "master",
      师: "master",
      附: "append",
      简单: "easy",
      普通: "normal",
      困难: "hard",
      专家: "expert",
      大师: "master",
      多指: "append",
      green: "easy",
      blue: "normal",
      yellow: "hard",
      red: "expert",
      purple: "master",
      color: "append",
      colorful: "append",
      绿: "easy",
      蓝: "normal",
      黄: "hard",
      红: "expert",
      紫: "master",
      彩: "append",
    }[s] || s;
  const item = items.find((i) => i.musicDifficulty.toLowerCase() === s);
  if (item) return item;
}

const SERVER_REGION_TRANSLATION: Record<ServerRegion, string> = {
  cn: "国服",
  jp: "日服",
};

export function registerEmitter(emitter: QBotEventEmitter, qbot: QbotPlugin, tenmiku: TenMiku) {
  const endpointKey = () =>
    sha256(new TextEncoder().encode(qbot.api.getApiEnv().appSecret))
      .toBase64()
      .replace(/\//g, "_")
      .replace(/\+/g, "-")
      .replace(/=+$/, "");

  // emitter.on("*", (data) => {
  //   console.log(data);
  // });

  emitter.on(
    "*:dispatch",
    whenType(EVENT_TYPE.GROUP.AT_MESSAGE_CREATE, async (data) => {
      const ENDPOINT_KEY = endpointKey();

      const reply = (msg: string, extra: Partial<SendMessageRequest> = {}) => {
        return qbot.api.sendGroupMessage(data.d.group_openid, {
          content: msg,
          msg_type: 0,
          event_id: data.id,
          msg_id: data.d.id,
          ...extra,
        });
      };

      const content = data.d.content.trim();
      if (!content.startsWith("/")) return;
      const match = `${content} `.match(/^\/([^\s]+)\s+(.*)$/);
      if (!match) return;
      const command = match[1] ?? "";
      const rest = match[2] ?? "";

      // commands
      const preferences = (await qbot.queryPreferences(data.d.group_openid)) ?? { serverRegion: "cn" };
      const sr = preferences.serverRegion;

      if (command === "server") {
        if (!qbot.databaseAvailable()) {
          await reply("该功能暂不可用");
          return;
        }
        const region = rest.trim().toLowerCase();
        if (["cn", "jp"].includes(region)) {
          await qbot.storePreferences(data.d.group_openid, { serverRegion: region as ServerRegion });
          await reply(`已将默认服务区偏好设置为: ${SERVER_REGION_TRANSLATION[region as ServerRegion]} (${region})`);
          return;
        }
        await reply(
          [
            `当前服务区偏好: ${SERVER_REGION_TRANSLATION[sr]} (${sr})`,
            "指令格式: /server 地区",
            "地区 可选值: cn, jp",
          ].join("\n")
        );
        return;
      } else if (command === "谱面") {
        const m = rest.match(/^([^\s]+)\s+(.*)$/);
        if (!m) {
          await reply("指令格式: /谱面 难度 歌曲名");
          return;
        }
        const difficulty = m[1]?.toLowerCase();
        const musicName = m[2];
        if (!difficulty || !musicName) {
          await reply("指令格式: /谱面 难度 歌曲名");
          return;
        }
        const searchResult = await tenmiku.utils.at(sr).search(musicName);
        if (searchResult.length === 0) {
          await reply(`未找到歌曲: ${musicName}`);
          return;
        }
        const music = searchResult[0]!.item;
        const diffItems = await tenmiku.utils.at(sr).getDifficultiesByMusicId(music.id);
        const diff = parseDifficulty(difficulty, diffItems);
        if (!diff) {
          await reply(`未找到歌曲 ${music.title} 的难度: ${difficulty}`);
          return;
        }
        const imageLink = await tenmiku.utils.at(sr).getMusicChartById(music.id, diff.musicDifficulty);
        console.log(`Send music chart for ${music.title} - Lv. ${diff.playLevel} ${diff.musicDifficulty}`);

        const uploadResp = await ky
          .post(`http://silkup.cnily.top:21747/v1/file/store/${ENDPOINT_KEY}`, {
            json: {
              url: imageLink,
            },
            timeout: 30 * 1000,
            throwHttpErrors: false,
          })
          .json<{ name: string }>();

        if (!uploadResp.name) {
          return console.log(
            `Failed to download music chart for ${music.title} - ${diff.musicDifficulty}: ${imageLink}`
          );
        }

        const media = await qbot.api.prepareGroupRichMedia(data.d.group_openid, {
          file_type: 1,
          url: `http://silkup.cnily.top:21747/v1/file/store/${ENDPOINT_KEY}?name=${encodeURIComponent(uploadResp.name)}`,
          srv_send_msg: false,
        });

        const msg = [
          `歌曲: ${music.title}`,
          `难度: Lv. ${diff.playLevel} ${capitalize(diff.musicDifficulty)}`,
          `作词: ${music.lyricist}`,
          `作曲: ${music.composer}`,
          `编曲: ${music.arranger}`,
        ].join("\n");

        await reply(`\n${msg}`, {
          msg_type: 7,
          media: media,
        });
        return;
      } else if (command === "查曲") {
        const musicName = rest.trim();
        if (musicName.length === 0) {
          await reply("指令格式: /查曲 歌曲名");
          return;
        }
        const searchResult = await tenmiku.utils.at(sr).search(musicName);
        if (searchResult.length === 0) {
          await reply(`未找到歌曲: ${musicName}`);
          return;
        }
        const music = searchResult[0]!.item;
        const diff = await tenmiku.utils.at(sr).getDifficultiesByMusicId(music.id);
        const vocals = (await tenmiku.utils.at(sr).getAllMusicVocals()).filter((v) => v.musicId === music.id);
        const [gameCharacters, outsideCharacters] = await Promise.all([
          tenmiku.utils.at(sr).getGameCharacters(),
          tenmiku.utils.at(sr).getOutsideCharacters(),
        ]);
        console.log(`Send music details for ${music.title}`);
        await reply("", {
          msg_type: 3,
          ark: {
            template_id: 23,
            kv: [
              {
                key: "#DESC#",
                value: `获取「${music.title}」的详细信息`,
              },
              {
                key: "#PROMPT#",
                value: music.title,
              },
              {
                key: "#LIST#",
                obj: [
                  {
                    obj_kv: [
                      {
                        key: "desc",
                        value: Array.from(new Set([music.title, music.infos?.map((info) => info.title)].flat())).join(
                          "\n"
                        ),
                      },
                    ],
                  },
                  {
                    obj_kv: [
                      {
                        key: "desc",
                        value: diff.map((d) => `Lv. ${d.playLevel} ${capitalize(d.musicDifficulty)}`).join("\n"),
                      },
                    ],
                  },
                  {
                    obj_kv: [
                      {
                        key: "desc",
                        value: vocals
                          .map((v) => {
                            const ver =
                              {
                                original_song: "虚拟歌手ver.",
                                sekai: "「世界」ver.",
                                another_vocal: "Another Vocal ver.",
                              }[v.musicVocalType] || v.caption;
                            const name = tenmiku.utils
                              .at(sr)
                              .getVocalCharacterItemsSpecified(v, { gameCharacters, outsideCharacters })
                              .map((c) => {
                                if (c.name) return c.name;
                                else return [c.firstName, c.givenName].filter(Boolean).join(" ");
                              })
                              .join("、");
                            return `【${ver}】 ${name}`;
                          })
                          .join("\n"),
                      },
                    ],
                  },
                  {
                    obj_kv: [
                      {
                        key: "desc",
                        value: [`作词: ${music.lyricist}`, `作曲: ${music.composer}`, `编曲: ${music.arranger}`].join(
                          "\n"
                        ),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        });
      } else if (command === "听曲") {
        const musicName = rest.trim();
        if (musicName.length === 0) {
          await reply("指令格式: /听曲 歌曲名");
          return;
        }
        const searchResult = await tenmiku.utils.at(sr).search(musicName);
        if (searchResult.length === 0) {
          await reply(`未找到歌曲: ${musicName}`);
          return;
        }
        const music = searchResult[0]!.item;
        const vocals = (await tenmiku.utils.at(sr).getAllMusicVocals()).filter((v) => v.musicId === music.id);
        const sekai = vocals.find((v) => v.musicVocalType === "sekai");
        const item = sekai || vocals[0]!;
        const bn = item.assetbundleName;
        const mp3Url = tenmiku.utils.at(sr).getMusicMp3Url(bn, false);

        const uploadResp = await ky
          .post(`http://silkup.cnily.top:21747/v1/silk/encode/${ENDPOINT_KEY}`, {
            json: {
              url: mp3Url,
              offset: music.fillerSec,
            },
            timeout: 30 * 1000,
            throwHttpErrors: false,
          })
          .json<{ name: string }>();

        if (!uploadResp.name) {
          return console.log(`Failed to generate music silk for ${music.title} - ${item.musicVocalType}: ${mp3Url}`);
        }

        console.log(`Upload and send music silk for ${music.title} - ${item.musicVocalType}`);
        const media = await qbot.api.prepareGroupRichMedia(data.d.group_openid, {
          file_type: 3,
          url: `http://silkup.cnily.top:21747/v1/silk/encode/${ENDPOINT_KEY}?name=${encodeURIComponent(uploadResp.name)}`,
          srv_send_msg: false,
        });
        await reply("", {
          msg_type: 7,
          media: media,
        });
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
