import { loadHonchoConfig } from "./honcho-config";
import { HonchoClient } from "./honcho-client";

export async function getHonchoClient(): Promise<{
  client: HonchoClient;
  configuredWorkspace: string | null;
  baseUrl: string;
  isRemote: boolean;
}> {
  const config = await loadHonchoConfig();
  return {
    client: new HonchoClient(config),
    configuredWorkspace: config.workspace,
    baseUrl: config.baseUrl,
    isRemote: config.isRemote,
  };
}
