import Novixo from "./index.js";

async function test() {
  await Novixo.init({
    endpoint: "https://example.com/api",
    syncHandler: async (item) => {
      console.log("Pretend syncing:", item.type);
      return true;
    },
  });

  console.log("Network state:", Novixo.getNetworkState());

  await Novixo.send({ type: "test_item", payload: { hello: "world" } });

  console.log("Queue size after send:", Novixo.queueSize());
}

test();
