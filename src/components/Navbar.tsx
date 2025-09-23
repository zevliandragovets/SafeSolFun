'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useWallet, useConnection } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { motion, AnimatePresence } from 'framer-motion'
import { Shield, Menu, X, Wallet } from 'lucide-react'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'

export function Navbar() {
  const [mounted, setMounted] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [balance, setBalance] = useState(0)
  const [scrolled, setScrolled] = useState(false)
  const pathname = usePathname()
  const { publicKey, connected } = useWallet()
  const { connection } = useConnection()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Scroll effect for background blur
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY
      setScrolled(scrollTop > 20)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const getBalance = async () => {
      if (connected && publicKey) {
        try {
          const balance = await connection.getBalance(publicKey)
          setBalance(balance / LAMPORTS_PER_SOL)
        } catch (error) {
          console.error('Error fetching balance:', error)
          setBalance(0)
        }
      } else {
        setBalance(0)
      }
    }

    getBalance()
    
    // Update balance every 10 seconds when connected
    let interval: NodeJS.Timeout
    if (connected && publicKey) {
      interval = setInterval(getBalance, 10000)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [connected, publicKey, connection])

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/advanced', label: 'Advanced' },
    { href: '/create', label: 'Create' },
    { href: '/creator-fees', label: 'Creator Fees' }
  ]

  return (
    <>
      {/* Main Navigation Bar */}
      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled 
            ? 'bg-black/95 backdrop-blur-2xl border-b border-[#C0283D]/60 shadow-lg shadow-black/20' 
            : 'bg-black/80 backdrop-blur-xl border-b border-[#C0283D]/30'
        }`}
      >
        <div className="max-w-8xl mx-auto px-3 sm:px-4 md:px-6 lg:px-4">
          <div className="flex items-center h-16 md:h-18 lg:h-16">
            {/* Logo Section */}
            <div className="flex-shrink-0">
              <Link href="/" className="flex items-center space-x-1.5 md:space-x-2 group">
                <motion.div 
                  whileHover={{ scale: 1.0 }}
                  className="flex items-center space-x-1.5 md:space-x-2"
                >
                  <div className="w-10 h-10 md:w-10 md:h-10 bg-gradient-to-br from-[#C0283D] to-black rounded-full flex items-center justify-center">
                    <img src="/logo.svg" alt="" />
                  </div>
                  <span className="text-lg md:text-xl font-bold text-[#C0283D]">
                    SAFESOLfun
                  </span>
                </motion.div>
              </Link>
            </div>

            {/* Desktop Center Navigation */}
            <div className="hidden lg:flex flex-1 justify-center items-center">
              <div className="flex items-center space-x-6 xl:space-x-8 mx-auto">
                {navItems.map((item) => {
                  const isActive = pathname === item.href
                  
                  return (
                    <Link 
                      key={item.href}
                      href={item.href} 
                      className={`relative px-3 py-2 text-sm font-medium transition-all duration-300 ${
                        isActive 
                          ? 'text-white' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      {/* Modern underline for active state */}
                      {isActive && (
                        <motion.div
                          layoutId="navbar-indicator"
                          className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C0283D] rounded-full"
                          initial={{ opacity: 0, scaleX: 0 }}
                          animate={{ opacity: 1, scaleX: 1 }}
                          transition={{ duration: 0.3 }}
                        />
                      )}
                      {/* Hover underline for inactive items */}
                      {!isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C0283D]/40 rounded-full scale-x-0 hover:scale-x-100 transition-transform duration-300" />
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
            
            {/* Desktop Right Side */}
            <div className="hidden lg:flex flex-shrink-0 items-center space-x-3 xl:space-x-4">
              {/* Wallet Balance */}
              {connected && (
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center space-x-2 px-3 py-2 bg-black/60 border border-[#C0283D]/30 rounded-lg backdrop-blur-sm"
                >
                  <Wallet size={16} className="text-[#C0283D]" />
                  <span className="text-sm font-medium text-white">
                    {balance.toFixed(4)} SOL
                  </span>
                </motion.div>
              )}
              
              {mounted ? (
                <WalletMultiButton className="!bg-gradient-to-r !from-[#C0283D] !to-black hover:!from-black hover:!to-[#C0283D] !border-none !rounded-lg !font-medium !text-white !transition-all !duration-200 hover:!scale-[1.02] !text-sm !px-4 !py-2.5" />
              ) : (
                <div className="w-24 h-9 bg-gray-700/50 rounded-lg animate-pulse"></div>
              )}
            </div>

            {/* Mobile/Tablet Right Side */}
            <div className="lg:hidden flex items-center space-x-2 ml-auto">
              {/* Mobile Balance - Show on larger mobiles and tablets */}
              {connected && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="hidden sm:flex items-center space-x-1 px-2 py-1.5 bg-black/60 border border-[#C0283D]/30 rounded-md text-xs backdrop-blur-sm"
                >
                  <Wallet size={12} className="text-[#C0283D]" />
                  <span className="font-medium text-white">
                    {balance.toFixed(2)}
                  </span>
                </motion.div>
              )}
              
              {mounted && (
                <WalletMultiButton className="!bg-gradient-to-r !from-[#C0283D] !to-black !border-none !rounded-md !text-xs !px-2.5 !py-2 !font-medium !text-white !transition-all !duration-200" />
              )}
              
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-gray-400 hover:text-white transition-colors duration-200 rounded-md hover:bg-white/10"
              >
                {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Bar - Hidden on desktop */}
        <div className="lg:hidden border-t border-[#C0283D]/20 bg-black/70 backdrop-blur-md">
          <div className="max-w-7xl mx-auto px-3 sm:px-4">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center space-x-4 sm:space-x-6">
                {navItems.slice(0, 3).map((item) => {
                  const isActive = pathname === item.href
                  
                  return (
                    <Link 
                      key={item.href}
                      href={item.href} 
                      className={`relative px-2 py-1.5 text-xs sm:text-sm font-medium transition-colors ${
                        isActive 
                          ? 'text-[#C0283D]' 
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <span>{item.label}</span>
                      {/* Mobile underline */}
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C0283D] rounded-full" />
                      )}
                    </Link>
                  )
                })}
              </div>
              
              {/* Mobile Balance - Show on small screens */}
              {connected && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="sm:hidden flex items-center space-x-1 px-2 py-1 bg-black/60 border border-[#C0283D]/30 rounded text-xs backdrop-blur-sm"
                >
                  <Wallet size={10} className="text-[#C0283D]" />
                  <span className="font-medium text-white text-xs">
                    {balance.toFixed(1)}
                  </span>
                </motion.div>
              )}
            </div>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Dropdown Menu - Improved for all devices */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="lg:hidden fixed top-16 md:top-18 left-0 right-0 z-40 overflow-hidden bg-black/95 backdrop-blur-xl border-b border-[#C0283D]/30 shadow-2xl"
          >
            <div className="max-w-7xl mx-auto px-4 py-4">
              <div className="space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`relative flex items-center px-4 py-3 rounded-lg transition-all duration-200 font-medium ${
                        isActive 
                          ? 'text-white bg-[#C0283D]/20 border border-[#C0283D]/30 shadow-lg shadow-[#C0283D]/10' 
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <span className="text-base">{item.label}</span>
                      {/* Mobile dropdown indicator */}
                      {isActive && (
                        <div className="absolute left-1 top-0 bottom-0 w-1 bg-[#C0283D] rounded-full" />
                      )}
                    </Link>
                  )
                })}
              </div>
              
              {/* Mobile Balance in Dropdown - Full info */}
              {connected && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 pt-4 border-t border-gray-800/50"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-black/50 border border-[#C0283D]/20 rounded-lg">
                    <div className="flex items-center space-x-2">
                      <Wallet size={16} className="text-[#C0283D]" />
                      <span className="text-sm text-gray-400">Wallet Balance</span>
                    </div>
                    <span className="text-sm font-semibold text-white">
                      {balance.toFixed(4)} SOL
                    </span>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}