import { checksumAddress, parseTokenInput, lookupTokenMetadata, createCoinGeckoLookup } from "../lib/token-lookup.mjs";

type LookupControls = {
  chain: HTMLSelectElement;
  address: HTMLInputElement;
  name: HTMLInputElement;
  symbol: HTMLInputElement;
  onUpdate: () => void;
};

export function setupAssetLookup({ chain, address, name, symbol, onUpdate }: LookupControls) {
  const status = document.getElementById("token-lookup-status")!;
  const metadata = document.getElementById("asset-metadata")!;
  const manual = document.getElementById("enter-token-manually") as HTMLButtonElement;
  const image = document.getElementById("token-logo") as HTMLImageElement;
  const apply = document.getElementById("apply-token-details") as HTMLButtonElement;
  const retry = document.getElementById("retry-token-lookup") as HTMLButtonElement;
  const logoLookup = createCoinGeckoLookup();
  const edited = new Set<HTMLInputElement>();
  let generation = 0;
  let lastInput: string | undefined;
  let lastTokenKey: string | undefined;
  let controller: AbortController | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let loadingDelay: ReturnType<typeof setTimeout> | undefined;
  let found: { name: string | null; symbol: string | null } | undefined;
  let activeImage: HTMLImageElement | undefined;
  let imageTimeout: ReturnType<typeof setTimeout> | undefined;

  function message(text: string, tone: "neutral" | "loading" | "quiet" | "warning" | "error" = "neutral") {
    status.textContent = text;
    status.dataset.loading = String(tone === "loading");
    status.dataset.tone = tone;
    status.classList.toggle("intake-sr-only", tone === "quiet");
  }

  function revealDetails() {
    metadata.hidden = false;
    manual.hidden = true;
  }

  function showApply() {
    apply.hidden = !found || !((found.name && name.value !== found.name) || (found.symbol && symbol.value !== found.symbol));
  }

  for (const control of [name, symbol]) {
    const markEdited = () => {
      edited.add(control);
      showApply();
    };
    control.addEventListener("input", markEdited);
    control.addEventListener("change", markEdited);
  }

  function reset(clearDetails: boolean) {
    generation++;
    controller?.abort();
    clearTimeout(debounce);
    clearTimeout(loadingDelay);
    clearTimeout(imageTimeout);
    if (activeImage) { activeImage.onload = null; activeImage.onerror = null; activeImage.removeAttribute("src"); }
    activeImage = undefined;
    image.hidden = true;
    image.removeAttribute("src");
    found = undefined;
    apply.hidden = true;
    retry.hidden = true;
    // Name and symbol belong to the selected asset, including when restored
    // from a draft. Only keep them on initial load or a same-asset retry.
    if (clearDetails) {
      metadata.hidden = true;
      manual.hidden = false;
      edited.clear();
      let cleared = false;
      for (const control of [name, symbol]) {
        if (control.value) { control.value = ""; cleared = true; }
      }
      if (cleared) onUpdate();
    }
  }

  function lookup(force = false) {
    const addressText = checksumAddress(address.value.trim());
    if (addressText !== address.value) {
      address.value = addressText;
      onUpdate();
    }
    const token = parseTokenInput(address.value, chain.value);
    const input = token?.key ?? `${chain.value}:${address.value.trim()}`;
    // Normalize even when a pasted link identifies the token already on screen.
    if (token && (address.value !== token.address || chain.value !== token.network.name)) {
      address.value = token.address;
      chain.value = token.network.name;
      onUpdate();
    }
    if (!force && input === lastInput) return;
    const identityChanged = lastInput !== undefined && input !== lastInput;
    // Free-form manual entries such as N/A have no token identity to replace.
    // Clear metadata when entering a new token or leaving a previous token.
    const clearDetails = identityChanged && !!(token || lastTokenKey);
    lastInput = input;
    lastTokenKey = token?.key;
    reset(clearDetails);
    if (!token) {
      message("");
      if (address.value.trim().toLowerCase() === "n/a") revealDetails();
      return;
    }
    const current = generation;
    const isCurrent = () => current === generation;
    message("");
    debounce = setTimeout(() => {
      if (!isCurrent()) return;
      controller = new AbortController();
      loadingDelay = setTimeout(() => { if (isCurrent()) message("Looking up…", "loading"); }, 200);
      void lookupTokenMetadata(token, controller.signal).then((details) => {
        if (!isCurrent()) return;
        clearTimeout(loadingDelay);
        found = details;
        let changed = false;
        for (const [control, value] of [[name, details.name], [symbol, details.symbol]] as const) {
          if (value && !control.value.trim() && !edited.has(control)) {
            control.value = value;
            changed = true;
          }
        }
        if (changed) onUpdate();
        revealDetails();
        if (details.name && details.symbol) message("Asset details loaded.", "quiet");
        else if (details.name || details.symbol) message(`Enter the missing ${details.name ? "symbol" : "name"}.`, "warning");
        else message("Couldn't load details. Enter manually.", "warning");
        retry.hidden = !!(details.name && details.symbol);
        showApply();
      });
      // Logo lookup never delays metadata or form use, and has no other providers.
      void logoLookup(token).then((url: string | null) => {
        if (!url || !isCurrent()) return;
        const candidate = new Image();
        activeImage = candidate;
        candidate.referrerPolicy = "no-referrer";
        const discard = () => { candidate.onload = null; candidate.onerror = null; candidate.removeAttribute("src"); };
        imageTimeout = setTimeout(discard, 5000);
        candidate.onload = () => {
          clearTimeout(imageTimeout);
          if (isCurrent()) { image.src = url; image.hidden = false; }
        };
        candidate.onerror = () => { clearTimeout(imageTimeout); discard(); };
        candidate.src = url;
      });
    }, 150);
  }

  image.addEventListener("error", () => { image.hidden = true; });
  address.addEventListener("input", () => lookup());
  address.addEventListener("change", () => lookup());
  address.addEventListener("blur", () => {
    if (address.value.trim() && !parseTokenInput(address.value, chain.value) && metadata.hidden) {
      message("Enter a full address or supported explorer link.", "error");
    }
  });
  chain.addEventListener("change", () => lookup());
  manual.addEventListener("click", () => {
    revealDetails();
    message("");
    name.focus();
  });
  apply.addEventListener("click", () => {
    if (!found) return;
    for (const [control, value] of [[name, found.name], [symbol, found.symbol]] as const) {
      if (value) { control.value = value; edited.delete(control); }
    }
    onUpdate();
    showApply();
    message("Asset details updated.", "quiet");
  });
  retry.addEventListener("click", () => lookup(true));
  if (name.value || symbol.value) revealDetails();
  lookup();
  return revealDetails;
}
