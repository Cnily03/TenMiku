import type { TenMiku } from "@/index";

export class TenMikuPlugin {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }

  setup(_tenmiku: TenMiku) {}
}
