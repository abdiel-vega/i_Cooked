import Link from 'next/link'
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
    <nav className="border-b">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="font-bold text-xl">
            Recipe Hub
          </Link>
          
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 hover:text-gray-600">
              <Home size={20} />
              <span>Home</span>
            </Link>
            <Link href="/search" className="flex items-center gap-2 hover:text-gray-600">
              <Search size={20} />
              <span>Find Recipes</span>
            </Link>
            {user ? (
              <>
                <Link href="/profile" className="flex items-center gap-2 hover:text-gray-600">
                  <User size={20} />
                  <span>Profile</span>
                </Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Button asChild size="sm" variant="ghost">
                  <Link href="/auth/login" className="flex items-center gap-2">
                    <LogIn size={20} />
                    <span>Sign in</span>
                  </Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/auth/sign-up" className="flex items-center gap-2">
                    <UserPlus size={20} />
                    <span>Sign up</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}