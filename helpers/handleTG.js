const config = require("../config");
const axios = require("axios");
const { database, cachedData, replyIDSTG, replyIDSWhatsAPP } = require("../db");

const getChatID = async (chat) => {
  if (cachedData.get(chat.toString()) != undefined) {
    return cachedData.get(chat.toString());
  } else {
    try {
      var { conn, coll } = await database("connections");
      const data = await coll.findOne({ tgID: chat.toString() });
      if (data) {
        cachedData.set(chat.toString(), data.whatsAppID);
        return data.whatsAppID;
      } else {
        cachedData.set(chat.toString(), null);
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

const parseLink = (msg) => {
  chatId = msg.chat.id.toString().replace("-100", "").trim();
  message_id = msg.message_id;
  if (msg.chat.type == "private") {
    return `TG`;
  } else {
    if (msg.chat.username) {
      return `https://t.me/${msg.chat.username}/${message_id}`;
    } else {
      return `https://t.me/c/${chatId}/${message_id}`;
    }
  }
};

const getChatTitle = (msg) => {
  if (msg.chat.type == "private") {
    return `${msg.from.first_name} ${
      msg.from.last_name ? msg.from.last_name : ""
    }`;
  } else {
    return `${msg.from.first_name} ${
      msg.from.last_name ? msg.from.last_name : ""
    } at ${msg.chat.title}`;
  }
};

const getMediaInfo = (msg) => {
  const mediaType = msg.photo
    ? "photo"
    : msg.video
    ? "video"
    : msg.audio
    ? "audio"
    : msg.voice
    ? "voice"
    : msg.animation
    ? "animation"
    : msg.sticker && !msg.sticker.is_animated
    ? "sticker"
    : "document";
  let mediaObj;

  mediaObj = msg[mediaType];
  if (Array.isArray(mediaObj)) {
    mediaObj = mediaObj[mediaObj.length - 1]; // choosing highest quality among an array
  }
  const [type, mimeType, SAD, fileName, fileId, fileSize, caption, SAV, SAG] = [
    mediaType,
    mediaObj.mime_type ? mediaObj.mime_type : "",
    false,
    mediaObj.file_name,
    mediaObj.file_id,
    mediaObj.file_size,
    msg.caption
      ? `${getChatTitle(msg)} [${parseLink(msg)}] \n\n${msg.caption}`
      : `${getChatTitle(msg)} [${parseLink(msg)}]`,
    mediaType == "voice",
    mediaType == "animation",
  ];
  switch (mediaType) {
    case "photo":
      return {
        type,
        mimeType: "image/png",
        SAD,
        fileName,
        fileId,
        fileSize,
        caption,
        SAV,
        SAG,
      };
    case "video":
      return {
        type,
        mimeType,
        SAD,
        fileName,
        fileId,
        fileSize,
        caption,
        SAV,
        SAG,
      };
    case "audio":
      return {
        type,
        mimeType,
        SAD,
        fileName,
        fileId,
        fileSize,
        caption,
        SAV,
        SAG,
      };
    case "voice":
      return {
        type,
        mimeType,
        SAD,
        fileName,
        fileId,
        fileSize,
        caption,
        SAV,
        SAG,
      };
    case "animation":
      return {
        type,
        mimeType,
        SAD,
        fileName,
        fileId,
        fileSize,
        caption,
        SAV,
        SAG,
      };
    case "sticker":
      return {
        type,
        mimeType: msg.sticker.is_video ? "video/webm" : "image/webp",
        SAD,
        fileName,
        fileId,
        fileSize,
        caption,
        SAV,
        SAG,
        SAS: true,
      };
    default:
      return {
        type,
        mimeType,
        SAD: true,
        fileName,
        fileId,
        fileSize,
        caption,
        SAV,
        SAG,
      };
  }
};

const handleTgBot = async (ctx, client, MessageMedia) => {
  try {
    const sendMsgToWa = async (msg, chatId, msgId) => {
      let waMsg;
      if (!msg.text && chatId) {
        const mediaInfo = getMediaInfo(msg);
        if (mediaInfo.fileSize > config.tgDownloadMax) {
          console.log(
            `File size ${mediaInfo.fileSize} exceeds max download size`
          );
          waMsg = await client.sendMessage(
            chatId,
            `ERROR: File Size Exceeds maximum upload size\n\n${mediaInfo.caption}`,
            {
              quotedMessageId: msgId,
            }
          );
          ctx.reply(
            "<b>ERROR</b>\nFile was not delivered properly, since the file size exceeds maximum file size allowed by API.",
            {
              reply_to_message_id: ctx.message.message_id,
              allow_sending_without_reply: true,
              parse_mode: "HTML",
            }
          );

          replyIDSTG.set(
            `${msg.chat.id}:${msg.message_id}`,
            waMsg?.id?._serialized
          );
          replyIDSWhatsAPP.set(
            waMsg?.id?._serialized.toString(),
            msg.message_id
          );
          return;
        }
        const fileInfo = await ctx.telegram.getFile(mediaInfo.fileId);
        const base64Data = Buffer.from(
          (
            await axios.get(
              `https://api.telegram.org/file/bot${config.telegramBotToken}/${fileInfo.file_path}`,
              { responseType: "arraybuffer" }
            )
          ).data
        ).toString("base64");
        const fileData = new MessageMedia(
          mediaInfo.mimeType,
          base64Data,
          mediaInfo.fileName
        );
        waMsg = await client.sendMessage(chatId, fileData, {
          quotedMessageId: msgId,
          sendMediaAsDocument: mediaInfo.SAD,
          sendAudioAsVoice: mediaInfo.SAV,
          stickerAuthor: "useTelegram",
          stickerName: "telegramStickers",
          caption: mediaInfo.caption,
          sendMediaAsSticker: mediaInfo.SAS,
          sendVideoAsGif: mediaInfo.SAG,
        });
      } else {
        const message_ = msg.text.startsWith("/send")
          ? msg.text.split(chatId.split("@")[0])[1].trim()
          : msg.text;

        const message = `${getChatTitle(msg)} [${parseLink(
          msg
        )}]\n\n${message_}`;

        waMsg = await client.sendMessage(chatId, message, {
          quotedMessageId: msgId,
        });
      }
      replyIDSTG.set(
        `${msg.chat.id}:${msg.message_id}`,
        waMsg?.id?._serialized
      );
      replyIDSWhatsAPP.set(waMsg?.id?._serialized.toString(), msg.message_id);
    };
    let waChatId;

    waChatId = await getChatID(ctx.message.chat.id.toString());
    if (!waChatId) {
      if (
        ctx.message.from.id.toString() == config.ownerID.toString() &&
        ctx.message.chat.type == "private"
      ) {
        if (ctx.message.text && ctx.message.text.startsWith("/send")) {
          const chatId = ctx.message.text.split(" ")[1].trim() + "@c.us";
          await sendMsgToWa(ctx.message.reply_to_message, chatId);
          tgResponse("Message sent successfully.");
          return;
        } else {
          if (ctx.message.reply_to_message) {
            const replied = ctx.message.reply_to_message;
            const url_string = () => {
              if (replied.caption_entities) {
                return replied.caption_entities[0].url;
              }
              if (replied.entities) {
                return replied.entities[0].url;
              }
              if (replied.reply_markup) {
                return replied.reply_markup.inline_keyboard[0][0].url;
              }
              return null;
            };
            let url;
            url = url_string();
            if (!url) {
              console.log("no entity found from replied message!");
              ctx.reply("reply to a valid message!");
              return;
            }
            url = new URL(url);
            waChatId = url.searchParams.get("chat_id");
            if (!waChatId) {
              console.log("no entity found from replied message!");
              ctx.reply("reply to a valid message!");
              return;
            }
          } else {
            ctx.reply("reply to a valid message!");
            return;
          }
        }
      } else {
        console.log(`no connected chat for ${ctx.message.chat.id}`);
        return;
      }
    }

    const getIds = () => {
      if (
        ctx.message.reply_to_message &&
        replyIDSTG.get(
          `${ctx.message.chat.id}:${ctx.message.reply_to_message.message_id}`
        )
      ) {
        return replyIDSTG.get(
          `${ctx.message.chat.id}:${ctx.message.reply_to_message.message_id}`
        );
      } else {
        return null;
      }
    };
    // };

    let replyTOID = getIds();

    const tgResponse = (msg) => {
      ctx.reply(msg, {
        reply_to_message_id: ctx.message.message_id,
        allow_sending_without_reply: true,
      });
    };
    await sendMsgToWa(ctx.message, waChatId, replyTOID);
  } catch (err) {
    console.error(err);
  }
};

module.exports = handleTgBot;
