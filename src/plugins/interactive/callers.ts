import colors from "colors";
import type TenMiku from "@/index";
import { MUSIC_DIFFICULTIES, type MusicDifficulty, type MusicListItem, type TenMikuUtils } from "@/utils";
import type InteractivePlugin from ".";

interface InteractiveCaller {
  name: string;
  argsDescription: string[];
  handler: (...args: string[]) => Promise<void> | void;
}

export default class InteractiveCallerHelper {
  private callers: Map<string, InteractiveCaller> = new Map();

  add(name: string, argsDescription: string[], handler: (...args: string[]) => Promise<void> | void) {
    this.callers.set(name, { name, argsDescription, handler });
  }

  getCaller(name: string): InteractiveCaller | undefined {
    return this.callers.get(name);
  }

  getAll(): InteractiveCaller[] {
    return Array.from(this.callers.values());
  }

  call(name: string, args: string[]): Promise<void> | void {
    const caller = this.callers.get(name);
    if (!caller) {
      throw new Error(`Caller ${name} not found`);
    }
    return caller.handler(...args);
  }

  useIntegrated(tenmiku: TenMiku, plugin: InteractivePlugin) {
    const utils: TenMikuUtils = tenmiku.utils;

    this.add("list-musics", ["[page]", "[size]"], async (page = "1", pageSize = "10") => {
      const size = parseInt(pageSize, 10) || 10;
      const p = parseInt(page, 10) || 1;
      await listMusics(utils.at(plugin.region), p, size);
    });

    this.add("search-musics", ["<limit>", "<keyword>"], async (limit = "10", ...keyword: string[]) => {
      if (!keyword.length) {
        console.log("Please provide a keyword to search.".red);
        return;
      }
      await searchMusics(utils.at(plugin.region), keyword.join(" "), Number.parseInt(limit, 10) || 10);
    });

    this.add("get-chart", ["<difficulty>", "keyword"], async (difficulty: string, ...keyword: string[]) => {
      if (!keyword.length) {
        console.log("Please provide a keyword to search.".red);
        return;
      }
      if (!MUSIC_DIFFICULTIES.includes(difficulty as MusicDifficulty)) {
        console.log(`Invalid difficulty: ${difficulty}`.red);
        console.log(`Valid difficulties are: ${MUSIC_DIFFICULTIES.join(", ")}`);
        return;
      }
      await getChart(utils.at(plugin.region), difficulty as MusicDifficulty, keyword.join(" "));
    });
  }
}

const displayLength = (s: string) => {
  let len = 0;
  for (const ch of s) {
    len += ch.charCodeAt(0) > 255 ? 2 : 1;
  }
  return len;
};

// [MuiscListItem, Array<extra string to calculate length>]
const getCreditArray = (lists: MusicListItem[] | [MusicListItem, string[]][]) => {
  const prefixes = ["作词: ", "作曲: ", "编曲: "];
  const maxBytes = [0, 0, 0];
  const arrayMaker = (item: MusicListItem) => [item.lyricist, item.composer, item.arranger];
  lists.forEach((item) => {
    const arr: [MusicListItem, string[]] = Array.isArray(item) ? [item[0], item[1] ?? []] : [item, []];
    arrayMaker(arr[0]).forEach((s, i) => {
      maxBytes[i] = Math.max(maxBytes[i]!, displayLength(s), ...arr[1].map((extra) => displayLength(extra)));
    });
  });
  const values = lists.map((item) => {
    const it = Array.isArray(item) ? item[0] : item;
    const v = arrayMaker(it).map((s, i) => s + " ".repeat(maxBytes[i]! - displayLength(s)));
    return v.map((s, i) => prefixes[i]?.blue + s);
  });
  return values;
};

async function listMusics(utils: TenMikuUtils, page: number, pageSize: number) {
  // sort by seq high to low
  const lists = (await utils.getMusicLists())
    .sort((a, b) => b.releasedAt - a.releasedAt)
    .slice((page - 1) * pageSize, page * pageSize);
  console.log(`Total musics: ${lists.length}`);
  const credits = getCreditArray(lists);
  for (let i = 0; i < lists.length; i++) {
    const item = lists[i]!;
    const credit = credits[i]!;
    const msgs = [`- ${`[${item.id}]`.yellow} ${item.title}`, `  ${credit.join("  ").dim}`];
    console.log(msgs.join("\n"));
  }
}

async function searchMusics(utils: TenMikuUtils, keyword: string, limit: number) {
  const lists = await utils.getMusicLists();
  const results = await utils.searchFromLists(keyword, lists, limit);
  const maxTitleDisplayLength = results.reduce((max, res) => {
    const titleLength = displayLength(res.item.title);
    return Math.max(max, titleLength);
  }, 0);
  const paddingScores = results.map((res) => {
    const titleLength = displayLength(res.item.title);
    const pad = " ".repeat(maxTitleDisplayLength - titleLength);
    const score = (Math.round(res.score * 100) / 100).toFixed(2);
    return pad + `(${score})`.magenta.dim;
  });
  console.log(`Found ${results.length} results for ${JSON.stringify(keyword)}:`);
  const credits = getCreditArray(results.map((res) => [res.item, [res.target]] as [MusicListItem, string[]]));
  for (let i = 0; i < results.length; i++) {
    const res = results[i]!;
    const item = res.item;
    const credit = credits[i]!;
    let searchText = "";
    let lastIndex = 0;
    for (const [start, end] of res.ranges.target) {
      searchText += res.target.slice(lastIndex, start);
      searchText += colors.underline(res.target.slice(start, end));
      lastIndex = end;
    }
    searchText += res.target.slice(lastIndex);
    const title =
      res.target === item.title
        ? `${searchText}  ${paddingScores[i]}`
        : `${item.title}  ${paddingScores[i]} ${colors.dim(`\n   ${" ".repeat(String(item.id).length)}  ${searchText}`)}`;
    const msgs = [`- ${`[${item.id}]`.yellow} ${title}`, `  ${credit.join("  ").dim}`];
    console.log(msgs.join("\n"));
  }
}

async function getChart(utils: TenMikuUtils, difficulty: MusicDifficulty, keyword: string) {
  const lists = await utils.getMusicLists();
  const result = await utils.searchFromLists(keyword, lists, 1);
  if (result.length === 0) {
    console.log(colors.red(`No music found for keyword: ${keyword}`));
    return;
  }
  const musicId = result[0]!.item.id;
  const difficulties = await utils.getDifficultiesByMusicId(musicId);
  const diff = difficulties.map((d) => d.musicDifficulty);
  if (!diff || !diff.includes(difficulty)) {
    console.log(colors.red(`No difficulty ${difficulty} found for music: [${musicId}] ${result[0]!.item.title}`));
    return;
  }
  const chartUrl = await utils.getMusicChartById(musicId, difficulty);
  console.log(colors.green.bold(`Chart URL for [${musicId}] ${result[0]!.item.title} (${difficulty}):`));
  console.log(chartUrl);
}
