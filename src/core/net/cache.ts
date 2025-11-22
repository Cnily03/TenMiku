import { createClient } from "redis";

export class Cache {
  private client: ReturnType<typeof createClient> | null = null;
  private enabled = false;
  constructor(url?: string) {
    if (url) {
      this.enabled = true;
      this.client = createClient({ url });
    }
  }

  async check() {
    if (!this.enabled) return false;
    try {
      const conn = await this.conn();
      if (conn) {
        await conn.ping();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Cache connection error:", error);
      return false;
    }
  }

  async conn() {
    if (this.client) {
      if (!this.client.isOpen) {
        await this.client.connect();
      }
      return this.client;
    }
    if (!this.enabled) {
      return null;
    }
    throw new Error("Cache client is not initialized.");
  }

  at(key: string): CacheKey {
    return new CacheKey(this).at(key);
  }
}

export class CacheKey {
  private client: Cache;
  private parts: string[] = [];

  constructor(client: Cache) {
    this.client = client;
  }

  /**
   * Append parts to the cache key.
   * @param part A part of the cache key. Can be a string or number, or an array of strings/numbers.
   * @returns The CacheKey instance for chaining.
   */
  at(part: (number | string) | (number | string)[]): CacheKey {
    const append = [part].flat().flatMap((x) => x.toString().split(":"));
    this.parts.push(...append);
    return this;
  }

  /**
   * Build the complete cache key by joining all parts with a colon.
   * @returns The constructed cache key as a string.
   */
  protected build_key(): string {
    return this.parts.join(":");
  }

  /**
   * Delete the cache entry for the constructed key.
   */
  async del(): Promise<void> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      await conn.del(key);
    }
  }

  /**
   * Check if the cache entry exists for the constructed key.
   * @returns A boolean indicating whether the cache entry exists.
   */
  async exists(): Promise<boolean> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      const result = await conn.exists(key);
      return result > 0;
    }
    return false;
  }

  /**
   * Set the expiration time for the cache entry.
   * @param sec The expiration time in seconds.
   */
  async expire(sec: number): Promise<void> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      await conn.expire(key, sec);
    }
  }

  /**
   * Get the time-to-live (TTL) for the cache entry.
   * @returns The TTL in seconds
   */
  async ttl(): Promise<number | null> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      const ttl = await conn.ttl(key);
      return ttl;
    }
    return null;
  }

  /**
   * Retrieve the value stored in the cache for the constructed key.
   * @returns The value stored in the cache for the constructed key, or null if not found.
   */
  async get(): Promise<string | null> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      return await conn.get(key);
    }
    return null;
  }

  /**
   * Set the value in the cache for the constructed key, with an optional expiration time.
   * @param value The value to set in the cache.
   * @param expireSec Optional expiration time in seconds.
   */
  async set(value: string, expireSec?: number): Promise<void> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      if (expireSec) {
        await conn.setEx(key, expireSec, value);
      } else {
        await conn.set(key, value);
      }
    }
  }

  /**
   * Retrieve a field from a hash stored in the cache for the constructed key.
   * @param field The field within the hash to retrieve.
   * @returns The value associated with the specified field, or null if not found.
   */
  async hget(field: string): Promise<string | null> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      return await conn.hGet(key, field);
    }
    return null;
  }

  /**
   * Set a field in a hash stored in the cache for the constructed key.
   * @param field The field within the hash to set.
   * @param value The value to set for the specified field.
   */
  async hset(field: string, value: string): Promise<void> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      await conn.hSet(key, field, value);
    }
  }

  /**
   * Delete a field from a hash stored in the cache for the constructed key.
   * @param field The field within the hash to delete.
   */
  async hdel(field: string): Promise<void> {
    const conn = await this.client.conn();
    if (conn) {
      const key = this.build_key();
      await conn.hDel(key, field);
    }
  }
}
