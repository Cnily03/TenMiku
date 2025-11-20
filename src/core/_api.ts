import Ky from "ky";

export const _api = Ky.create({
  retry: 3,
});

export default _api;
