"use client";

import { useAuth } from '../contexts/auth-context'; // Adjust path if necessary
import { useRouter } from 'next/navigation';

export default function ProfilePage() {
  const { isAuthenticated, logout } = useAuth(); // useAuth can still be used for UI elements
  const router = useRouter();

  // The middleware should prevent this page from rendering if not authenticated.
  // However, client-side checks can be useful for UI updates or immediate redirection
  // if the auth state changes while the user is on the page.

  const handleLogout = () => {
    logout();
    // Crucially, ensure the token/cookie checked by the middleware is cleared
    document.cookie = "auth_token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    router.push('/login'); // Or wherever you want to redirect after logout
  };

  // If middleware is effective, isAuthenticated should be true here.
  // You might still want to handle the case where it's false,
  // e.g. if the token expires and the context updates before a page navigation.
  if (!isAuthenticated) {
    // This could be a loading state or a redirect, though middleware should catch most cases.
    // For simplicity, we'll assume middleware has done its job.
    // If you want to be extra safe or handle client-side token expiry:
    // useEffect(() => {
    //   if (!isAuthenticated) {
    //     router.push('/login');
    //   }
    // }, [isAuthenticated, router]);
    // return <p>Loading or redirecting...</p>;
  }

  return (
    <div>
      <h1>Your Profile</h1>
      <p>Welcome! You have accessed a protected route.</p>
      {/* You can display user-specific information here if available in your AuthContext */}
      {isAuthenticated && (
        <button
          onClick={handleLogout}
          style={{ marginTop: '20px', padding: '10px', cursor: 'pointer' }}
        >
          Logout
        </button>
      )}
    </div>
  );
}