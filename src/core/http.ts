import ky from "ky";

export const http = ky.create({
  retry: 3,
});

export default http;
