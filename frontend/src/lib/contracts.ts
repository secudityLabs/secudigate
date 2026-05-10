// Contract addresses + ABIs for Secudigate and ERC20.
//
// The PaymentGateway address is sourced from VITE_PAYMENT_GATEWAY_ADDRESS at
// build time. After running `forge script script/Deploy.s.sol`, copy the
// printed VITE_* values into frontend/.env.

const RAW_GATEWAY = import.meta.env.VITE_PAYMENT_GATEWAY_ADDRESS;

export const PAYMENT_GATEWAY_ADDRESS: `0x${string}` | undefined =
  RAW_GATEWAY && /^0x[a-fA-F0-9]{40}$/.test(RAW_GATEWAY)
    ? (RAW_GATEWAY as `0x${string}`)
    : undefined;

export function isContractDeployed(): boolean {
  return Boolean(PAYMENT_GATEWAY_ADDRESS);
}

// Secudigate ABI — only the functions the frontend calls.

export const secudigateAbi = [
  {
    type: "function",
    name: "registerMerchant",
    stateMutability: "nonpayable",
    inputs: [
      { name: "treasury",       type: "address" },
      { name: "feeReceiver",    type: "address" },
      { name: "feeBps",         type: "uint16"  },
      { name: "dailyLimitUsd6", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "invoiceId", type: "bytes32" },
      { name: "merchant",  type: "address" },
      { name: "token",     type: "address" },
      { name: "amount",    type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "merchant",   type: "address" },
      { name: "paymentRef", type: "string"  },
      { name: "token",      type: "address" },
      { name: "amount",     type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "merchant", type: "address" },
      { name: "amount",   type: "uint256" },
    ],
    outputs: [
      { name: "platformFee",   type: "uint256" },
      { name: "merchantFee",   type: "uint256" },
      { name: "netToTreasury", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "merchants",
    stateMutability: "view",
    inputs: [{ name: "merchant", type: "address" }],
    outputs: [
      { name: "treasury",       type: "address" },
      { name: "feeReceiver",    type: "address" },
      { name: "feeBps",         type: "uint16"  },
      { name: "dailyLimitUsd6", type: "uint256" },
      { name: "registered",     type: "bool"    },
      { name: "paused",         type: "bool"    },
    ],
  },
  {
    type: "function",
    name: "paidInvoices",
    stateMutability: "view",
    inputs: [{ name: "invoiceId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "priceFeeds",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "feed",     type: "address" },
      { name: "tokenDec", type: "uint8"   },
      { name: "feedDec",  type: "uint8"   },
    ],
  },
  {
    type: "function",
    name: "quoteUsd6",
    stateMutability: "view",
    inputs: [
      { name: "token",  type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "paidUsd6Today",
    stateMutability: "view",
    inputs: [
      { name: "payer",    type: "address" },
      { name: "merchant", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "sanctionsList",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "error",
    name: "SanctionedAddress",
    inputs: [{ name: "account", type: "address" }],
  },

  // Owner / admin views.
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "ADMIN_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role",    type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "isAdmin",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "secudigate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "secudigateFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint16" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
  },

  // Admin (ADMIN_ROLE) writes.
  {
    type: "function",
    name: "setSecudigate",
    stateMutability: "nonpayable",
    inputs: [{ name: "newReceiver", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setSecudigateFeeBps",
    stateMutability: "nonpayable",
    inputs: [{ name: "newBps", type: "uint16" }],
    outputs: [],
  },
  {
    type: "function",
    name: "pause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "unpause",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "setTokenPriceFeed",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "feed",  type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "removeTokenPriceFeed",
    stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setSanctionsList",
    stateMutability: "nonpayable",
    inputs: [{ name: "oracle", type: "address" }],
    outputs: [],
  },

  // Owner-only writes.
  {
    type: "function",
    name: "addAdmin",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "removeAdmin",
    stateMutability: "nonpayable",
    inputs: [{ name: "account", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "renounceOwnership",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
] as const;

// Minimal ERC20 ABI — approve + allowance + balanceOf.

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount",  type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner",   type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
