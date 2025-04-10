// lib/wagmi.ts
import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, polygon, optimism, arbitrum, sepolia, polygonAmoy } from 'wagmi/chains'
import { createConfig } from 'wagmi'

export const config = getDefaultConfig({
  appName: 'Roy',
  projectId: 'c030d47e0d7fb2f2f7f6d55b59f01117', // Required for WalletConnect (get it at https://cloud.walletconnect.com/)
  chains: [sepolia,polygonAmoy],
  ssr: false,
})
