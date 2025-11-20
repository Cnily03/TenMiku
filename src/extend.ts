declare global {
  interface String {
    parseJSON<T>(): T;
  }
}

String.prototype.parseJSON = function <T>(): T {
  return JSON.parse(this as string) as T;
};
