'use client'

import { useEffect, useState, useCallback } from 'react'
import { getRandomRecipes, Recipe, getRecipeDetails } from '@/lib/spoonacular'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/app/contexts/auth-context'
import { 
  saveRecipeToSupabase, 
  unsaveRecipeFromSupabase, 
  checkIsRecipeSaved,
  getSavedRecipesFromSupabase
} from '@/lib/supabase/recipes' 
import { toast } from "sonner"
import { RecipeGrid } from '@/components/recipe-grid';
import { Allergen } from '@/lib/allergens';
import { getUserAllergies } from '@/lib/supabase/profiles';
import { RecipeDetailModal } from '@/components/recipe-detail-modal';
import Link from 'next/link'

const INITIAL_RECIPE_COUNT = 12;
const MORE_RECIPE_COUNT = 8;

// helper function to analyze user preferences
function analyzeUserPreferences(savedRecipes: Recipe[]): { topCuisines: string[], topDiets: string[], topDishTypes: string[] } {
  const cuisineCounts: Record<string, number> = {};
  const dietCounts: Record<string, number> = {};
  const dishTypeCounts: Record<string, number> = {};

  savedRecipes.forEach(recipe => {
    recipe.cuisines?.forEach(cuisine => {
      cuisineCounts[cuisine] = (cuisineCounts[cuisine] || 0) + 1;
    });
    recipe.diets?.forEach(diet => {
      dietCounts[diet] = (dietCounts[diet] || 0) + 1;
    });
    recipe.dishTypes?.forEach(dishType => {
      dishTypeCounts[dishType] = (dishTypeCounts[dishType] || 0) + 1;
    });
  });

  const sortedCuisines = Object.entries(cuisineCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([cuisine]) => cuisine);

  const sortedDiets = Object.entries(dietCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([diet]) => diet);
  
  const sortedDishTypes = Object.entries(dishTypeCounts)
    .sort(([,a], [,b]) => b - a)
    .map(([dishType]) => dishType);

  // return top preferences, e.g., 2 cuisines, 1 diet, 2 dish types
  return {
    topCuisines: sortedCuisines.slice(0, 2),
    topDiets: sortedDiets.slice(0, 1),
    topDishTypes: sortedDishTypes.slice(0, 2),
  };
}

// allergen warning function for the modal
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
  const [loading, setLoading] = useState(true) // page content loading state
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

  // state for personalized suggestions ui
  const [personalizedSuggestions, setPersonalizedSuggestions] = useState<{ topCuisines: string[], topDiets: string[], topDishTypes: string[] } | null>(null);

  // state to manage loading of initial dependencies
  const [dataDepsStatus, setDataDepsStatus] = useState({
    authResolved: false,
    savedRecipesFetched: false, // true if user exists and fetch is done, or if no user
    allergiesFetched: false,   // true if user exists and fetch is done, or if no user
  });
  const [initialFetchInitiated, setInitialFetchInitiated] = useState(false);


  // effect for auth resolution
  useEffect(() => {
    if (!isAuthLoading) {
      setDataDepsStatus(prev => ({ ...prev, authResolved: true }));
    }
  }, [isAuthLoading]);

  // effect to fetch all saved recipes for preference analysis when user logs in
  useEffect(() => {
    async function fetchUserSavedRecipes() {
      if (user) { // only fetch if user exists
        try {
          const saved = await getSavedRecipesFromSupabase(user.id);
          setUserSavedRecipesForAnalysis(saved);
        } catch (error) {
          console.error("Failed to fetch saved recipes for analysis:", error);
          setUserSavedRecipesForAnalysis([]); // reset on error
        } finally {
          setDataDepsStatus(prev => ({ ...prev, savedRecipesFetched: true }));
        }
      } else { // no user
        setUserSavedRecipesForAnalysis([]);
        setDataDepsStatus(prev => ({ ...prev, savedRecipesFetched: true }));
      }
    }

    if (!isAuthLoading) { // ensure auth is resolved before attempting
      fetchUserSavedRecipes();
    }
  }, [user, isAuthLoading]);

  // effect to fetch user allergies
  useEffect(() => {
    async function loadUserAllergies() {
      if (user) { // only fetch if user exists
        try {
          const allergiesData = await getUserAllergies(user.id);
          setCurrentUserAllergies(allergiesData);
        } catch (error) {
          console.error("Failed to load user allergies on home page:", error);
          setCurrentUserAllergies([]);
        } finally {
          setDataDepsStatus(prev => ({ ...prev, allergiesFetched: true }));
        }
      } else { // no user
        setCurrentUserAllergies([]);
        setDataDepsStatus(prev => ({ ...prev, allergiesFetched: true }));
      }
    }
    if (!isAuthLoading) { // ensure auth is resolved
      loadUserAllergies();
    }
  }, [user, isAuthLoading]);

  // effect to generate personalized suggestions for the new ui section
  useEffect(() => {
    if (user && userSavedRecipesForAnalysis.length > 0) {
      const suggestions = analyzeUserPreferences(userSavedRecipesForAnalysis);
      setPersonalizedSuggestions(suggestions);
    } else {
      setPersonalizedSuggestions(null);
    }
  }, [user, userSavedRecipesForAnalysis]);


  const updateSavedRecipeStatusForDisplayedRecipes = useCallback(async (recipesToCheck: Recipe[]) => {
    if (!user || recipesToCheck.length === 0) return;
    const newSavedIds = new Set<number>();
    // batch check saved status concurrently
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
      setRecipes([]); // clear recipes for a fresh load
    } else {
      if (isFetchingMore || !hasMore) return;
      setIsFetchingMore(true);
    }

    const recipeCount = isInitialLoad ? INITIAL_RECIPE_COUNT : MORE_RECIPE_COUNT;
    let newRawRecipes: Recipe[] = [];

    try {
      // fetch random recipes for the main grid (no allergy filtering here, warnings are shown)
      newRawRecipes = await getRandomRecipes(recipeCount + 5); // fetch a bit more for de-duplication

      const seenIdsForRaw = new Set<number>();
      const deDupedNewRawRecipes = newRawRecipes.filter(r => {
        if (r.id == null) return false;
        if (seenIdsForRaw.has(r.id)) return false;
        seenIdsForRaw.add(r.id);
        return true;
      });

      const currentDisplayedRecipeIds = new Set(isInitialLoad ? [] : recipes.map(r => r.id!));
      const uniqueNewRecipes = deDupedNewRawRecipes
        .filter(r => r.id != null && !currentDisplayedRecipeIds.has(r.id!))
        .slice(0, recipeCount);

      if (isInitialLoad) {
        setRecipes(uniqueNewRecipes);
      } else {
        setRecipes(prev => [...prev, ...uniqueNewRecipes]);
      }
      
      // assume more random recipes are available unless api returns empty/fails.
      // ensure correct count after de-duplication.
      setHasMore(uniqueNewRecipes.length > 0 && uniqueNewRecipes.length === recipeCount); 

      if (uniqueNewRecipes.length > 0) {
        await updateSavedRecipeStatusForDisplayedRecipes(uniqueNewRecipes);
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
    recipes, // keep recipes to check currentdisplayedrecipeids when loading more
    hasMore, 
    isFetchingMore,
    updateSavedRecipeStatusForDisplayedRecipes
  ]);

  // effect for initial data load, depends on all dependencies being ready
  useEffect(() => {
    const { authResolved, savedRecipesFetched, allergiesFetched } = dataDepsStatus;
    if (authResolved && savedRecipesFetched && allergiesFetched && !initialFetchInitiated) {
      fetchData(true);
      setInitialFetchInitiated(true);
    }
  }, [dataDepsStatus, initialFetchInitiated, fetchData]);


  // effect for infinite scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isFetchingMore && hasMore && !loading) {
        fetchData(false); // load more recipes
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [fetchData, isFetchingMore, hasMore, loading]); // fetchdata is a dependency

  // effect to update saved status for the selected recipe in the modal
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
      // check for unique constraint violation (already saved)
      if (error.message && error.message.includes('already saved')) {
        toast.info('This recipe is already in your saved list.');
        // ensure ui consistency if supabase says it's saved but client state thought otherwise
        setSavedRecipeIds(prev => new Set(prev).add(recipeId)); 
      } else {
        toast.error(error.message || 'Could not update saved status. Please try again.');
      }
    } finally {
      setIsSaving(prev => ({ ...prev, [recipeId]: false }));
    }
  };

  if (loading && recipes.length === 0 && !initialFetchInitiated) { // show main loader only if initial fetch not initiated and no recipes
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-xl font-semibold text-foreground mb-4 sm:text-2xl">Loading delicious recipes...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <h2 className="text-xl font-semibold text-destructive mb-3 sm:text-2xl">Oops! Something went wrong.</h2>
        <p className="text-base text-foreground mb-6 max-w-md sm:text-md">{error}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      {/* personalized suggestions section */}
      {user && personalizedSuggestions && (personalizedSuggestions.topCuisines.length > 0 || personalizedSuggestions.topDiets.length > 0 || personalizedSuggestions.topDishTypes.length > 0) && (
        <div className="mb-8 p-4 border border-accent rounded-lg bg-muted no-print">
          <h2 className="text-xl font-semibold mb-3 text-accent">Browse Recipes For You</h2>
          <div className="flex flex-wrap gap-2">
            {personalizedSuggestions.topCuisines.map(cuisine => (
              <Button key={`cuisine-${cuisine}`} variant="outline" size="sm" asChild>
                <Link href={`/search?cuisine=${encodeURIComponent(cuisine.toLowerCase())}`}>{cuisine}</Link>
              </Button>
            ))}
            {personalizedSuggestions.topDiets.map(diet => (
              <Button key={`diet-${diet}`} variant="outline" size="sm" asChild>
                <Link href={`/search?diet=${encodeURIComponent(diet.toLowerCase())}`}>{diet}</Link>
              </Button>
            ))}
            {personalizedSuggestions.topDishTypes.map(dishType => (
              <Button key={`dishType-${dishType}`} variant="outline" size="sm" asChild>
                <Link href={`/search?type=${encodeURIComponent(dishType.toLowerCase())}`}>{dishType}</Link>
              </Button>
            ))}
          </div>
        </div>
      )}

      <h1 className="text-3xl font-extrabold mb-8 text-center text-foreground tracking-tight sm:text-4xl sm:mb-12">
        {/* main page title */}
        Prepare Your Next Meal
      </h1>
      
      {recipes.length === 0 && !loading && !isFetchingMore && (
        <div className="text-center text-muted-foreground py-10">
            <p className="text-lg mb-2 sm:text-xl">No recipes found at the moment.</p>
            <p className="text-sm sm:text-base">This might be due to an API key issue or network problem.</p>
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
        userAllergies={currentUserAllergies} // pass user allergies for displaying warnings on cards
      />

      {isFetchingMore && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
          <p className="ml-3 text-foreground">Loading more recipes...</p>
        </div>
      )}

      {!hasMore && recipes.length > 0 && !isFetchingMore && (
         <p className="text-center text-muted-foreground py-8">You've seen all available random recipes for now!</p>
      )}

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