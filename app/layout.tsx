import './globals.css'
import Navbar from '@/components/navbar';
import { AuthProvider } from './contexts/auth-context';
import { Toaster } from '@/components/ui/sonner'; // Import Toaster

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
          {/* Adjusted padding-top to account for sticky navbar height (approx h-16 + py-3 from wrapper = ~4rem + 0.75rem*2 = 5.5rem. Let's use pt-24 for a bit more space) */}
          <main className="max-w-7xl mx-auto px-4 py-8 pt-24">
            {children}
          </main>
          <Toaster /> {/* Add Toaster here */}
        </AuthProvider>
      </body>
    </html>
  )
}