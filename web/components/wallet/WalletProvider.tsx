"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { StellarWalletsKit as Kit } from "@creit.tech/stellar-wallets-kit";
import { config } from "@/lib/config";
import { toHodlError } from "@/lib/hodl/errors";
import type { SignFn } from "@/lib/stellar/tx";

type KitClass = typeof Kit;

interface WalletContext {
  /** Connected account, or null. */
  address: string | null;
  /** The kit has loaded and restored any saved session. */
  ready: boolean;
  connecting: boolean;
  /** false: the wallet reports another network. null: the wallet can't tell us. */
  onTestnet: boolean | null;
  connect: () => Promise<string | null>;
  disconnect: () => Promise<void>;
  sign: SignFn;
}

const Ctx = createContext<WalletContext | null>(null);

/** Wallets named in the architecture doc: Freighter, xBull, Lobstr, Albedo, Hana. */
async function loadKit(): Promise<KitClass> {
  const [kit, freighter, xbull, lobstr, albedo, hana] = await Promise.all([
    import("@creit.tech/stellar-wallets-kit"),
    import("@creit.tech/stellar-wallets-kit/modules/freighter"),
    import("@creit.tech/stellar-wallets-kit/modules/xbull"),
    import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
    import("@creit.tech/stellar-wallets-kit/modules/albedo"),
    import("@creit.tech/stellar-wallets-kit/modules/hana"),
  ]);
  kit.StellarWalletsKit.init({
    modules: [
      new freighter.FreighterModule(),
      new xbull.xBullModule(),
      new lobstr.LobstrModule(),
      new albedo.AlbedoModule(),
      new hana.HanaModule(),
    ],
    // The kit defaults to Mainnet.
    network: kit.Networks.TESTNET,
    theme: {
      ...kit.SwkAppDarkTheme,
      background: "#0C0F0D",
      "background-secondary": "#121613",
      "foreground-strong": "#EDEFEA",
      foreground: "#EDEFEA",
      "foreground-secondary": "#9CA39D",
      primary: "#5BF0B0",
      "primary-foreground": "#060807",
      danger: "#FF8A7A",
      border: "rgba(255, 255, 255, 0.08)",
      "border-radius": "18px",
      "font-family": "var(--font-geist), system-ui, sans-serif",
    },
    authModal: { showInstallLabel: true },
  });
  return kit.StellarWalletsKit;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const kit = useRef<KitClass | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [onTestnet, setOnTestnet] = useState<boolean | null>(null);

  const checkNetwork = useCallback(async () => {
    try {
      const { networkPassphrase } = await kit.current!.getNetwork();
      setOnTestnet(networkPassphrase === config.networkPassphrase);
    } catch {
      setOnTestnet(null); // only Freighter reports its network
    }
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    (async () => {
      const [K, { KitEventType }] = await Promise.all([loadKit(), import("@creit.tech/stellar-wallets-kit")]);
      if (cancelled) return;
      kit.current = K;
      unsubscribe = K.on(KitEventType.STATE_UPDATED, (e) => setAddress(e.payload.address ?? null));
      try {
        const { address: saved } = await K.getAddress(); // restored from localStorage
        setAddress(saved);
        await checkNetwork();
      } catch {
        /* nothing connected yet */
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [checkNetwork]);

  const connect = useCallback(async () => {
    if (!kit.current) return null;
    setConnecting(true);
    try {
      const { address: picked } = await kit.current.authModal();
      setAddress(picked);
      await checkNetwork();
      return picked;
    } catch (err) {
      const e = err as { code?: number };
      if (e?.code === -1) return null; // closed the picker
      throw toHodlError(err);
    } finally {
      setConnecting(false);
    }
  }, [checkNetwork]);

  const disconnect = useCallback(async () => {
    await kit.current?.disconnect();
    setAddress(null);
    setOnTestnet(null);
  }, []);

  const sign = useCallback<SignFn>(
    async (txXdr) => {
      if (!kit.current || !address) throw new Error("Connect a wallet first");
      const { signedTxXdr } = await kit.current.signTransaction(txXdr, {
        networkPassphrase: config.networkPassphrase,
        address,
      });
      return signedTxXdr;
    },
    [address],
  );

  const value = useMemo(
    () => ({ address, ready, connecting, onTestnet, connect, disconnect, sign }),
    [address, ready, connecting, onTestnet, connect, disconnect, sign],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}
