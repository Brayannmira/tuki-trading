import { createDatabaseBackup } from "../services/backup.service.js";

export async function downloadDatabaseBackup(_request, response, next) {
  try {
    const { fileName, filePath } = await createDatabaseBackup();
    response.download(filePath, fileName, (error) => {
      if (!error) return;
      if (response.headersSent) {
        response.destroy(error);
      } else {
        next(error);
      }
    });
  } catch (error) {
    next(error);
  }
}
