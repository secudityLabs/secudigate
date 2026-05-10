// Minimal Secudigate ABI — only the events the indexer subscribes to.
// Keep these in sync with src/Secudigate.sol.

export const secudigateEventsAbi = [
  {
    type: "event",
    name: "PaymentReceived",
    inputs: [
      { indexed: true,  name: "invoiceId",     type: "bytes32" },
      { indexed: true,  name: "merchant",      type: "address" },
      { indexed: true,  name: "payer",         type: "address" },
      { indexed: false, name: "token",         type: "address" },
      { indexed: false, name: "grossAmount",   type: "uint256" },
      { indexed: false, name: "platformFee",   type: "uint256" },
      { indexed: false, name: "merchantFee",   type: "uint256" },
      { indexed: false, name: "netToTreasury", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "DepositReceived",
    inputs: [
      { indexed: true,  name: "merchant",      type: "address" },
      { indexed: true,  name: "payer",         type: "address" },
      { indexed: false, name: "token",         type: "address" },
      { indexed: false, name: "paymentRef",    type: "string"  },
      { indexed: false, name: "grossAmount",   type: "uint256" },
      { indexed: false, name: "platformFee",   type: "uint256" },
      { indexed: false, name: "merchantFee",   type: "uint256" },
      { indexed: false, name: "netToTreasury", type: "uint256" },
    ],
  },
] as const;
