import fs from "node:fs";
import toml from "toml";

interface Config {
  cache: {
    enable: boolean;
    url: string;
  };
}

const configText = fs.readFileSync("config.toml", "utf-8");
const config = toml.parse(configText) as Config;

export default config;
