"use client";

import { useAuth } from '../contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import SavedRecipesList from '@/components/saved-recipes-list';
import { useEffect, useState } from 'react';
import { COMMON_ALLERGENS, Allergen } from '@/lib/allergens';
import { getUserAllergies, updateUserAllergies } from '@/lib/supabase/profiles';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';

export default function ProfilePage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedAllergies, setSelectedAllergies] = useState<Set<Allergen>>(new Set());
  const [isSavingAllergies, setIsSavingAllergies] = useState(false);
  const [initialAllergiesLoaded, setInitialAllergiesLoaded] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login?message=Please log in to view your profile.');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function loadUserAllergies() {
      if (user && !initialAllergiesLoaded) { // Only load once initially or if user changes
        try {
          const allergies = await getUserAllergies(user.id);
          setSelectedAllergies(new Set(allergies));
        } catch (error) {
          console.error("Failed to load user allergies:", error);
          toast.error("Could not load your allergy settings.");
        } finally {
          setInitialAllergiesLoaded(true);
        }
      }
    }
    if (!authLoading && user) {
        loadUserAllergies();
    } else if (!user) {
        // Clear allergies if user logs out
        setSelectedAllergies(new Set());
        setInitialAllergiesLoaded(false); // Allow reloading if another user logs in
    }
  }, [user, authLoading, initialAllergiesLoaded]);

  const handleAllergyToggle = async (allergen: Allergen, checked: boolean) => {
    if (!user) return;

    const newAllergiesSet = new Set(selectedAllergies);
    if (checked) {
      newAllergiesSet.add(allergen);
    } else {
      newAllergiesSet.delete(allergen);
    }
    // Optimistic UI update
    setSelectedAllergies(newAllergiesSet); 

    setIsSavingAllergies(true);
    try {
      await updateUserAllergies(user.id, Array.from(newAllergiesSet));
      toast.success("Allergy preferences updated!");
    } catch (error) {
      console.error("Failed to update allergies:", error);
      toast.error("Failed to save allergy preferences. Please try again.");
      // Revert optimistic update by refetching
      try {
        const currentAllergies = await getUserAllergies(user.id);
        setSelectedAllergies(new Set(currentAllergies));
      } catch (fetchError) {
        console.error("Failed to refetch allergies after save error:", fetchError);
      }
    } finally {
      setIsSavingAllergies(false);
    }
  };

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
  if (authLoading || (user && !initialAllergiesLoaded)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p className="ml-3 text-gray-600">Loading profile...</p>
      </div>
    );
  }

  if (!user) {
    // This case should ideally be handled by the redirect, but as a fallback:
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800">Access Denied</h2>
          <p className="mt-2 text-gray-600">
            You must be logged in to view this page.
          </p>
          <Button onClick={() => router.push('/auth/login')} className="mt-4">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <Card className="max-w-2xl mx-auto mb-10">
        <CardHeader>
          <CardTitle className="text-2xl">Your Profile</CardTitle>
          <CardDescription>Manage your account settings and preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-medium mb-1">Email</h3>
            <p className="text-sm text-gray-600">{user.email}</p>
          </div>
          
          <div>
            <h3 className="text-lg font-medium mb-3">Allergy Preferences</h3>
            <p className="text-sm text-gray-500 mb-3">
              Select any allergies you have. Recipes containing these allergens will be filtered out of the home reccomendations,
              and warnings will be displayed while searching recipes.
            </p>
            <div className="space-y-3">
              {COMMON_ALLERGENS.map((allergen) => (
                <div key={allergen} className="flex items-center justify-between p-3 border rounded-md bg-gray-50/50">
                  <Label htmlFor={`allergy-${allergen}`} className="text-sm font-medium text-gray-700">
                    {allergen}
                  </Label>
                  <Switch
                    id={`allergy-${allergen}`}
                    checked={selectedAllergies.has(allergen)}
                    onCheckedChange={(checked) => handleAllergyToggle(allergen, checked)}
                    disabled={isSavingAllergies}
                    aria-label={`Toggle ${allergen} allergy`}
                  />
                </div>
              ))}
            </div>
            {isSavingAllergies && <p className="text-sm text-blue-600 mt-2 animate-pulse">Saving allergy settings...</p>}
          </div>

        </CardContent>
      </Card>

      <SavedRecipesList />
    </div>
  );
}