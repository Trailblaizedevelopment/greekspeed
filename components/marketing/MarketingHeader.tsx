'use client';

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, User } from "lucide-react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/supabase/auth-context";
import { useProfile } from "@/lib/contexts/ProfileContext";
import { Button } from "@/components/ui/button";
import { CALENDLY_DEMO_URL } from "@/lib/constants/externalLinks";

interface MarketingHeaderProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
  hideNavigation?: boolean; // Hide Features, Pricing, About Us links
}

export function MarketingHeader({ activeSection = "home", onSectionChange, hideNavigation = false }: MarketingHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const { user, signOut } = useAuth();
  const { profile } = useProfile();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);

    // Small delay to let mobile menu close animation complete
    setTimeout(() => {
      // If we're on the landing page, scroll to section
      if (pathname === '/') {
        if (onSectionChange) {
          onSectionChange(sectionId);
        }
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        // Otherwise, navigate to landing page with hash
        router.push(`/#${sectionId}`);
      }
    }, 250); // Wait for menu animation (200ms) to complete
  };

  const handleMobileLogIn = () => {
    setMobileMenuOpen(false);
    router.push('/sign-in');
  };

  const handleRequestDemo = () => {
    setMobileMenuOpen(false);
    window.open(CALENDLY_DEMO_URL, '_blank');
  };

  return (
    <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled
      ? "bg-white/95 backdrop-blur-xl border-b border-gray-200/80 shadow-lg shadow-gray-900/5"
      : "bg-white/90 backdrop-blur-lg border-b border-gray-200/60"
      }`}>
      <div className="max-w-7xl mx-auto px-6 md:px-6 pl-2 md:pl-6">
        <div className="flex items-center justify-between h-16 md:h-18">
          {/* Logo */}
          <div className="flex items-center -ml-2 md:ml-0">
            <Link href="/" className="flex items-center">
              <img
                src="/logo.png"
                alt="Trailblaize logo"
                className="h-28 w-auto max-h-full max-w-[448px] object-contain transition-all duration-300 hover:opacity-90"
              />
            </Link>
          </div>

          {/* Right Side: Navigation + Auth Button */}
          <div className="hidden md:flex items-center gap-24 ml-auto">
            {/* Desktop Navigation */}
            {!hideNavigation && (
              <div className="flex items-center space-x-24">
                {[
                  { id: "features", label: "Features" },
                  { id: "pricing", label: "Pricing" },
                  { id: "demo", label: "Request a Demo", isAction: true },
                ].map(({ id, label, isAction }) => (
                  isAction ? (
                    <button
                      key={id}
                      onClick={handleRequestDemo}
                      className="text-sm font-medium font-sans text-slate-950 hover:text-slate-900 hover:bg-gray-100 rounded-full px-4 py-2 transition-all"
                    >
                      {label}
                    </button>
                  ) : (
                    <button
                      key={id}
                      onClick={() => scrollToSection(id)}
                      className="text-sm font-medium font-sans text-slate-950 hover:text-slate-900 hover:bg-gray-100 rounded-full px-4 py-2 transition-all"
                    >
                      {label}
                    </button>
                  )
                ))}
                {/* Dashboard link for authenticated users */}
                {user && (
                  <Link
                    href="/dashboard"
                    className="text-sm font-semibold font-sans text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-full px-4 py-2 transition-all"
                  >
                    Dashboard
                  </Link>
                )}
              </div>
            )}

            {/* Auth Button - Only Log In */}
            <div className="flex items-center">
              {!user ? (
                <Link href="/sign-in">
                  <Button
                    className="
                      w-36
                      px-4 py-3
                      bg-black 
                      hover:bg-gray-900 
                      rounded-xl
                      inline-flex
                      justify-center
                      items-center
                      gap-2
                      text-white 
                      text-base
                      font-medium
                      font-sans
                      leading-6
                      transition-all duration-200
                      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                    "
                    size="sm"
                  >
                    Log In
                  </Button>
                </Link>
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors">
                    <User className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium font-sans text-gray-700">
                      {profile?.first_name || user.email?.split('@')[0]}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => signOut()}
                    className="hover:text-gray-900 hover:bg-gray-100/50 font-sans rounded-full"
                    size="sm"
                  >
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2.5 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors relative"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="md:hidden bg-white/95 backdrop-blur-xl border-t border-gray-200"
          >
            <div className="px-6 py-5 space-y-1 flex flex-col items-center">
              {/* Mobile Navigation */}
              <>
                {[
                  { id: "features", label: "Features" },
                  { id: "pricing", label: "Pricing" },
                  { id: "demo", label: "Request a Demo", isAction: true },
                ].map(({ id, label, isAction }) => (
                  isAction ? (
                    <button
                      key={id}
                      onClick={handleRequestDemo}
                      className="block w-full text-center py-3 px-6 rounded-full text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-all font-medium"
                    >
                      {label}
                    </button>
                  ) : (
                    <button
                      key={id}
                      onClick={() => scrollToSection(id)}
                      className="block w-full text-center py-3 px-6 rounded-full text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-all font-medium"
                    >
                      {label}
                    </button>
                  )
                ))}
                {user && (
                  <Link
                    href="/dashboard"
                    className="block w-full text-center py-3 px-6 rounded-full text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-all font-medium"
                  >
                    Dashboard
                  </Link>
                )}
              </>
              {!user ? (
                <div className="pt-4 border-t border-gray-200 mt-4 flex justify-center w-full">
                  <Button
                    onClick={handleMobileLogIn}
                    className="
                      w-36
                      px-4 py-3
                      bg-black hover:bg-gray-900
                      rounded-xl
                      inline-flex
                      justify-center
                      items-center
                      gap-2
                      text-white 
                      text-base
                      font-medium
                      font-sans
                      leading-6
                      transition-all duration-200
                      focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500
                    "
                    size="lg"
                  >
                    Log In
                  </Button>
                </div>
              ) : (
                <div className="pt-4 border-t border-gray-200 mt-4 flex flex-col items-center gap-3 w-full">
                  <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 hover:bg-gray-100 transition-colors">
                    <User className="h-4 w-4 text-gray-600" />
                    <span className="text-sm font-medium font-sans text-gray-700">
                      {profile?.first_name || user.email?.split('@')[0]}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => signOut()}
                    className="hover:text-gray-900 hover:bg-gray-100/50 font-sans rounded-full"
                    size="sm"
                  >
                    Sign Out
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}