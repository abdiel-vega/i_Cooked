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
          <main className="max-w-7xl mx-auto px-4 py-8">
            {children}
          </main>
          <Toaster /> {/* Add Toaster here */}
        </AuthProvider>
      </body>
    </html>
  )
}