'use client'
import './globals.css'
import { WalletProvider } from '@/components/WalletProvider'
import { Navbar } from '@/components/Navbar'
import { Toaster } from 'react-hot-toast'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <WalletProvider>
          <Navbar />
          <main>{children}</main>
          <Toaster position="bottom-right" />
        </WalletProvider>
      </body>
    </html>
  )
}