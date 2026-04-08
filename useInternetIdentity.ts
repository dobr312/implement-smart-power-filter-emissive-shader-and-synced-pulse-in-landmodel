// Re-export from the @caffeineai/core-infrastructure package
// This shim preserves all existing relative imports across the codebase
export { useInternetIdentity } from "@caffeineai/core-infrastructure";
export type {
  InternetIdentityContext,
  Status,
} from "@caffeineai/core-infrastructure";
