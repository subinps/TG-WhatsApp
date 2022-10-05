const { database, pmEnabled } = require("../db");
const config = require("../config");

const isEnabled = async (chat) => {
  if (pmEnabled.get(chat) != undefined) {
    return pmEnabled.get(chat);
  } else {
    let status;
    try {
      var { conn, coll } = await database("pmlog");
      const data = await coll.findOne({ chatID: chat.toString() });
      if (data) {
        pmEnabled.set(chat, data.status);
        status = data.status;
      } else {
        pmEnabled.set(chat, "new");
        await coll.insertOne({ chatID: chat.toString(), status: "wait" });
        status = "new";
      }
    } catch (error) {
      console.log(error);
    } finally {
      if (conn) {
        await conn.close();
      }
    }
    return status;
  }
};

const isPMEnabled = async (chatID, name, msg, client) => {
  const status = await isEnabled(chatID);
  if (status == "true") {
    return true;
  }

  if (status == "new") {
    await client.tgbot.telegram.sendMessage(
      config.ownerID,
      `A new Message from ${name}, Do you want to log messages from this person?`,
      {
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `Yes, Enable`,
                callback_data: `pmEnable ${chatID}`,
              },
              {
                text: "No, Skip",
                callback_data: `pmDisable ${chatID}`,
              },
            ],
          ],
        },
      }
    );
  }
  if (config.pmReply.toString() == "true") {
    await msg.reply(
      "this is an automated message! \nYou should'nt expect a reply here since iam made to work only on groups!"
    );
  }

  return false;
};

module.exports = isPMEnabled;
