import sql from "mssql";
import { ENV } from "./_core/env";

export type MSSQLUserRole = "user" | "admin";

export type MSSQLUserRow = {
  id: number;
  openId: string;
  name: string | null;
  email: string | null;
  loginMethod: string | null;
  role: MSSQLUserRole;
  createdAt: Date;
  updatedAt: Date;
  lastSignedIn: Date;
};

function getJDEConfig() {
  return {
    MSSQL_HOST: ENV.mssqlHost || "localhost",
    MSSQL_PORT: ENV.mssqlPort || 1433,
    MSSQL_USER: ENV.mssqlUser || "",
    MSSQL_PASSWORD: ENV.mssqlPassword || "",
    MSSQL_DATABASE: ENV.mssqlDatabase || "JDE_AI",
  };
}

function getSqlConfig(): sql.config {
  const config = getJDEConfig();
  return {
    server: config.MSSQL_HOST,
    port: config.MSSQL_PORT,
    user: config.MSSQL_USER,
    password: config.MSSQL_PASSWORD,
    database: config.MSSQL_DATABASE,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
      connectionTimeout: 30000,
      requestTimeout: 30000,
    },
    pool: {
      max: 5,
      min: 1,
      idleTimeoutMillis: 60000,
    },
  };
}

let poolPromise: Promise<sql.ConnectionPool> | null = null;
let poolInstance: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  const config = getJDEConfig();
  if (!config.MSSQL_USER || !config.MSSQL_PASSWORD || !config.MSSQL_HOST) {
    throw new Error("MSSQL credentials not configured");
  }

  if (poolInstance) {
    try {
      // @ts-expect-error - connected exists at runtime
      if (poolInstance.connected) return poolInstance;
    } catch {
      // ignore
    }
  }

  if (!poolPromise) {
    poolPromise = sql.connect(getSqlConfig()).then(pool => {
      poolInstance = pool;
      return pool;
    });
  }

  return poolPromise;
}

export async function ensureUsersTableExists(): Promise<void> {
  const pool = await getPool();

  const query = `
  IF NOT EXISTS (
    SELECT 1 FROM sysobjects WHERE name='users' AND xtype='U'
  )
  BEGIN
    CREATE TABLE users (
      id INT IDENTITY(1,1) PRIMARY KEY,
      openId VARCHAR(64) NOT NULL UNIQUE,
      name NVARCHAR(255) NULL,
      email VARCHAR(320) NULL,
      loginMethod VARCHAR(64) NULL,
      role VARCHAR(10) NOT NULL DEFAULT 'user',
      createdAt DATETIME NOT NULL DEFAULT GETDATE(),
      updatedAt DATETIME NOT NULL DEFAULT GETDATE(),
      lastSignedIn DATETIME NOT NULL DEFAULT GETDATE()
    );
  END

  -- Seed a predictable dev user if missing (using env-provided dev variables)
  IF NOT EXISTS (SELECT 1 FROM users WHERE openId = @devOpenId)
  BEGIN
    INSERT INTO users (id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
    VALUES (
      @devId,
      @devOpenId,
      @devName,
      @devEmail,
      'dev',
      'user',
      @devCreatedAt,
      @devUpdatedAt,
      @devLastSignedIn
    );
  END

  `;

  const devOpenId = process.env.DEV_OPEN_ID ?? "development";
  const devEmail = process.env.DEV_EMAIL ?? "dev@example.com";
  const devName = process.env.DEV_NAME ?? "development";

  await pool
    .request()
    .input("devOpenId", sql.VarChar(64), devOpenId)
    .input("devEmail", sql.VarChar(320), devEmail)
    .input("devName", sql.NVarChar(255), devName)
    // keep the requested id stable for dev
    .input("devId", sql.Int, 13)
    // requested timestamps (can be updated later if you want them to be dynamic)
    .input("devCreatedAt", sql.DateTime, new Date("2026-05-13T20:23:07"))
    .input("devUpdatedAt", sql.DateTime, new Date("2026-05-13T23:51:41"))
    .input("devLastSignedIn", sql.DateTime, new Date("2026-05-13T18:21:42"))
    .query(query);
}





export async function getUserByOpenId(openId: string): Promise<MSSQLUserRow | undefined> {
  const pool = await getPool();
  const result = await pool
    .request()
    .input("openId", sql.VarChar(64), openId)
    .query(`
      SELECT TOP 1
        id, openId, name, email, loginMethod, role,
        createdAt, updatedAt, lastSignedIn
      FROM users

      WHERE openId = @openId
    `);

  const row = result.recordset?.[0];
  return row
    ? {
        id: row.id,
        openId: row.openId,
        name: row.name ?? null,
        email: row.email ?? null,
        loginMethod: row.loginMethod ?? null,
        role: row.role as MSSQLUserRole,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastSignedIn: row.lastSignedIn,
      }
    : undefined;
}

export async function upsertUserByOpenId(input: {
  openId: string;
  name?: string | null;
  email?: string | null;
  loginMethod?: string | null;
  role?: MSSQLUserRole;
  lastSignedIn?: Date;
}): Promise<void> {
  const pool = await getPool();

  // MERGE keeps it simple for idempotent dev auth.
  const query = `
  MERGE users AS target

  USING (
    SELECT
      @openId AS openId,
      @name AS name,
      @email AS email,
      @loginMethod AS loginMethod,
      @role AS role,
      @lastSignedIn AS lastSignedIn
  ) AS source
  ON target.openId = source.openId
  WHEN MATCHED THEN
    UPDATE SET
      name = source.name,
      email = source.email,
      loginMethod = source.loginMethod,
      role = COALESCE(source.role, target.role),
      lastSignedIn = source.lastSignedIn,
      updatedAt = GETDATE()
  WHEN NOT MATCHED THEN
    INSERT (openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn)
    VALUES (source.openId, source.name, source.email, source.loginMethod, COALESCE(source.role, 'user'), GETDATE(), GETDATE(), source.lastSignedIn);
  `;

  await pool
    .request()
    .input("openId", sql.VarChar(64), input.openId)
    .input("name", sql.NVarChar(255), input.name ?? null)
    .input("email", sql.VarChar(320), input.email ?? null)
    .input("loginMethod", sql.VarChar(64), input.loginMethod ?? null)
    .input("role", sql.VarChar(10), input.role ?? null)
    .input("lastSignedIn", sql.DateTime, input.lastSignedIn ?? new Date())
    .query(query);
}

