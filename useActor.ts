import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { useEffect, useRef, useState } from "react";
import type { BackendActor } from "../types/backendTypes";
import { useInternetIdentity } from "./useInternetIdentity";

const IC_GATEWAYS = [
  "https://ic0.app",
  "https://boundary.ic0.app",
  "https://icp-api.io",
] as const;

const LOCAL_HOST = "http://localhost:4943";

async function selectOptimalGateway(
  gateways: readonly string[],
): Promise<string> {
  for (const gateway of gateways) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      await fetch(`${gateway}/api/v2/status`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return gateway;
    } catch (_error) {
      // Try next gateway
    }
  }
  return gateways[0];
}

// Lazy-load the IDL to avoid circular imports from auto-generated files
async function getIdlFactory() {
  const mod = await import("../declarations/backend.did");
  return mod.idlFactory;
}

export function useActor(): {
  actor: BackendActor | null;
  isFetching: boolean;
} {
  const { identity, isInitializing } = useInternetIdentity();
  const [actor, setActor] = useState<BackendActor | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    if (isInitializingRef.current || isInitializing) return;

    const initActor = async () => {
      isInitializingRef.current = true;
      setIsFetching(true);

      try {
        const canisterId =
          import.meta.env.CANISTER_ID_BACKEND ||
          import.meta.env.VITE_BACKEND_CANISTER_ID ||
          "ta3s3-myaaa-aaaau-afx4a-cai";

        if (!canisterId) throw new Error("Backend canister ID not configured");

        const network = import.meta.env.VITE_DFX_NETWORK || "ic";
        const host =
          network === "local"
            ? LOCAL_HOST
            : await selectOptimalGateway(IC_GATEWAYS);

        const agent = await HttpAgent.create({
          host,
          identity: identity || undefined,
        });

        if (network === "local") {
          try {
            await agent.fetchRootKey();
          } catch (_) {}
        }

        const idlFactory = await getIdlFactory();
        const newActor = Actor.createActor(idlFactory, {
          agent,
          canisterId,
        }) as unknown as BackendActor;

        setActor(newActor);
      } catch (err) {
        console.error("[useActor] Failed to create backend actor:", err);
        setActor(null);
      } finally {
        setIsFetching(false);
        isInitializingRef.current = false;
      }
    };

    void initActor();
  }, [identity, isInitializing]);

  // Reset actor when identity changes
  useEffect(() => {
    if (!identity && !isInitializing) {
      setActor(null);
      setIsFetching(false);
      isInitializingRef.current = false;
    }
  }, [identity, isInitializing]);

  return { actor, isFetching };
}
