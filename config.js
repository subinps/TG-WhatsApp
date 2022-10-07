// Add values if you are not using env vars
require("dotenv").config();

module.exports = {
  session_key: process.env.SESSION_KEY,
  mongodb_url: process.env.MONGODB_URL || process.env.MONGO_URL || "",
  telegramBotToken: process.env.BOT_TOKEN,
  ownerID: process.env.OWNER_ID,
  pmReply: process.env.PM_REPLY,
  tgDownloadMax: 20971520, // 20 MB
  tgUploadMax: 52428800 // 50MB
};
