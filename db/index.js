// https://github.com/tuhinpal/WhatsBot/blob/main/db/index.js

const { MongoClient } = require("mongodb");
const { mongodb_url } = require("../config");

var cachedData = new Map(); // mappings of tg <->whatsapp chatIDS
var replyIDSTG = new Map(); // mapping to store tgMessageID -> whatsApp msgID
var replyIDSWhatsAPP = new Map(); // mapping to store whatsApp msgID -> tgMessageID
var pmEnabled = new Map(); // mapping for PM log status

const database = async (collection) => {
  var conn = await MongoClient.connect(mongodb_url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  return {
    conn,
    coll: conn.db("whatsbot").collection(collection),
  };
};

module.exports = {
  database,
  cachedData,
  replyIDSTG,
  replyIDSWhatsAPP,
  pmEnabled,
};
