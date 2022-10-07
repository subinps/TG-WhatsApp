const fs = require("fs");
var path = require("path");
const config = require("../config");
const isPMEnabled = require("./handlePM");
const { database, cachedData, replyIDSWhatsAPP, replyIDSTG } = require("../db");

const getChatID = async (chat) => {
  if (cachedData.get(chat) != undefined) {
    return cachedData.get(chat);
  } else {
    try {
      var { conn, coll } = await database("connections");
      const data = await coll.findOne({ whatsAppID: chat.toString() });
      if (data) {
        cachedData.set(chat, data.tgID);
        return data.tgID;
      } else {
        cachedData.set(chat, null);
        return null;
      }
    } catch (error) {
      console.log(error);
    } finally {
      if (conn) {
        await conn.close();
      }
    }
  }
};

const handleMessage = async (message, tgbot, client) => {
  // https://github.com/WhatsGram/WhatsGram/blob/multidevice/handlers/handleMessage.js#L9
  const getMediaInfo = (msg) => {
    switch (msg.type) {
      case "image":
        return {
          fileName: "image.png",
          tgFunc: tgbot.telegram.sendPhoto.bind(tgbot.telegram),
        };
      case "video":
        if (msg.isGif) {
          return {
            fileName: "animation.gif",
            tgFunc: tgbot.telegram.sendAnimation.bind(tgbot.telegram),
          };
        }
        return {
          fileName: "video.mp4",
          tgFunc: tgbot.telegram.sendVideo.bind(tgbot.telegram),
        };
      case "audio":
        return {
          fileName: "audio.m4a",
          tgFunc: tgbot.telegram.sendAudio.bind(tgbot.telegram),
        };
      case "ptt":
        return {
          fileName: "voice.ogg",
          tgFunc: tgbot.telegram.sendVoice.bind(tgbot.telegram),
        };
      case "sticker":
        return {
          fileName: `sticker.webp`,
          tgFunc: tgbot.telegram.sendSticker.bind(tgbot.telegram),
        };
      default:
        return {
          fileName: msg.body,
          tgFunc: tgbot.telegram.sendDocument.bind(tgbot.telegram),
        };
    }
  };

  const chat = await message.getChat();

  const chatName =
    chat.name || (await client.getChatById(message?.author)).name;
  const contact = await message.getContact();
  let name = contact.name || contact.pushname || message?._data?.notifyName;
  const chatId = message.from || message.author;
  let tgChatID;
  tgChatID = await getChatID(chatId);
  const contactNumber = (message.author || message.from).split("@")[0];
  const msgId = message?.id?._serialized;
  if (
    !chat.isGroup &&
    !(await isPMEnabled(
      chatId,
      `<a href="https://wa.me/${contactNumber}?chat_id=${chatId}">${name}</a>`,
      message,
      client
    ))
  ) {
    console.log(`ignoring PM ${chatId}`);
    return;
  }
  if (!tgChatID && chat.isGroup) {
    console.log(`no tg chat ID for ${chatId}`);
    return;
  }
  if (!chat.isGroup) {
    tgChatID = config.ownerID.toString();
  }

  let replyToMessageID;
  if (message.hasQuotedMsg) {
    try {
      const replyToMessageID_ = (await message.getQuotedMessage()).id
        ?._serialized;
      replyToMessageID = replyIDSWhatsAPP.get(replyToMessageID_.toString());
    } catch (error) {
      console.log(error);
      replyToMessageID = null;
    }
  }

  const tgMessage = `${
    chat.isGroup
      ? `${chatName} | <a href="https://wa.me/${contactNumber}?chat_id=${chatId}">${name}</a>`
      : `<a href="https://wa.me/${contactNumber}?chat_id=${chatId}"><b>${chatName}</b></a> ${
          message?.isStatus ? "Added new status" : ""
        }`
  }. \n${message.body ? `\n${message.body}` : ""}`;

  if (message.hasMedia) {
    try {
      if (message._data?.size) {
        if (message._data.size > config.tgUploadMax) {
          console.log(
            `Skipping message since file Size [${message._data.size}] is higer than tg limit!`
          );
          const msg = await tgbot.telegram.sendMessage(
            tgChatID,
            `<b>ERROR</b>\n<i>File Size Exceeded the maximum upload limit! Message was skipped.</i>\n\n${tgMessage}`,
            {
              parse_mode: "HTML",
              disable_web_page_preview: true,
              disable_notification: chat.isMuted,
              reply_to_message_id: replyToMessageID,
            }
          );
          replyIDSWhatsAPP.set(msgId.toString(), msg.message_id);
          replyIDSTG.set(`${msg.chat.id}:${msg.message_id}`, msgId.toString());
          await message.reply(
            "ERROR\n\nThis message was not delivered to telegram group since the file size exceeds maximum size allowed by API!"
          );
          return;
        }
      }

      await message.downloadMedia().then(async (data) => {
        const mediaInfo = await getMediaInfo(message);
        const filePath = path.join(__dirname, "../" + mediaInfo.fileName);
        let messageData = {
          document: { source: filePath },
          options: {
            caption: tgMessage,
            disable_web_page_preview: true,
            parse_mode: "HTML",
          },
        };

        if (message.type == "sticker") {
          const chatName_ = chat.isGroup
            ? `${chatName} | ${name}`
            : `${chatName}`;
          // using a workaround for sticker captions
          messageData["options"]["reply_markup"] = {
            inline_keyboard: [
              [
                {
                  text: `${chatName_}`,
                  url: `https://wa.me/${contactNumber}?chat_id=${chatId}`,
                },
              ],
            ],
          };
        }
        if (replyToMessageID) {
          messageData["options"]["reply_to_message_id"] = replyToMessageID;
        }
        fs.writeFile(mediaInfo.fileName, data.data, "base64", async (err) => {
          if (err) {
            console.log(err);
          } else {
            const msg = await mediaInfo.tgFunc(
              tgChatID,
              messageData.document,
              messageData.options
            );
            replyIDSWhatsAPP.set(msgId.toString(), msg.message_id);
            fs.existsSync(filePath) ? fs.unlinkSync(filePath) : null;
          }
        });
      });
    } catch (e) {
      console.log(e);
    }
  } else if (!message.from.includes("status")) {
    const msg = await tgbot.telegram.sendMessage(tgChatID, tgMessage, {
      parse_mode: "HTML",
      disable_web_page_preview: true,
      disable_notification: chat.isMuted,
      reply_to_message_id: replyToMessageID,
    });
    replyIDSWhatsAPP.set(msgId.toString(), msg.message_id);
    replyIDSTG.set(`${msg.chat.id}:${msg.message_id}`, msgId.toString());
  }
};

module.exports = handleMessage;
