const { replicate, clean, fetchSession } = require("./session/manage");

async function main() {
  try {
    // keeping the cache if its a persistent servers to avoid errors
    if (process.env.SESSION_URL) {
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
