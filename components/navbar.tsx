"use client"; 

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {LogoutButton } from "@/components/logout-button"; 
import { Home, Search, User, LogIn, UserPlus, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { usePathname } from 'next/navigation'; 
import { useAuth } from '@/app/contexts/auth-context';

export default function Navbar() {
  const { user, isLoading } = useAuth(); // use authcontext
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMobileMenuOpen(false); // close mobile menu on route change
  }, [pathname]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const NavLink = ({ href, children, className }: { href: string, children: React.ReactNode, className?: string }) => (
    <Link href={href} className={cn("flex items-center gap-2 group relative text-md font-semibold delay-50 duration-200 ease-in-out text-foreground hover:text-accent", className)}>
      {children}
      <span className="absolute -bottom-1 left-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
      <span className="absolute -bottom-1 right-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
    </Link>
  );
  
  const MobileNavLink = ({ href, children, onClick }: { href: string, children: React.ReactNode, onClick?: () => void }) => (
    <Link href={href} onClick={onClick} className="flex items-center gap-3 p-3 rounded-md text-foreground hover:bg-accent hover:text-accent-foreground text-lg">
      {children}
    </Link>
  );


  return (
    <div className="sticky top-0 z-50 pt-3">
      <nav className="bg-background rounded-xl shadow-lg max-w-7xl mx-auto">
        <div className="max-w-7xl mx-auto py-2 px-4">
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center font-bold text-2xl sm:text-3xl text-foreground transition delay-50 duration-300 ease-in-out hover:scale-105">
              <Image src="/logo.png" alt="i_Cooked Logo" width={60} height={60} className="h-12 w-12 sm:h-14 sm:w-14" />
              <span className="ml-1 sm:ml-2">i_Cooked</span>
            </Link>
            
            {/* desktop navigation */}
            <div className="hidden md:flex items-center gap-4 lg:gap-6">
              <NavLink href="/">
                <Home size={20} />
                <span>Home</span>
              </NavLink>
              <NavLink href="/search">
                <Search size={20} />
                <span>Find Recipes</span>
              </NavLink>
              {!isLoading && user ? (
                <>
                  <NavLink href="/profile">
                    <User size={20} />
                    <span>Profile</span>
                  </NavLink>
                  <LogoutButton />
                </>
              ) : !isLoading ? (
                <>
                  <Button asChild variant={'outline'} size="sm">
                    <Link href="/auth/login" className="flex items-center gap-2">
                      <LogIn size={20} />
                      <span>Login</span>
                    </Link>
                  </Button>
                  <Button asChild variant={'outline'} size="sm">
                    <Link href="/auth/sign-up" className="flex items-center gap-2">
                      <UserPlus size={20} />
                      <span>Sign up</span>
                    </Link>
                  </Button>
                </>
              ) : null /* show nothing while loading to prevent flash of incorrect state */}
            </div>

            {/* mobile menu button */}
            <div className="md:hidden">
              <Button onClick={toggleMobileMenu} variant="ghost" size="icon" aria-label="Toggle menu">
                {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
              </Button>
            </div>
          </div>
        </div>

        {/* mobile menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 mx-3 mt-1 bg-background border border-accent rounded-lg shadow-xl p-4 space-y-2">
            <MobileNavLink href="/" onClick={toggleMobileMenu}>
              <Home size={22} /> Home
            </MobileNavLink>
            <MobileNavLink href="/search" onClick={toggleMobileMenu}>
              <Search size={22} /> Find Recipes
            </MobileNavLink>
            {!isLoading && user ? (
              <>
                <MobileNavLink href="/profile" onClick={toggleMobileMenu}>
                  <User size={22} /> Profile
                </MobileNavLink>
                <div className="pt-2 w-full">
                  {/* ensure logoutbutton in mobile also closes menu or is styled appropriately */}
                  <LogoutButton /> 
                </div>
              </>
            ) : !isLoading ? (
              <>
                <MobileNavLink href="/auth/login" onClick={toggleMobileMenu}>
                  <LogIn size={22} /> Login
                </MobileNavLink>
                <MobileNavLink href="/auth/sign-up" onClick={toggleMobileMenu}>
                  <UserPlus size={22} /> Sign up
                </MobileNavLink>
              </>
            ) : null /* show nothing while loading */}
          </div>
        )}
      </nav>
    </div>
  );
}

// helper to combine class names
const cn = (...classes: (string | undefined | null | false)[]) => classes.filter(Boolean).join(' ');
