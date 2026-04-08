import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { useEffect, useRef, useState } from "react";
import { idlFactory } from "../declarations/backend.did";
import type { governanceBackendInterface } from "../governance-backend";
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

export function useGovernanceActor() {
  const { identity, isInitializing } = useInternetIdentity();
  const [actor, setActor] = useState<governanceBackendInterface | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isInitializingRef = useRef(false);

  useEffect(() => {
    if (isInitializingRef.current || isInitializing) return;

    const initActor = async () => {
      isInitializingRef.current = true;
      setIsFetching(true);
      setError(null);

      try {
        const canisterId =
          import.meta.env.CANISTER_ID_BACKEND ||
          import.meta.env.VITE_BACKEND_CANISTER_ID ||
          import.meta.env.VITE_GOVERNANCE_CANISTER_ID ||
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

        const newActor = Actor.createActor(idlFactory, {
          agent,
          canisterId,
        }) as governanceBackendInterface;

        setActor(newActor);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setActor(null);
      } finally {
        isInitializingRef.current = false;
        setIsFetching(false);
      }
    };

    initActor();
  }, [identity, isInitializing]);

  return {
    actor,
    isFetching,
    error,
    isReady: !isFetching && !!actor && !error,
  };
}
