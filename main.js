const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const { Telegraf } = require("telegraf");
const config = require("./config");
const { Markup } = require("telegraf");
const handleMessage = require("./helpers/handleMessage");
const handleTgBot = require("./helpers/handleTG");
const { database, pmEnabled, cachedData } = require("./db");

const bot = new Telegraf(config.telegramBotToken);

const client = new Client({
  puppeteer: { headless: true, args: ["--no-sandbox"] },
  authStrategy: new LocalAuth({ clientId: "whatsbot" }),
});

client.on("auth_failure", () => {
  console.error(
    "There is a problem in authentication, Kindly set the env var again and restart the app"
  );
  client.tgbot.telegram.sendMessage(
    config.ownerID,
    "#ERROR\nThere is a problem in authentication, Kindly set the env var again and restart the app"
  );
});

client.on("ready", () => {
  console.log("WhatsApp Bot started !");
});

client.on("message", async (msg) => {
  if (msg.body.startsWith("!connect")) {
    const whatsAppChat = await msg.getChat();
    if (whatsAppChat.isGroup) {
      const chatID = msg.body.split("!connect ")[1].trim();
      try {
        var { conn, coll } = await database("connections");
        const data = await coll.findOne({
          tgID: chatID,
          whatsAppID: whatsAppChat.id._serialized.toString(),
        });
        if (data) {
          return await msg.reply(`Already connected to a chat! ${data.tgID}.`);
        }
      } catch (error) {
        console.log(error);
      } finally {
        if (conn) {
          await conn.close();
        }
      }
      const keyboard = Markup.inlineKeyboard([
        Markup.button.callback("Connect", whatsAppChat.id._serialized),
      ]);
      await msg.reply(
        "connection request send to telegram. waiting for approval!"
      );
      client.tgbot.telegram.sendMessage(
        chatID,
        `${msg.author} requested to connect this chat with ${whatsAppChat.name}`,
        keyboard
      );
    }
  }

  await handleMessage(msg, client.tgbot, client);
});

client.on("message_revoke_everyone", async (after, before) => {
  if (before) {
    // TODO handle deleted messages on telegram
    // console.log("Deleted message");
  }
});

client.on("disconnected", (reason) => {
  console.log("Client was logged out", reason);
  client.tgbot.telegram.sendMessage(
    config.ownerID,
    `WhatsApp client was logged out.\nReason ${reason}`
  );
});

// tg bot commands

bot.command("connect", (ctx) => {
  if (["group", "supergroup"].includes(ctx.chat.type)) {
    ctx.reply(
      `Send <code>!connect ${ctx.chat.id}</code> in your WhatsApp group.`,
      { parse_mode: "HTML" }
    );
  }
});

bot.on("callback_query", async (ctx) => {
  if (ctx.callbackQuery.from.id.toString() == config.ownerID.toString()) {
    const queryData = ctx.callbackQuery.data;
    let waChatID, tgID, chatTitle;
    if (queryData.startsWith("pm")) {
      waChatID = queryData.split(" ")[1].trim();
      let value;
      if (queryData.startsWith("pmEnable")) {
        value = "true";
      } else {
        value = "false";
      }
      try {
        var { conn, coll } = await database("pmlog");
        await coll.updateOne(
          { chatID: waChatID },
          { $set: { status: value } },
          { upsert: true }
        );
        pmEnabled.set(waChatID, value);
      } catch (error) {
        console.log(error);
      } finally {
        if (conn) {
          await conn.close();
        }
      }
      if (value == "true") {
        await client.sendMessage(
          waChatID,
          `this chat is connected now with telegram!`
        );
        ctx.answerCbQuery("Successfully Connected!", {
          show_alert: true,
        });
        ctx.editMessageText("successfully connected!");
      } else {
        ctx.answerCbQuery("connection cancelled!", { show_alert: true });
        await ctx.editMessageText("Connection refused successfully!");
      }
      return;
    }
    tgID = ctx.callbackQuery.message.chat.id.toString();
    chatTitle = ctx.callbackQuery.message.chat.title;
    waChatID = queryData;

    ctx.answerCbQuery("Successfully Connected!", { show_alert: true });
    try {
      var { conn, coll } = await database("connections");
      await coll.updateOne(
        { tgID: tgID },
        { $set: { whatsAppID: waChatID } },
        { upsert: true }
      );
      await client.sendMessage(
        waChatID,
        `this chat is connected with ${chatTitle} on telegram!`
      );
      cachedData.set(tgID, waChatID);
      cachedData.set(waChatID, tgID);
    } catch (error) {
      console.log(error);
    } finally {
      if (conn) {
        await conn.close();
      }
    }
    ctx.editMessageText("successfully connected!");
  }
});

bot.command("disconnect", async (ctx) => {
  if (["group", "supergroup"].includes(ctx.chat.type)) {
    const chatID = ctx.message.chat.id.toString();
    if (ctx.message.from.id.toString() == config.ownerID.toString()) {
      try {
        var { conn, coll } = await database("connections");
        const data = await coll.findOne({
          tgID: chatID,
        });
        if (data) {
          ctx.reply(`Disconnected!.`);
          await coll.deleteOne({
            tgID: chatID,
          });
          if (cachedData.get(chatID)) {
            cachedData.delete(chatID);
          }
          if (cachedData.get(data.whatsAppID.toString())) {
            cachedData.delete(data.whatsAppID);
          }

          await client.sendMessage(
            data.whatsAppID,
            "this chat is now disconnected!"
          );
        } else {
          ctx.reply(`no chat found to Disconnect!.`);
        }
      } catch (error) {
        console.log(error);
      } finally {
        if (conn) {
          await conn.close();
        }
      }
    }
  }
});

bot.start((ctx) =>
  ctx.replyWithMarkdownV2(
    `Hey **${ctx.message.from.first_name}**, Welcome!\n\nPowered by [TG-WhatsApp](https://github.com/subinps/TG-WhatsApp).`,
    {
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "Repo", url: "https://github.com/subinps/TG-WhatsApp" }],
        ],
      },
    }
  )
);

bot.on("message", (ctx) => {
  // Listen TG Bot messages and take action
  handleTgBot(ctx, client, MessageMedia);
});

client.tgbot = bot;

client.initialize();

bot.launch();
console.log("Telegram Bot started !");
