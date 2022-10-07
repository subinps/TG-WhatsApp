const { replicate, clean, fetchSession } = require("./session/manage");
const fs = require("fs");

async function main() {
  try {
    // keeping the cache if its a persistent servers to avoid errors
    if (fs.existsSync(`${__dirname}/.wwebjs_auth`)) {
      console.log("Session files exists");
    } else {
      clean();
      await fetchSession();
      await replicate();
    }
    setTimeout(() => {
      require("./main");
    }, 2000);
  } catch (error) {
    console.error(error?.message);
  }
}
main();
