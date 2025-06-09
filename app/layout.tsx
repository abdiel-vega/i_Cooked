import './globals.css'
import Navbar from '@/components/navbar';
import { AuthProvider } from './contexts/auth-context';
import { Toaster } from '@/components/ui/sonner';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <Navbar />
          {/* adjust padding-top for sticky navbar height */}
          <main className="max-w-7xl mx-auto px-4 py-8 pt-24">
            {children}
          </main>
          <Toaster /> {/* add toaster for notifications */}
        </AuthProvider>
      </body>
    </html>
  )
}