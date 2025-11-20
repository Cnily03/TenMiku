import TenMiku from "@/index";
import InteractivePlugin from "@/plugins/interactive";

const tenmiku = new TenMiku();
tenmiku.use(new InteractivePlugin());

// Now you can use tenmiku.interactive() to start the interactive shell
await tenmiku.interactive();