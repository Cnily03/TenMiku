import type TenMiku from "@/index";
import type { TenmikuProtected } from "@/index";

export class TenMikuPlugin {
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }

  setup(_tenmiku: TenMiku, _protected: TenmikuProtected) {}
}
