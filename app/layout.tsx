// app/layout.tsx
import { WalletProvider } from '@/helper/provider/WalletProvider'
import './globals.css'
import { ToastContainer } from 'react-toastify'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          {children}
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            pauseOnHover
            draggable
            theme="light"
          />
        </WalletProvider>
      </body>
    </html>
  )
}
