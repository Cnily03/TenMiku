import http from "@/core/http";
import { Cache } from "@/core/net/cache";
import { fuzzyMatchMixed } from "./search";
import "@/extend";

export interface MusicListItem {
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

export interface MusicVocalItem {
  id: number;
  musicId: number;
  musicVocalType: "original_song" | "sekai" | "another_vocal";
  seq: number;
  releaseConditionId: number;
  caption: string;
  characters: {
    id: number;
    musicId: number;
    musicVocalId: number;
    characterType: "game_character" | "outside_character";
    characterId: number;
    seq: number;
  }[];
  assetbundleName: string;
  archivePublishedAt: number;
}

export interface GameCharacterItem {
  id: number;
  seq: number;
  resourceId: number;
  firstName: string;
  givenName: string;
  firstNameRuby: string;
  givenNameRuby: string;
  firstNameEnglish: string;
  givenNameEnglish: string;
  gender: "female" | "male";
  height: number;
  live2dHeightAdjustment: number;
  figure: string;
  breastSize: "s" | "m" | "l" | "none";
  modelName: string;
  unit: "idol" | "street" | "piapro" | "light_sound";
  supportUnitType: "none" | "unit";
}

export interface OutsideCharacterItem {
  id: number;
  seq: number;
  name: string;
}

export const MUSIC_DIFFICULTIES = ["easy", "normal", "hard", "expert", "master", "append"] as const;
export type MusicDifficulty = (typeof MUSIC_DIFFICULTIES)[number];

export interface MusicDifficultyItem {
  id: number;
  musicId: number;
  musicDifficulty: MusicDifficulty;
  playLevel: number;
  releaseConditionId: number;
  totalNoteCount: number;
}

export interface TenMikuUtilsOptions {
  cache?: Cache;
  /**
   * @default "jp"
   */
  defaultRegion?: ServerRegion;
}

export interface FuzzySearchResult {
  item: MusicListItem;
  score: number;
  input: string;
  target: string;
  ranges: {
    input: Array<[number, number]>;
    target: Array<[number, number]>;
  };
}

export const SUPPORT_REGIONS = ["jp", "cn"] as const;
export type ServerRegion = (typeof SUPPORT_REGIONS)[number];
export function isSupportRegion(region: string): region is ServerRegion {
  return SUPPORT_REGIONS.includes(region as ServerRegion);
}

const URL_TEMPLATE = {
  MUSIC_LIST: {
    jp: "https://sekai-world.github.io/sekai-master-db-diff/musics.json",
    cn: "https://sekai-world.github.io/sekai-master-db-cn-diff/musics.json",
  },
  DIFFICULTY_LIST: {
    jp: "https://sekai-world.github.io/sekai-master-db-diff/musicDifficulties.json",
    cn: "https://sekai-world.github.io/sekai-master-db-cn-diff/musicDifficulties.json",
  },
  MUSIC_VOCALS: {
    jp: "https://sekai-world.github.io/sekai-master-db-diff/musicVocals.json",
    cn: "https://sekai-world.github.io/sekai-master-db-cn-diff/musicVocals.json",
  },
  GAME_CHARACTERS: {
    jp: "https://sekai-world.github.io/sekai-master-db-diff/gameCharacters.json",
    cn: "https://sekai-world.github.io/sekai-master-db-cn-diff/gameCharacters.json",
  },
  OUTSIDE_CHARACTERS: {
    jp: "https://sekai-world.github.io/sekai-master-db-diff/outsideCharacters.json",
    cn: "https://sekai-world.github.io/sekai-master-db-cn-diff/outsideCharacters.json",
  },
  CHART_IMAGE: {
    jp: "https://storage.sekai.best/sekai-music-charts/jp/{musicIdPad}/{difficulty}.png",
    cn: "https://storage.sekai.best/sekai-music-charts/jp/{musicIdPad}/{difficulty}.png",
  },
  AUDIO_FILE: {
    jp: "https://storage.sekai.best/sekai-jp-assets/music/{width}/{assetbundleName}/{filename}.{ext}",
    cn: "https://storage.sekai.best/sekai-jp-assets/music/{width}/{assetbundleName}/{filename}.{ext}",
  },
};

export class TenMikuUtils {
  protected cache: Cache;
  region: ServerRegion;
  constructor(options?: TenMikuUtilsOptions) {
    const opts: Required<TenMikuUtilsOptions> = {
      cache: options?.cache ?? new Cache(),
      defaultRegion: options?.defaultRegion ?? "jp",
    };
    this.cache = opts.cache;
    this.region = opts.defaultRegion;
  }

  at(region: ServerRegion) {
    const u = new TenMikuUtils({ cache: this.cache, defaultRegion: region });
    return u;
  }

  t(tname: keyof typeof URL_TEMPLATE, map: Record<string, string | number> = {}) {
    return URL_TEMPLATE[tname][this.region].replace(/\{(\w+)\}/g, (_, key) => String(map[key]));
  }

  async getMusicLists() {
    const cacheKey = this.cache.at("musicLists").at(this.region);
    let lists = (await cacheKey.get())?.parseJSON<MusicListItem[]>();
    if (lists) return lists;
    lists = await http.get(this.t("MUSIC_LIST")).json<MusicListItem[]>();
    await cacheKey.set(JSON.stringify(lists), 21600);
    return lists;
  }

  async searchFromLists(keyword: string, lists: MusicListItem[], limit = 10, offset = 0, noZero = true) {
    const scores: FuzzySearchResult[] = [];
    for (const item of lists) {
      const keywords = [item.title, ...(item.infos?.map((info) => info.title) ?? []), item.pronunciation];
      let maxM: ReturnType<typeof fuzzyMatchMixed> | null = null;
      for (const kw of keywords) {
        const m = fuzzyMatchMixed(keyword, kw);
        if (maxM === null || m.score > (maxM?.score ?? 0)) maxM = m;
      }
      if (noZero && (maxM?.score ?? 0) === 0) continue;
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

  async search(keyword: string, limit = 10, offset = 0, noZero = true) {
    const lists = await this.getMusicLists();
    return this.searchFromLists(keyword, lists, limit, offset, noZero);
  }

  async getAllDifficulties() {
    const cacheKey = this.cache.at("musicDifficulties").at(this.region);
    let difficulties = (await cacheKey.get())?.parseJSON<MusicDifficultyItem[]>();
    if (difficulties) return difficulties;
    difficulties = await http.get(this.t("DIFFICULTY_LIST")).json<MusicDifficultyItem[]>();
    await cacheKey.set(JSON.stringify(difficulties), 21600);
    return difficulties;
  }

  async getAllMusicVocals() {
    const cacheKey = this.cache.at("musicVocals").at(this.region);
    let vocals = (await cacheKey.get())?.parseJSON<MusicVocalItem[]>();
    if (vocals) return vocals;
    vocals = await http.get(this.t("MUSIC_VOCALS")).json<MusicVocalItem[]>();
    await cacheKey.set(JSON.stringify(vocals), 21600);
    return vocals;
  }

  async getGameCharacters() {
    const cacheKey = this.cache.at("gameCharacters").at(this.region);
    let characters = (await cacheKey.get())?.parseJSON<GameCharacterItem[]>();
    if (characters) return characters;
    characters = await http.get(this.t("GAME_CHARACTERS")).json<GameCharacterItem[]>();
    await cacheKey.set(JSON.stringify(characters), 21600);
    return characters;
  }

  async getOutsideCharacters() {
    const cacheKey = this.cache.at("outsideCharacters").at(this.region);
    let characters = (await cacheKey.get())?.parseJSON<OutsideCharacterItem[]>();
    if (characters) return characters;
    characters = await http.get(this.t("OUTSIDE_CHARACTERS")).json<OutsideCharacterItem[]>();
    await cacheKey.set(JSON.stringify(characters), 21600);
    return characters;
  }

  async getDifficultiesByMusicId(musicId: number) {
    const allDifficulties = await this.getAllDifficulties();
    return allDifficulties.filter((diff) => diff.musicId === musicId);
  }

  async getMusicChartById(musicId: number, difficulty: MusicDifficulty) {
    const musicIdPad = musicId.toString().padStart(4, "0");
    const difficulties = await this.getDifficultiesByMusicId(musicId);
    const difficultyNames = difficulties.map((diff) => diff.musicDifficulty);
    if (!difficultyNames.includes(difficulty)) {
      throw new Error(`Music ID ${musicId} does not have difficulty ${difficulty}`);
    }
    const url = this.t("CHART_IMAGE", { musicIdPad, difficulty });
    return url;
  }

  getVocalCharacterItemsSpecified(
    vocal: MusicVocalItem,
    c: {
      gameCharacters: GameCharacterItem[];
      outsideCharacters: OutsideCharacterItem[];
    }
  ): ((GameCharacterItem | OutsideCharacterItem) & Partial<GameCharacterItem> & Partial<OutsideCharacterItem>)[] {
    const characterItems = vocal.characters.map((char) => {
      if (char.characterType === "game_character") {
        return c.gameCharacters.find((gc) => gc.id === char.characterId)!;
      } else {
        return c.outsideCharacters.find((oc) => oc.id === char.characterId)!;
      }
    });
    return characterItems;
  }

  async getVocalCharacterItems(vocal: MusicVocalItem) {
    const [gameCharacters, outsideCharacters] = await Promise.all([
      this.getGameCharacters(),
      this.getOutsideCharacters(),
    ]);
    return this.getVocalCharacterItemsSpecified(vocal, { gameCharacters, outsideCharacters });
  }

  getMusicMp3Url(assetbundleName: string, isShort = false) {
    return this.t("AUDIO_FILE", {
      width: isShort ? "short" : "long",
      assetbundleName,
      filename: `${assetbundleName}${isShort ? "_short" : ""}`,
      ext: "mp3",
    });
  }
}
