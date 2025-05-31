"use client";

import { useAuth } from '../contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button'; // Assuming you have a Button component
import SavedRecipesList from '@/components/saved-recipes-list'; // Import the new component
import { useEffect } from 'react';

export default function ProfilePage() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // If auth is still loading, don't do anything yet.
    if (isLoading) return;
    // If auth has loaded and there's no user, redirect to login.
    if (!user) {
      router.push('/auth/login');
    }
  }, [user, isLoading, router]);

  const handleLogout = async () => {
    try {
      await logout(); // This should handle Supabase signout and update context
      // The AuthProvider's onAuthStateChange should redirect or update UI, 
      // but an explicit push can be a fallback.
      router.push('/auth/login'); 
    } catch (error) {
      console.error('Logout failed:', error);
      // Optionally, show an error to the user
    }
  };

  // Display a loading message while checking auth state or if user is null (before redirect)
  if (isLoading || !user) {
    return (
      <div className="flex justify-center items-center min-h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="ml-4 text-gray-600">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 pb-4 border-b">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Your Profile</h1>
          {user && user.email && (
            <p className="text-md text-gray-600 mt-1">Welcome, {user.email}</p>
          )}
        </div>
        <Button
          onClick={handleLogout}
          variant="outline"
          className="mt-4 sm:mt-0"
        >
          Logout
        </Button>
      </div>
      
      {/* Display Saved Recipes */}
      <SavedRecipesList />

    </div>
  );
}