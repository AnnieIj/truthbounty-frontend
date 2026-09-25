import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http, createStorage, cookieStorage } from "wagmi";
import { optimism, optimismSepolia } from "wagmi/chains";

const envProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// In production a real WalletConnect project ID is mandatory.
// A clearly labelled development-only fallback is allowed so local/CI runs
// do not require third-party credentials.
const projectId =
  envProjectId && envProjectId.trim().length > 0
    ? envProjectId.trim()
    : process.env.NODE_ENV === "production"
      ? (() => {
          throw new Error(
            "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is required in production",
          );
        })()
      : "truthbounty-dev-walletconnect-project-id";

export const supportedChains = [optimism, optimismSepolia] as const;

export const wagmiConfig = getDefaultConfig({
  appName: "TruthBounty",
  projectId,
  chains: supportedChains,
  transports: {
    [optimism.id]: http(process.env.NEXT_PUBLIC_OPTIMISM_RPC_URL),
    [optimismSepolia.id]: http(
      process.env.NEXT_PUBLIC_OPTIMISM_SEPOLIA_RPC_URL,
    ),
  },
  ssr: true,
  storage: createStorage({
    storage: cookieStorage,
  }),
});

export type SupportedChainId = (typeof supportedChains)[number]["id"];

export function isSupportedChain(
  chainId?: number,
): chainId is SupportedChainId {
  if (!chainId) return false;
  return supportedChains.some((chain) => chain.id === chainId);
}
