import colors from "colors";
import type TenMiku from "@/index";
import { MUSIC_DIFFICULTIES, type MusicDifficulty, type TenMikuUtils } from "@/utils";
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

  useIntegrated(tenmiku: TenMiku, _plugin: InteractivePlugin) {
    this.add("list-musics", ["[page]", "[size]"], async (page = "1", pageSize = "10") => {
      const utils: TenMikuUtils = tenmiku.utils;
      const size = parseInt(pageSize, 10) || 10;
      const p = parseInt(page, 10) || 1;
      await listMusics(utils, p, size);
    });

    this.add("search-musics", ["<limit>", "<keyword>"], async (limit = "10", ...keyword: string[]) => {
      if (!keyword.length) {
        console.log("Please provide a keyword to search.".red);
        return;
      }
      const utils: TenMikuUtils = tenmiku.utils;
      await searchMusics(utils, keyword.join(" "), Number.parseInt(limit, 10) || 10);
    });

    this.add("get-chart", ["<difficulty>", "keyword"], async (difficulty: string, ...keyword: string[]) => {
      if (!keyword.length) {
        console.log("Please provide a keyword to search.".red);
        return;
      }
      const utils: TenMikuUtils = tenmiku.utils;
      if (!MUSIC_DIFFICULTIES.includes(difficulty as MusicDifficulty)) {
        console.log(`Invalid difficulty: ${difficulty}`.red);
        console.log(`Valid difficulties are: ${MUSIC_DIFFICULTIES.join(", ")}`);
        return;
      }
      await getChart(utils, difficulty as MusicDifficulty, keyword.join(" "));
    });
  }
}

async function listMusics(utils: TenMikuUtils, page: number, pageSize: number) {
  // sort by seq high to low
  const lists = (await utils.getMusicLists())
    .sort((a, b) => b.releasedAt - a.releasedAt)
    .slice((page - 1) * pageSize, page * pageSize);
  console.log(`Total musics: ${lists.length}`);
  for (const item of lists) {
    const msgs = [
      `- ${`[${item.id}]`.yellow} ${item.title}`,
      `  ${"作词:".blue} ${item.lyricist}  ${"作曲:".blue} ${item.composer}  ${"编曲:".blue} ${item.arranger}`.dim,
    ];
    console.log(msgs.join("\n"));
  }
}

async function searchMusics(utils: TenMikuUtils, keyword: string, limit: number) {
  const lists = await utils.getMusicLists();
  const results = await utils.searchFromLists(keyword, lists, limit);
  console.log(`Found ${results.length} results for ${JSON.stringify(keyword)}:`);
  for (const res of results) {
    const item = res.item;
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
        ? searchText
        : `${item.title} ${colors.dim(`\n   ${" ".repeat(String(item.id).length)}  ${searchText}`)}`;
    const msgs = [
      `- ${`[${item.id}]`.yellow} ${title}`,
      `  ${"作词:".blue} ${item.lyricist}  ${"作曲:".blue} ${item.composer}  ${"编曲:".blue} ${item.arranger}`.dim,
    ];
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
