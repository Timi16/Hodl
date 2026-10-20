/** Contract error codes (contracts/hodl-escrow/src/errors.rs) → plain words. */
export const CONTRACT_ERRORS: Record<number, { name: string; title: string; message: string }> = {
  1: { name: "NotFound", title: "Escrow not found", message: "This escrow doesn't exist." },
  2: {
    name: "InvalidStatus",
    title: "Already settled",
    message: "This escrow has already moved on, so nothing was sent twice. Refresh to see where it is.",
  },
  3: { name: "InvalidAmount", title: "Check the amount", message: "Enter an amount greater than zero." },
  4: { name: "SameParty", title: "That's your own wallet", message: "You can't create an escrow to yourself." },
  5: { name: "DeadlineInPast", title: "Deadline is in the past", message: "Pick a deadline in the future." },
  6: {
    name: "DeadlinePassed",
    title: "Too late to lock",
    message: "The deadline has passed, so this escrow can't be funded any more.",
  },
  7: {
    name: "DeadlineNotReached",
    title: "Not yet",
    message: "You can take the money back once the deadline passes.",
  },
  8: { name: "TokenNotAllowed", title: "Token not supported", message: "Only USDC is supported." },
  9: { name: "TitleTooLong", title: "Title too long", message: "Keep the title under 64 characters." },
  10: { name: "TermsTooLong", title: "Details too long", message: "Keep the details under 500 characters." },
  11: { name: "UpgradesLocked", title: "Upgrades are locked", message: "This contract's code is final." },
  12: { name: "NoPendingAdmin", title: "No admin proposed", message: "There is no admin handover to accept." },
};

export class HodlError extends Error {
  constructor(
    public readonly title: string,
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "HodlError";
  }
}

/** Turns anything a transaction can throw into a HodlError with plain words. */
export function toHodlError(err: unknown): HodlError {
  if (err instanceof HodlError) return err;
  // Wallet kits throw plain { code, message } objects, not Error instances.
  const text =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err ?? "");

  const contract = /Error\(Contract, #(\d+)\)/.exec(text);
  if (contract) {
    const code = Number(contract[1]);
    const known = CONTRACT_ERRORS[code];
    if (known) return new HodlError(known.title, known.message, code);
  }
  if (/Error\(Auth,/.test(text)) {
    return new HodlError("Not allowed", "This wallet can't do that on this escrow.");
  }
  if (/reject|declin|denied|cancel|closed the modal|user refused/i.test(text)) {
    return new HodlError("Cancelled in your wallet", "Nothing was signed, so nothing happened.");
  }
  if (/trustline|op_no_trust|no trust/i.test(text)) {
    return new HodlError(
      "Wallet can't hold USDC yet",
      "Add USDC in Wallet setup first. The money is still safe in the contract.",
    );
  }
  if (/balance|underfunded|insufficient/i.test(text)) {
    return new HodlError("Not enough USDC", "Your wallet doesn't hold enough USDC for this.");
  }
  if (/fetch|network|timeout|ECONN/i.test(text)) {
    return new HodlError("Network trouble", "Couldn't reach Stellar. Check your connection and try again.");
  }
  return new HodlError("Something went wrong", text.split("\n")[0].slice(0, 200) || "Unknown error.");
}
