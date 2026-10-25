import type { ConnectorProvider } from "@/types/integrations";
import type { FlightSourceAdapter } from "./types";
import { genericJsonAdapter } from "./genericJson";

const ADAPTERS: Record<ConnectorProvider, FlightSourceAdapter> = {
  generic_json: genericJsonAdapter,
};

export function getAdapter(provider: ConnectorProvider | undefined): FlightSourceAdapter {
  const adapter = ADAPTERS[provider ?? "generic_json"];
  if (!adapter) throw new Error(`Unknown connector provider: ${provider}`);
  return adapter;
}

export * from "./types";
export { genericJsonAdapter, validateGenericJsonConfig } from "./genericJson";
