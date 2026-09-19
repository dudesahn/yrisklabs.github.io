import test from "node:test";
import assert from "node:assert/strict";
import {
  intakeNetworks, intakeNetwork, parseTokenInput, decodeTokenText,
  lookupTokenMetadata, coinGeckoLogoUrl, createCoinGeckoLookup,
} from "../src/lib/token-lookup.mjs";

const address = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const word = (n) => BigInt(n).toString(16).padStart(64, "0");
const abiString = (text) => {
  const bytes = Buffer.from(text, "utf8");
  return `0x${word(32)}${word(bytes.length)}${bytes.toString("hex").padEnd(Math.ceil(bytes.length / 32) * 64, "0")}`;
};
const json = (body) => new Response(JSON.stringify(body), { status: 200 });

test("supports exactly the four requested networks and recognizes older draft aliases", () => {
  assert.deepEqual(intakeNetworks.map(({ id }) => id), [1, 42161, 10, 252]);
  for (const network of intakeNetworks) {
    assert.equal(intakeNetwork(network.id), network);
    assert.equal(intakeNetwork(network.name.toUpperCase()), network);
    assert.equal(parseTokenInput(address, network.name).key, `${network.id}:${address.toLowerCase()}`);
  }
  assert.equal(intakeNetwork("Arbitrum One").id, 42161);
  assert.equal(intakeNetwork("OP Mainnet").id, 10);
  assert.equal(parseTokenInput(address, "Base"), null);
});

test("exact explorer links select their chain, normalize addresses and ignore page anchors", () => {
  for (const network of intakeNetworks) {
    for (const kind of ["token", "address"]) {
      const token = parseTokenInput(`https://${network.explorer}/${kind}/${address}?a=1#code`, "Ethereum");
      assert.equal(token.network.id, network.id);
      assert.equal(token.address, address);
    }
  }
  assert.equal(parseTokenInput(`arbiscan.io/token/${address}`, 1).network.id, 42161);
});

test("rejects incomplete addresses, unsupported hosts and ambiguous explorer URLs", () => {
  for (const input of ["", "N/A", "0x123", address + "a", `https://etherscan.io.evil.example/token/${address}`,
    `https://evil.example/etherscan.io/token/${address}`, `https://etherscan.io@evil.example/token/${address}`,
    `https://user:pass@etherscan.io/token/${address}`, `https://etherscan.io:444/token/${address}`,
    `http://etherscan.io/token/${address}`, `https://etherscan.io/tx/${address}`, `https://etherscan.io/token/${address}/extra`]) {
    assert.equal(parseTokenInput(input, 1), null, input);
  }
});

test("decodes ABI strings, Unicode, and legacy bytes32 without trusting malformed returns", () => {
  assert.equal(decodeTokenText(abiString("Wrapped Ether")), "Wrapped Ether");
  assert.equal(decodeTokenText(abiString("日本語 €")), "日本語 €");
  assert.equal(decodeTokenText(`0x${Buffer.from("MKR").toString("hex").padEnd(64, "0")}`), "MKR");
  for (const result of [null, {}, "0x", "0xz1", "0x123", "0x" + "00".repeat(32), abiString(""),
    abiString("a".repeat(129)), abiString("evil\u202etext"), abiString("a\nb"),
    `0x${word(64)}${word(3)}616263`, `0x${word(32)}${word(1000)}616263`,
    `0x${word(32)}${word(3)}61`, `0x${word(32)}${word(1)}ff`]) {
    assert.equal(decodeTokenText(result), null);
  }
});

test("RPC requests read only name and symbol from the selected chain without browser credentials", async () => {
  const calls = [];
  const token = parseTokenInput(address, "Fraxtal");
  const fetcher = async (url, init) => {
    const request = JSON.parse(init.body);
    calls.push({ url, init, request });
    return json({ jsonrpc: "2.0", id: request.id, result: abiString(request.id === 1 ? "Example" : "EX") });
  };
  assert.deepEqual(await lookupTokenMetadata(token, new AbortController().signal, fetcher), { name: "Example", symbol: "EX" });
  assert.equal(calls.length, 2);
  for (const { url, init, request } of calls) {
    assert.equal(url, token.network.rpc);
    assert.equal(init.credentials, "omit");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.equal(request.method, "eth_call");
    assert.deepEqual(request.params, [{ to: address, data: request.id === 1 ? "0x06fdde03" : "0x95d89b41" }, "latest"]);
  }
});

test("partial metadata, mismatched responses, network errors and timeouts are non-blocking", async () => {
  const token = parseTokenInput(address, 1);
  const signal = new AbortController().signal;
  assert.deepEqual(await lookupTokenMetadata(token, signal, async (_, init) => {
    const { id } = JSON.parse(init.body);
    return json(id === 1 ? { id, result: abiString("Example") } : { id, error: { code: -32000 } });
  }), { name: "Example", symbol: null });
  for (const fetcher of [async () => json({ id: 99, result: abiString("Wrong") }),
    async () => { throw new Error("offline"); },
    async (_, { signal: requestSignal }) => new Promise((_, reject) => {
      requestSignal.addEventListener("abort", () => reject(new Error("timeout")), { once: true });
    })]) {
    assert.deepEqual(await lookupTokenMetadata(token, signal, fetcher, 10), { name: null, symbol: null });
  }
});

test("logos require matching network and address, cache concurrent lists, and use only CoinGecko hosts", async () => {
  const token = parseTokenInput(address, 1);
  const logo = "https://assets.coingecko.com/coins/images/1/thumb/example.png";
  let requests = 0;
  const lookup = createCoinGeckoLookup(async (url, init) => {
    requests++;
    assert.equal(url, "https://tokens.coingecko.com/ethereum/all.json");
    assert.equal(init.credentials, "omit");
    return json({ tokens: [
      { chainId: 10, address, logoURI: "https://assets.coingecko.com/wrong-chain.png" },
      { chainId: 1, address: address.toLowerCase(), logoURI: logo },
    ] });
  });
  assert.deepEqual(await Promise.all([lookup(token), lookup(token)]), [logo, logo]);
  assert.equal(await lookup(parseTokenInput("0x" + "1".repeat(40), 1)), null);
  assert.equal(requests, 1);
  for (const value of ["https://evil.example/a.png", "https://assets.coingecko.com.evil.example/a.png",
    "http://assets.coingecko.com/a.png", "data:image/svg+xml,abc", "https://user@assets.coingecko.com/a.png"]) {
    assert.equal(coinGeckoLogoUrl(value), null);
  }
  assert.equal(coinGeckoLogoUrl("https://coin-images.coingecko.com/coins/images/1/a.png"), "https://coin-images.coingecko.com/coins/images/1/a.png");
});

test("missing or failed CoinGecko data produces no logo and a later request can retry", async () => {
  const token = parseTokenInput(address, 252);
  let calls = 0;
  const lookup = createCoinGeckoLookup(async () => {
    if (++calls === 1) throw new Error("offline");
    return json({ tokens: [{ chainId: 252, address }] });
  });
  assert.equal(await lookup(token), null);
  assert.equal(await lookup(token), null);
  assert.equal(calls, 2);
});

test("ABI limits distinguish accepted boundary values from oversized or truncated data", () => {
  assert.equal(decodeTokenText(abiString("a".repeat(128))), "a".repeat(128));
  assert.equal(decodeTokenText(abiString("é".repeat(128))), "é".repeat(128));
  assert.equal(decodeTokenText(abiString("日".repeat(86))), null); // 258 UTF-8 bytes.
  assert.equal(decodeTokenText("0x" + "61".repeat(32)), "a".repeat(32));
  for (const value of ["0x" + "61".repeat(4097), `0x${word(32)}${"f".repeat(64)}61`,
    `0x${word(32)}${word(2)}c3`, abiString("a\u0000b"), abiString("a\u2066b")]) {
    assert.equal(decodeTokenText(value), null);
  }
});

test("HTTP errors and malformed RPC JSON never become token metadata", async () => {
  const token = parseTokenInput(address, 10);
  for (const response of [new Response("busy", { status: 429 }), new Response("<html>Error</html>"),
    json(null), json([]), json({ id: 1, result: {} }), json({ id: 1, result: "0x" })]) {
    const details = await lookupTokenMetadata(token, new AbortController().signal, async () => response.clone());
    assert.deepEqual(details, { name: null, symbol: null });
  }
});

test("cancellation reaches both RPC calls, including already-aborted requests", async () => {
  for (const alreadyAborted of [false, true]) {
    const controller = new AbortController();
    if (alreadyAborted) controller.abort();
    const signals = [];
    const fetcher = async (_, { signal }) => new Promise((_, reject) => {
      signals.push(signal);
      const rejectAbort = () => reject(new DOMException("Aborted", "AbortError"));
      if (signal.aborted) rejectAbort();
      else signal.addEventListener("abort", rejectAbort, { once: true });
    });
    const pending = lookupTokenMetadata(parseTokenInput(address, 1), controller.signal, fetcher);
    controller.abort();
    assert.deepEqual(await pending, { name: null, symbol: null });
    assert.equal(signals.length, 2);
    assert.ok(signals.every((signal) => signal.aborted));
  }
});

test("RPC timeout includes a stalled JSON response body", async () => {
  const details = await lookupTokenMetadata(parseTokenInput(address, 1), new AbortController().signal,
    async (_, { signal }) => ({ ok: true, json: () => new Promise((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")), { once: true });
    }) }), 10);
  assert.deepEqual(details, { name: null, symbol: null });
});

test("bad CoinGecko payloads, entries, and timeouts stay optional and permit recovery", async () => {
  const token = parseTokenInput(address, 1);
  const valid = { tokens: [{ chainId: 1, address, logoURI: "https://assets.coingecko.com/good.png" }] };
  for (const bad of [null, {}, { tokens: {} }, { tokens: "bad" }]) {
    let attempt = 0;
    const lookup = createCoinGeckoLookup(async () => json(attempt++ ? valid : bad));
    assert.equal(await lookup(token), null);
    assert.equal(await lookup(token), valid.tokens[0].logoURI);
  }
  const lookup = createCoinGeckoLookup(async () => json({ tokens: [null, {}, { chainId: 1, address: {} }, { chainId: "1", address }, ...valid.tokens] }));
  assert.equal(await lookup(token), valid.tokens[0].logoURI);
  const slow = createCoinGeckoLookup(async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(new DOMException("Timeout", "AbortError")), { once: true });
  }), 10);
  assert.equal(await slow(token), null);
});

test("CoinGecko caches are isolated by chain even when the address is identical", async () => {
  const fetched = [];
  const lookup = createCoinGeckoLookup(async (url) => {
    fetched.push(url);
    const chain = intakeNetworks.find(({ platform }) => url.endsWith(`/${platform}/all.json`));
    return json({ tokens: [{ chainId: chain.id, address, logoURI: `https://assets.coingecko.com/${chain.id}.png` }] });
  });
  for (const chain of intakeNetworks) {
    assert.equal(await lookup(parseTokenInput(address, chain.id)), `https://assets.coingecko.com/${chain.id}.png`);
  }
  assert.equal(fetched.length, 4);
});
