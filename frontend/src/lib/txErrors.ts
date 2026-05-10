// Shared helpers for surfacing viem / wagmi tx errors with classification.
//
// Walks the error's nested `cause` chain to pull out the readable reason
// (Solidity custom errors live in there, not on the top-level Error), and
// classifies common patterns into a user-friendly { title, body } pair.
//
// Reused by every write surface — invoice pay, registration modal, admin
// panel — so we don't have to keep updating each one when MetaMask phrases
// something new.
export interface DescribedError {
  title: string;
  body: string;
}

export function describeWriteError(err: unknown): DescribedError {
  const messages: string[] = [];
  let cur: unknown = err;
  let depth = 0;
  while (cur && depth < 10) {
    if (typeof cur === "object") {
      const obj = cur as { shortMessage?: unknown; message?: unknown; cause?: unknown };
      if (typeof obj.shortMessage === "string") messages.push(obj.shortMessage);
      else if (typeof obj.message === "string") messages.push(obj.message);
      cur = obj.cause;
    } else break;
    depth++;
  }
  const joined = messages.join(" | ");
  const lower = joined.toLowerCase();

  if (/user rejected|user denied/.test(lower)) {
    return { title: "Transaction rejected", body: "You cancelled the request in your wallet." };
  }
  if (/failed to fetch|networkerror|fetch failed|failed to make.*request|http request failed/.test(lower)) {
    return {
      title: "Network unreachable",
      body:
        "Couldn't reach an RPC endpoint. If MetaMask shows \"This transaction is likely to fail\", " +
        "click Send anyway. Otherwise check your connection or switch MetaMask's Sepolia RPC under " +
        "Settings → Networks → Sepolia.",
    };
  }
  if (/insufficient funds/.test(lower)) {
    return { title: "Not enough ETH", body: "Your wallet doesn't have enough Sepolia ETH for gas." };
  }
  if (/sanctionedaddress/.test(lower)) {
    return {
      title: "Sanctioned address",
      body:
        "The connected wallet (or the merchant address you're targeting) is " +
        "flagged on the Chainalysis sanctions oracle. Per applicable regulations, " +
        "Secudigate cannot service this address.",
    };
  }
  if (/accesscontrolunauthorizedaccount|ownableunauthorizedaccount/.test(lower)) {
    return {
      title: "Not authorized",
      body: "The connected wallet does not have the role required for this action.",
    };
  }
  if (/erc20insufficientbalance/.test(lower)) {
    return {
      title: "Insufficient token balance",
      body: "Your wallet doesn't hold enough of the token required for this call.",
    };
  }
  return { title: "Transaction failed", body: messages[0] ?? "Unknown error." };
}
