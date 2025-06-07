'use client'

import { useEffect, useState, useCallback } from 'react'
import { getRandomRecipes, Recipe, getRecipeDetails, fetchPersonalizedRecipes } from '@/lib/spoonacular'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { useAuth } from '@/app/contexts/auth-context'
import { 
  saveRecipeToSupabase, 
  unsaveRecipeFromSupabase, 
  checkIsRecipeSaved,
  getSavedRecipesFromSupabase
} from '@/lib/supabase/recipes' 
import { toast } from "sonner"
import { RecipeGrid } from '@/components/recipe-grid';
import { Allergen, getAllergenQueryValue } from '@/lib/allergens';
import { getUserAllergies } from '@/lib/supabase/profiles';
import { RecipeDetailModal } from '@/components/recipe-detail-modal'; // Import the new modal

const INITIAL_RECIPE_COUNT = 12;
const MORE_RECIPE_COUNT = 8;

// Helper function to analyze user preferences
function analyzeUserPreferences(savedRecipes: Recipe[]): { topCuisines: string[], topDiets: string[] } {
  const cuisineCounts: Record<string, number> = {};
  const dietCounts: Record<string, number> = {};

  savedRecipes.forEach(recipe => {
    recipe.cuisines?.forEach(cuisine => {
      cuisineCounts[cuisine] = (cuisineCounts[cuisine] || 0) + 1;
    });
    recipe.diets?.forEach(diet => {
      dietCounts[diet] = (dietCounts[diet] || 0) + 1;
    });
  });

  const sortedCuisines = Object.entries(cuisineCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([cuisine]) => cuisine);

  const sortedDiets = Object.entries(dietCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([diet]) => diet);

  // Return top 2 cuisines and top 1 diet, for example
  return {
    topCuisines: sortedCuisines.slice(0, 2),
    topDiets: sortedDiets.slice(0, 1),
  };
}

// Define the allergen warning function for the modal, can be shared or specific
function getHomePageRecipeAllergenWarnings(recipe: Recipe, userAllergies: Allergen[] | undefined): string[] {
  if (!userAllergies || userAllergies.length === 0 || !recipe) {
    return [];
  }
  const triggeredAllergens: string[] = [];
  userAllergies.forEach(allergy => {
    switch (allergy) {
      case "Gluten":
        if (recipe.glutenFree === false) triggeredAllergens.push("Gluten");
        break;
      case "Dairy":
        if (recipe.dairyFree === false) triggeredAllergens.push("Dairy");
        break;
      case "Wheat":
        if (recipe.glutenFree === false) triggeredAllergens.push("Wheat");
        break;
    }
  });
  return [...new Set(triggeredAllergens)];
}


export default function HomePage() {
  const { user, isLoading: isAuthLoading } = useAuth()
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true) // Page content loading
  const [error, setError] = useState<string | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState<Record<number, boolean>>({});
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [initialLoadAnimationComplete, setInitialLoadAnimationComplete] = useState(false);

  const [userSavedRecipesForAnalysis, setUserSavedRecipesForAnalysis] = useState<Recipe[]>([]);
  const [currentUserAllergies, setCurrentUserAllergies] = useState<Allergen[]>([]);
  const [currentPersonalizedOffset, setCurrentPersonalizedOffset] = useState(0);

  // State to manage loading of initial dependencies
  const [dataDepsStatus, setDataDepsStatus] = useState({
    authResolved: false,
    savedRecipesFetched: false, // True if user exists and fetch is done, or if no user
    allergiesFetched: false,   // True if user exists and fetch is done, or if no user
  });
  const [initialFetchInitiated, setInitialFetchInitiated] = useState(false);


  // Effect for auth resolution
  useEffect(() => {
    if (!isAuthLoading) {
      setDataDepsStatus(prev => ({ ...prev, authResolved: true }));
    }
  }, [isAuthLoading]);

  // Effect to fetch all saved recipes for preference analysis when user logs in
  useEffect(() => {
    async function fetchUserSavedRecipes() {
      if (user) { // Only fetch if user exists
        try {
          const saved = await getSavedRecipesFromSupabase(user.id);
          setUserSavedRecipesForAnalysis(saved);
        } catch (error) {
          console.error("Failed to fetch saved recipes for analysis:", error);
          setUserSavedRecipesForAnalysis([]); // Reset on error
        } finally {
          setDataDepsStatus(prev => ({ ...prev, savedRecipesFetched: true }));
        }
      } else { // No user
        setUserSavedRecipesForAnalysis([]);
        setDataDepsStatus(prev => ({ ...prev, savedRecipesFetched: true }));
      }
    }

    if (!isAuthLoading) { // Ensure auth is resolved before attempting
      fetchUserSavedRecipes();
    }
  }, [user, isAuthLoading]);

  // Effect to fetch user allergies
  useEffect(() => {
    async function loadUserAllergies() {
      if (user) { // Only fetch if user exists
        try {
          const allergiesData = await getUserAllergies(user.id);
          setCurrentUserAllergies(allergiesData);
        } catch (error) {
          console.error("Failed to load user allergies on home page:", error);
          setCurrentUserAllergies([]);
        } finally {
          setDataDepsStatus(prev => ({ ...prev, allergiesFetched: true }));
        }
      } else { // No user
        setCurrentUserAllergies([]);
        setDataDepsStatus(prev => ({ ...prev, allergiesFetched: true }));
      }
    }
    if (!isAuthLoading) { // Ensure auth is resolved
      loadUserAllergies();
    }
  }, [user, isAuthLoading]);


  const updateSavedRecipeStatusForDisplayedRecipes = useCallback(async (recipesToCheck: Recipe[]) => {
    if (!user || recipesToCheck.length === 0) return;
    const newSavedIds = new Set<number>();
    // Create a batch of promises to check saved status concurrently
    const checks = recipesToCheck.map(recipe => 
      recipe.id ? checkIsRecipeSaved(user.id, recipe.id).then(isSaved => ({ id: recipe.id, isSaved })) : Promise.resolve(null)
    );
    const results = await Promise.all(checks);
    results.forEach(result => {
      if (result && result.isSaved && result.id) {
        newSavedIds.add(result.id);
      }
    });
    setSavedRecipeIds(prev => new Set([...Array.from(prev), ...Array.from(newSavedIds)]));
  }, [user]);

  const fetchData = useCallback(async (isInitialLoad: boolean) => {
    if (isInitialLoad) {
      setLoading(true);
      setError(null);
      setInitialLoadAnimationComplete(false);
      // currentPersonalizedOffset is reset based on logic below
    } else { // Loading more
      if (isFetchingMore || !hasMore) return; // isFetchingMore is component state
      setIsFetchingMore(true);
    }

    const recipeCount = isInitialLoad ? INITIAL_RECIPE_COUNT : MORE_RECIPE_COUNT;
    let newRawRecipes: Recipe[] = [];
    let apiTotalResults: number | undefined = undefined;
    let newOffsetForPersonalizedPath: number = isInitialLoad ? 0 : currentPersonalizedOffset;

    const canPersonalize = user && userSavedRecipesForAnalysis.length > 0;
    let preferences: { topCuisines: string[], topDiets: string[] } | null = null;

    if (canPersonalize) {
      preferences = analyzeUserPreferences(userSavedRecipesForAnalysis);
    }
    
    const intoleranceParams = currentUserAllergies.map(allergy => getAllergenQueryValue(allergy));

    const usePersonalizedSearchLogic = preferences && (preferences.topCuisines.length > 0 || preferences.topDiets.length > 0);
    const shouldAttemptPersonalized = usePersonalizedSearchLogic || (user && intoleranceParams.length > 0);


    try {
      if (shouldAttemptPersonalized) {
        const offsetToUse = isInitialLoad ? 0 : currentPersonalizedOffset;
        const result = await fetchPersonalizedRecipes({
          cuisines: preferences?.topCuisines || [],
          diets: preferences?.topDiets || [],
          intolerances: intoleranceParams,
          count: recipeCount + 5, // Fetch a bit more to allow for filtering duplicates
          offset: offsetToUse,
        });
        newRawRecipes = result.recipes;
        apiTotalResults = result.totalResults;
        newOffsetForPersonalizedPath = offsetToUse + result.recipes.length;
      } else {
        newRawRecipes = await getRandomRecipes(recipeCount, undefined, intoleranceParams);
      }

      // De-duplicate newRawRecipes by ID before any further processing
      const seenIdsForRaw = new Set<number>();
      const deDupedNewRawRecipes = newRawRecipes.filter(r => {
        if (r.id == null) return false; 
        if (seenIdsForRaw.has(r.id)) return false;
        seenIdsForRaw.add(r.id);
        return true;
      });
      newRawRecipes = deDupedNewRawRecipes; // Use the de-duplicated list

      const currentDisplayedRecipeIds = new Set(isInitialLoad ? [] : recipes.map(r => r.id!));
      const uniqueNewRecipes = newRawRecipes
        .filter(r => r.id != null && !currentDisplayedRecipeIds.has(r.id!))
        .slice(0, recipeCount);


      if (isInitialLoad) {
        setRecipes(uniqueNewRecipes);
        if (shouldAttemptPersonalized) {
          setCurrentPersonalizedOffset(newOffsetForPersonalizedPath);
          setHasMore(uniqueNewRecipes.length > 0 && (newOffsetForPersonalizedPath < (apiTotalResults ?? Infinity)));
        } else {
          setHasMore(uniqueNewRecipes.length > 0);
        }
      } else { // Loading more
        setRecipes(prev => [...prev, ...uniqueNewRecipes]);
        if (shouldAttemptPersonalized) {
          setCurrentPersonalizedOffset(newOffsetForPersonalizedPath);
          setHasMore(uniqueNewRecipes.length > 0 && (currentPersonalizedOffset + uniqueNewRecipes.length < (apiTotalResults ?? Infinity)));
        } else {
          setHasMore(uniqueNewRecipes.length > 0);
        }
      }
      
      if (uniqueNewRecipes.length > 0) {
        await updateSavedRecipeStatusForDisplayedRecipes(uniqueNewRecipes);
      }

      if (isInitialLoad && uniqueNewRecipes.length === 0 && (apiTotalResults === 0 || !shouldAttemptPersonalized)) {
         if(shouldAttemptPersonalized) {
            console.log("Personalized/filtered search yielded no new recipes, trying purely random for initial load.");
            const randomFallbackRecipes = await getRandomRecipes(INITIAL_RECIPE_COUNT, undefined, intoleranceParams);
            const trulyUniqueRandom = randomFallbackRecipes.filter(r => r.id != null && !currentDisplayedRecipeIds.has(r.id!)); // currentDisplayedRecipeIds is empty here
            setRecipes(trulyUniqueRandom);
            setHasMore(trulyUniqueRandom.length > 0);
            setCurrentPersonalizedOffset(0); 
            if (trulyUniqueRandom.length > 0) {
                await updateSavedRecipeStatusForDisplayedRecipes(trulyUniqueRandom);
            }
         }
      }

    } catch (err: any) {
      console.error("Failed to fetch recipes:", err);
      setError(err.message || 'Could not fetch recipes.');
      setHasMore(false);
    } finally {
      if (isInitialLoad) {
        setLoading(false);
        setTimeout(() => setInitialLoadAnimationComplete(true), 50);
      } else {
        setIsFetchingMore(false);
      }
    }
  }, [
    user, userSavedRecipesForAnalysis, currentUserAllergies, 
    currentPersonalizedOffset, hasMore, recipes, 
    updateSavedRecipeStatusForDisplayedRecipes, isFetchingMore
  ]);

  // Effect for initial data load, depends on all dependencies being ready
  useEffect(() => {
    const { authResolved, savedRecipesFetched, allergiesFetched } = dataDepsStatus;
    if (authResolved && savedRecipesFetched && allergiesFetched && !initialFetchInitiated) {
      fetchData(true);
      setInitialFetchInitiated(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataDepsStatus, initialFetchInitiated, fetchData]);


  // Effect for infinite scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isFetchingMore && hasMore && !loading) {
        fetchData(false); // Load more
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchData, isFetchingMore, hasMore, loading]); // fetchData is a dependency

  // Effect to update saved status for the selected recipe in the modal
  useEffect(() => {
    if (selectedRecipe && user && selectedRecipe.id && !isAuthLoading) {
      const recipeId = selectedRecipe.id;
      checkIsRecipeSaved(user.id, recipeId).then(isSaved => {
        setSavedRecipeIds(prev => {
          const newSet = new Set(prev);
          if (isSaved) {
            newSet.add(recipeId);
          } else {
            newSet.delete(recipeId);
          }
          return newSet;
        });
      });
    }
  }, [selectedRecipe, user, isAuthLoading]);


  const handleRecipeClick = async (recipeId: number) => {
    setSelectedRecipe(null); 
    setModalLoading(true);
    setModalError(null);
    setIsModalOpen(true);
    try {
      const details = await getRecipeDetails(recipeId);
      if (details) {
        setSelectedRecipe(details);
      } else {
        setModalError('Could not fetch recipe details. The recipe might not exist or there was an API issue.');
      }
    } catch (err: any) {
      console.error(`Failed to load recipe details for ${recipeId}:`, err);
      setModalError(err.message || 'Could not fetch recipe details. Please try again later.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleToggleSaveRecipe = async (recipeToToggle: Recipe) => {
    if (!user) {
      toast.error('Please log in to save recipes.');
      return;
    }
    if (!recipeToToggle || !recipeToToggle.id) {
      toast.error('Cannot save recipe without a valid ID.');
      return;
    }

    const recipeId = recipeToToggle.id;
    setIsSaving(prev => ({ ...prev, [recipeId]: true }));

    try {
      if (savedRecipeIds.has(recipeId)) {
        await unsaveRecipeFromSupabase(user.id, recipeId);
        setSavedRecipeIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(recipeId);
          return newSet;
        });
        toast.success(`"${recipeToToggle.title}" unsaved!`);
      } else {
        await saveRecipeToSupabase(user.id, recipeToToggle);
        setSavedRecipeIds(prev => new Set(prev).add(recipeId));
        toast.success(`"${recipeToToggle.title}" saved!`);
      }
    } catch (error: any) {
      console.error("Failed to toggle save recipe:", error);
      // Check if the error message is about unique constraint violation
      if (error.message && error.message.includes('already saved')) {
        toast.info('This recipe is already in your saved list.');
        // Ensure UI consistency if Supabase says it's saved but client state thought otherwise
        setSavedRecipeIds(prev => new Set(prev).add(recipeId)); 
      } else {
        toast.error(error.message || 'Could not update saved status. Please try again.');
      }
    } finally {
      setIsSaving(prev => ({ ...prev, [recipeId]: false }));
    }
  };

  if (loading && recipes.length === 0 && !initialFetchInitiated) { // Show main loader only if initial fetch not even initiated and no recipes
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-2xl font-semibold text-foreground mb-4">Loading delicious recipes...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <h2 className="text-2xl font-semibold text-destructive mb-3">Oops! Something went wrong.</h2>
        <p className="text-md text-foreground mb-6 max-w-md">{error}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-4xl font-extrabold mb-12 text-center text-foreground tracking-tight">
        {user && userSavedRecipesForAnalysis.length > 0 ? "Recipes For You" : "Prepare Your Next Meal"}
      </h1>
      
      {recipes.length === 0 && !loading && !isFetchingMore && (
        <div className="text-center text-muted-foreground py-10">
            <p className="text-xl mb-2">No recipes found at the moment.</p>
            <p>This might be due to an API key issue or network problem.</p>
        </div>
      )}

      <RecipeGrid
        recipes={recipes}
        savedRecipeIds={savedRecipeIds}
        isSaving={isSaving}
        onRecipeClick={handleRecipeClick}
        onToggleSave={handleToggleSaveRecipe}
        user={user}
        isAuthLoading={isAuthLoading}
        gridOverallLoading={loading && recipes.length === 0}
        animationType={!initialLoadAnimationComplete && !isFetchingMore ? 'initial' : 'subsequent'}
        userAllergies={currentUserAllergies} // Pass allergies to grid
      />

      {isFetchingMore && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
          <p className="ml-3 text-foreground">Loading more recipes...</p>
        </div>
      )}

      {!hasMore && recipes.length > 0 && !isFetchingMore && (
         <p className="text-center text-muted-foreground py-8">You've seen all available recipes for now!</p>
      )}

      {/* Recipe Details Modal */}
      <RecipeDetailModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        selectedRecipe={selectedRecipe}
        modalLoading={modalLoading}
        modalError={modalError}
        user={user}
        isAuthLoading={isAuthLoading}
        savedRecipeIds={savedRecipeIds}
        isSaving={isSaving}
        onToggleSave={handleToggleSaveRecipe}
        currentUserAllergies={currentUserAllergies}
        getRecipeAllergenWarnings={getHomePageRecipeAllergenWarnings}
      />

    </div>
  )
}