import Link from 'next/link'
import Image from 'next/image' // Import the Image component
import { Home, Search, User, LogIn, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { LogoutButton } from './logout-button'
import { Button } from './ui/button'

export default async function Navbar() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <div className="sticky top-0 z-50 pt-3"> {/* Container for sticky positioning and vertical padding */}
      <nav className="bg-transparent backdrop-blur-md border border-muted-foreground/20 rounded-xl shadow-lg max-w-7xl mx-auto"> {/* Apply new styles here */}
        <div className="max-w-7xl mx-auto py-2 px-4"> {/* This div might be redundant if max-w-7xl is on nav, but kept for structure if needed */}
          <div className="flex justify-between items-center h-16">
            <Link href="/" className="flex items-center font-bold text-3xl text-foreground transition delay-50 duration-300 ease-in-out hover:scale-110 hover:text-accent">
              <Image src="/logo.png" alt="i_Cooked Logo" width={80} height={80} className="h-17 w-17" />
              <span>i_Cooked</span>
            </Link>
            
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2 group relative text-md font-semibold delay-50 duration-200 ease-in-out text-foreground hover:text-accent">
                <Home size={20} />
                <span>Home</span>
                <span className="absolute -bottom-1 left-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
                <span className="absolute -bottom-1 right-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
              </Link>
              <Link href="/search" className="flex items-center gap-2 group relative text-md font-semibold delay-50 duration-200 ease-in-out text-foreground hover:text-accent">
                <Search size={20} />
                <span>Find Recipes</span>
                <span className="absolute -bottom-1 left-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
                <span className="absolute -bottom-1 right-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
              </Link>
              {user ? (
                <>
                  <Link href="/profile" className="flex items-center gap-2 group relative text-md font-semibold delay-50 duration-200 ease-in-out text-foreground hover:text-accent">
                    <User size={20} />
                    <span>Profile</span>
                    <span className="absolute -bottom-1 left-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
                    <span className="absolute -bottom-1 right-1/2 w-0 transition-all h-0.5 bg-accent group-hover:w-3/6"></span>
                  </Link>
                  <LogoutButton />
                </>
              ) : (
                <>
                  <Button asChild variant={'outline'}>
                    <Link href="/auth/login" className="flex items-center gap-2">
                      <LogIn size={26} />
                      <span>Login</span>
                    </Link>
                  </Button>
                  <Button asChild variant={'outline'}>
                    <Link href="/auth/sign-up" className="flex items-center gap-2">
                      <UserPlus size={26} />
                      <span>Sign up</span>
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>
    </div>
  )
}