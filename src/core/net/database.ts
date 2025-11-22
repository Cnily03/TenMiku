import pg from "pg";

export interface DatabaseInit {
  host: string;
  port: number;
  user: string;
  password: string;
  db: string;
  ssl_mode: string;
}

export class Database {
  private pool: pg.Pool;

  constructor(init: DatabaseInit) {
    this.pool = new pg.Pool({
      host: init.host,
      port: init.port,
      user: init.user,
      password: init.password,
      database: init.db,
      ssl:
        init.ssl_mode === "disable"
          ? false
          : {
              rejectUnauthorized: false,
            },
    });
  }

  async conn(): Promise<pg.PoolClient> {
    return await this.pool.connect();
  }
}
