declare namespace NodeJS {
  interface ProcessEnv {
    PG_HOST?: string;
    PG_PORT?: string;
    PG_SUPERUSER?: string;
    PG_SUPERUSER_PASSWORD?: string;
    DATABASE_OWNER_URL?: string;
    DATABASE_URL?: string;
    TEST_DATABASE_URL?: string;
    TEST_DATABASE_OWNER_URL?: string;
    APP_URL?: string;
    SESSION_SECRET?: string;
    STORAGE_DIR?: string;
    BACKUP_DIR?: string;
    PG_BIN_DIR?: string;
    TRUST_PROXY?: string;
    DISABLE_MFA?: string;
    BACKUP_PASSPHRASE?: string;
    DB_OWNER_PASSWORD?: string;
    DB_APP_PASSWORD?: string;
    NODE_ENV?: string;
  }
}
