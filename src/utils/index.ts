import api from "@/core/_api";
import { Cache } from "@/core/net/cache";
import { fuzzyMatchMixed } from "./search";
import "@/extend";

interface MusicListItem {
  id: number;
  seq: number;
  releaseConditionId: number;
  categories: { musicCategoryName: string }[];
  title: string;
  pronunciation: string;
  creatorArtistId: number;
  lyricist: string;
  composer: string;
  arranger: string;
  dancerCount: number;
  selfDancerPosition: number;
  assetbundleName: string;
  publishedAt: number;
  releasedAt: number;
  fillerSec: number;
  infos?: {
    title: string;
    creator: string;
    lyricist: string;
    composer: string;
    arranger: string;
  }[];
  musicCollaborationId: number;
  isNewlyWrittenMusic: boolean;
  isFullLength: boolean;
}

export const MUSIC_DIFFICULTIES = ["easy", "normal", "hard", "expert", "master", "append"] as const;
export type MusicDifficulty = (typeof MUSIC_DIFFICULTIES)[number];

interface MusicDifficultyItem {
  id: number;
  musicId: number;
  musicDifficulty: MusicDifficulty;
  playLevel: number;
  releaseConditionId: number;
  totalNoteCount: number;
}

export interface TenMikuUtilsOptions {
  cache?: Cache;
}

interface FuzzySearchResult {
  item: MusicListItem;
  score: number;
  input: string;
  target: string;
  ranges: {
    input: Array<[number, number]>;
    target: Array<[number, number]>;
  };
}

export class TenMikuUtils {
  protected cache: Cache;
  constructor(options?: TenMikuUtilsOptions) {
    const opts: Required<TenMikuUtilsOptions> = {
      cache: options?.cache ?? new Cache(),
    };
    this.cache = opts.cache;
  }

  async getMusicLists() {
    const cacheKey = this.cache.at("musicLists");
    let lists = (await cacheKey.get())?.parseJSON<MusicListItem[]>();
    if (lists) return lists;
    lists = await api.get("https://sekai-world.github.io/sekai-master-db-diff/musics.json").json<MusicListItem[]>();
    await cacheKey.set(JSON.stringify(lists));
    return lists;
  }

  async searchFromLists(keyword: string, lists: MusicListItem[], limit = 10, offset = 0) {
    const scores: FuzzySearchResult[] = [];
    for (const item of lists) {
      const keywords = [item.title, ...(item.infos?.map((info) => info.title) ?? []), item.pronunciation];
      let maxM: ReturnType<typeof fuzzyMatchMixed> | null = null;
      for (const kw of keywords) {
        const m = fuzzyMatchMixed(keyword, kw);
        if (maxM === null || m.score > (maxM?.score ?? 0)) maxM = m;
      }
      scores.push({
        item,
        score: maxM?.score ?? 0,
        input: maxM!.input,
        target: maxM!.target,
        ranges: maxM!.ranges,
      });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(offset, offset + limit);
  }

  async getAllDifficulties() {
    const cacheKey = this.cache.at("musicDifficulties");
    let difficulties = (await cacheKey.get())?.parseJSON<MusicDifficultyItem[]>();
    if (difficulties) return difficulties;
    difficulties = await api
      .get("https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json")
      .json<MusicDifficultyItem[]>();
    await cacheKey.set(JSON.stringify(difficulties));
    return difficulties;
  }

  async getDifficultiesByMusicId(musicId: number) {
    const allDifficulties = await this.getAllDifficulties();
    return allDifficulties.filter((diff) => diff.musicId === musicId);
  }

  async getMusicChartById(musicId: number, difficulty: MusicDifficulty) {
    const musicIdStr = musicId.toString().padStart(4, "0");
    const difficulties = await this.getDifficultiesByMusicId(musicId);
    const difficultyNames = difficulties.map((diff) => diff.musicDifficulty);
    if (!difficultyNames.includes(difficulty)) {
      throw new Error(`Music ID ${musicId} does not have difficulty ${difficulty}`);
    }
    const url = `https://storage.sekai.best/sekai-music-charts/jp/${musicIdStr}/${difficulty}.png`;
    return url;
  }
}
