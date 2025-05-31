'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/app/contexts/auth-context';
import { getSavedRecipesFromSupabase, unsaveRecipeFromSupabase } from '@/lib/supabase/recipes'; // Assuming Recipe type is also exported or defined here
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import Link from 'next/link'; // For linking to recipe details page if you create one

import { Recipe as SpoonacularRecipe } from '@/lib/spoonacular'; 

export default function SavedRecipesList() {
  const { user } = useAuth();
  const [savedRecipes, setSavedRecipes] = useState<SpoonacularRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSavedRecipes() {
      if (!user) {
        setLoading(false);
        // setError('You must be logged in to see saved recipes.'); // Optional: or just show empty state
        setSavedRecipes([]); // Clear recipes if user logs out
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const recipes = await getSavedRecipesFromSupabase(user.id);
        setSavedRecipes(recipes);
      } catch (err: any) {
        console.error('Failed to fetch saved recipes:', err);
        setError(err.message || 'Could not load your saved recipes.');
      } finally {
        setLoading(false);
      }
    }

    fetchSavedRecipes();
  }, [user]);

  const handleUnsaveRecipe = async (recipeId: number, recipeTitle: string) => {
    if (!user) {
      toast.error('You must be logged in.');
      return;
    }
    try {
      await unsaveRecipeFromSupabase(user.id, recipeId);
      setSavedRecipes(prevRecipes => prevRecipes.filter(recipe => recipe.id !== recipeId));
      toast.success(`"${recipeTitle}" unsaved successfully!`);
    } catch (err: any) {
      console.error('Failed to unsave recipe:', err);
      toast.error(err.message || 'Could not unsave the recipe.');
    }
  };

  if (loading) {
    return (
        <div className="flex justify-center items-center py-10">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
            <p className="ml-3 text-gray-600">Loading your saved recipes...</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="text-center py-10">
            <p className="text-red-500">{error}</p>
            {/* Optional: Add a retry button if applicable */}
        </div>
    );
  }

  if (!user) {
    return (
        <div className="text-center py-10">
            <p className="text-gray-600">Please <Link href="/auth/login" className="text-blue-600 hover:underline">log in</Link> to see your saved recipes.</p>
        </div>
    );
  }

  if (savedRecipes.length === 0) {
    return (
        <div className="text-center py-10">
            <p className="text-gray-600">You haven't saved any recipes yet.</p>
            <Link href="/" className="text-blue-600 hover:underline mt-2 inline-block">
                Discover recipes
            </Link>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-semibold text-gray-800 mb-6">Your Saved Recipes</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {savedRecipes.map(recipe => (
          <Card key={recipe.id} className="flex flex-col overflow-hidden shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="p-0 relative h-48 w-full">
              {recipe.image ? (
                <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <p className="text-gray-500">No image</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4 flex-grow">
              <CardTitle className="text-lg font-semibold mb-2 truncate" title={recipe.title}>{recipe.title}</CardTitle>
              {/* You can add more details here if stored, e.g., recipe.readyInMinutes */}
              {recipe.summary && (
                <p className="text-sm text-gray-600 line-clamp-3" dangerouslySetInnerHTML={{ __html: recipe.summary.length > 100 ? recipe.summary.substring(0,100) + '...': recipe.summary}} />
              )}
            </CardContent>
            <CardFooter className="p-4 border-t">
              {/* 
                If you create a dedicated page for recipe details, link to it:
                <Link href={`/recipe/${recipe.id}`} passHref>
                  <Button variant="outline" className="w-full mb-2">View Details</Button>
                </Link>
              */}
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={() => handleUnsaveRecipe(recipe.id, recipe.title)}
              >
                Unsave
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
