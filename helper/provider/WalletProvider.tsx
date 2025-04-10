// helper/provider/WalletProvider.tsx or providers/WalletProvider.tsx
'use client'

import { WagmiProvider } from 'wagmi'
import { config } from '@/lib/wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'

import '@rainbow-me/rainbowkit/styles.css'
import { useState } from 'react'

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // React Query client must be stable across renders
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <RainbowKitProvider
          coolMode
          modalSize="compact"
          theme={darkTheme({
            accentColor: '#6366F1',
            borderRadius: 'large',
          })}
        >
          {children}
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}
