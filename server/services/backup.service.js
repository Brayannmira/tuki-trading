import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { backup } from "node:sqlite";
import { config } from "../config/env.js";
import database from "../db/database.js";

const backupLimit = 7;
const backupFilePattern = /^tuki-trading-\d{8}T\d{9}Z\.sqlite$/;

function pruneOldBackups(directory) {
  const backupFiles = readdirSync(directory)
    .filter((fileName) => backupFilePattern.test(fileName))
    .map((fileName) => {
      const filePath = join(directory, fileName);
      return { filePath, modifiedAt: statSync(filePath).mtimeMs };
    })
    .sort((first, second) => second.modifiedAt - first.modifiedAt);

  for (const oldBackup of backupFiles.slice(backupLimit)) {
    unlinkSync(oldBackup.filePath);
  }
}

export async function createDatabaseBackup() {
  const backupDirectory = join(dirname(config.databasePath), "backups");
  mkdirSync(backupDirectory, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
  const fileName = `tuki-trading-${timestamp}.sqlite`;
  const filePath = join(backupDirectory, fileName);
  await backup(database, filePath);
  pruneOldBackups(backupDirectory);

  return { fileName, filePath };
}
