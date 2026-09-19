import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex } from "@noble/hashes/utils.js";

/** EIP-55 casing; leave incomplete or manual entries unchanged. @param {string} address */
export function checksumAddress(address) {
  if (!/^0x[\da-f]{40}$/i.test(address)) return address;
  const hex = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(hex)));
  return "0x" + [...hex].map((character, index) =>
    parseInt(hash[index], 16) >= 8 ? character.toUpperCase() : character,
  ).join("");
}

// Public, browser-accessible services only. Never add private RPC URLs or keys.
export const intakeNetworks = [
  { id: 1, name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", explorer: "etherscan.io", platform: "ethereum" },
  { id: 42161, name: "Arbitrum", rpc: "https://arbitrum-one-rpc.publicnode.com", explorer: "arbiscan.io", platform: "arbitrum-one" },
  { id: 10, name: "Optimism", rpc: "https://optimism-rpc.publicnode.com", explorer: "optimistic.etherscan.io", platform: "optimistic-ethereum" },
  { id: 252, name: "Fraxtal", rpc: "https://fraxtal-rpc.publicnode.com", explorer: "fraxscan.com", platform: "fraxtal" },
];

/** @param {string | number} value */
export function intakeNetwork(value) {
  const key = String(value).trim().toLowerCase();
  return intakeNetworks.find(({ id, name }) => String(id) === key || name.toLowerCase() === key ||
    (id === 42161 && key === "arbitrum one") || (id === 1 && key === "ethereum mainnet") ||
    (id === 10 && key === "op mainnet") || (id === 252 && key === "fraxtal mainnet"));
}

/** Only exact supported explorer hosts can select a network. @param {string} input @param {string | number} selectedNetwork */
export function parseTokenInput(input, selectedNetwork) {
  let address = input.trim();
  let network = intakeNetwork(selectedNetwork);
  if (!/^0x[\da-f]{40}$/i.test(address)) {
    try {
      const url = new URL(address.startsWith("https://") ? address : `https://${address}`);
      if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
      network = intakeNetworks.find(({ explorer }) => url.hostname === explorer || url.hostname === `www.${explorer}`);
      const match = url.pathname.match(/^\/(?:token|address)\/(0x[\da-f]{40})\/?$/i);
      if (!network || !match) return null;
      address = match[1];
    } catch { return null; }
  }
  if (!network) return null;
  return { network, address: checksumAddress(address), key: `${network.id}:${address.toLowerCase()}` };
}

/** Decode bounded ERC-20 string returns and legacy bytes32 metadata. @param {unknown} result */
export function decodeTokenText(result) {
  if (typeof result !== "string" || !/^0x(?:[\da-f]{2})+$/i.test(result) || result.length > 8194) return null;
  const hex = result.slice(2);
  let data;
  if (hex.length === 64) {
    data = hex.replace(/(?:00)+$/, "");
  } else {
    // Single dynamic string return: 32-byte offset, length, then padded UTF-8.
    if (hex.length < 128 || BigInt(`0x${hex.slice(0, 64)}`) !== 32n) return null;
    const length = BigInt(`0x${hex.slice(64, 128)}`);
    if (length < 1n || length > 256n || hex.length < 128 + Number(length) * 2) return null;
    data = hex.slice(128, 128 + Number(length) * 2);
  }
  try {
    const bytes = Uint8Array.from(data.match(/../g) ?? [], (byte) => parseInt(byte, 16));
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).trim();
    if (!text || text.length > 128 || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text)) return null;
    return text;
  } catch { return null; }
}

/** @param {string} url @param {RequestInit} init @param {typeof fetch} fetcher @param {number} timeoutMs */
async function fetchJson(url, init, fetcher, timeoutMs) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (init.signal?.aborted) abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(abort, timeoutMs);
  try {
    const response = await fetcher(url, { ...init, signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("Lookup unavailable");
    return await response.json();
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", abort);
  }
}

/** @param {ReturnType<typeof parseTokenInput>} token @param {AbortSignal} signal @param {typeof fetch} fetcher @param {number} timeoutMs */
export async function lookupTokenMetadata(token, signal, fetcher = fetch, timeoutMs = 5000) {
  if (!token) return { name: null, symbol: null };
  const read = async (selector, id) => {
    try {
      const body = await fetchJson(token.network.rpc, {
        method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method: "eth_call", params: [{ to: token.address, data: selector }, "latest"] }),
      }, fetcher, timeoutMs);
      return body?.id === id && !body.error ? decodeTokenText(body.result) : null;
    } catch { return null; }
  };
  const [name, symbol] = await Promise.all([read("0x06fdde03", 1), read("0x95d89b41", 2)]);
  return { name, symbol };
}

/** Accept only CoinGecko's HTTPS image hosts, never arbitrary list-supplied URLs. @param {unknown} value */
export function coinGeckoLogoUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["assets.coingecko.com", "coin-images.coingecko.com"].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}

/** The cache shares in-flight list requests and successful results for this page. @param {typeof fetch} fetcher @param {number} timeoutMs */
export function createCoinGeckoLookup(fetcher = fetch, timeoutMs = 5000) {
  const lists = new Map();
  return async (token) => {
    if (!token) return null;
    const { network, address } = token;
    if (!lists.has(network.id)) {
      const request = fetchJson(`https://tokens.coingecko.com/${network.platform}/all.json`, {}, fetcher, timeoutMs)
        .then((list) => {
          if (!Array.isArray(list?.tokens)) throw new Error("Invalid token list");
          return list.tokens;
        }).catch(() => {
          lists.delete(network.id); // Permit a later attempt after a temporary failure.
          return [];
        });
      lists.set(network.id, request);
    }
    const tokens = await lists.get(network.id);
    const match = tokens.find((entry) => entry?.chainId === network.id &&
      typeof entry.address === "string" && entry.address.toLowerCase() === address.toLowerCase());
    return coinGeckoLogoUrl(match?.logoURI);
  };
}
