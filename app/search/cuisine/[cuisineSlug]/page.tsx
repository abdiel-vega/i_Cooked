'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  getRecipesByCuisine, 
  getRecipeDetails, 
  Recipe,
  CUISINES 
} from '@/lib/spoonacular'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/app/contexts/auth-context'
import { 
  saveRecipeToSupabase, 
  unsaveRecipeFromSupabase, 
  checkIsRecipeSaved 
} from '@/lib/supabase/recipes' 
import { toast } from "sonner"
import { RecipeGrid } from '@/components/recipe-grid';
import { Allergen } from '@/lib/allergens';
import { getUserAllergies } from '@/lib/supabase/profiles';
import { RecipeDetailModal } from '@/components/recipe-detail-modal';

const RECIPES_PER_PAGE = 12;

export default function CuisinePage() {
  const params = useParams();
  const router = useRouter();
  const cuisineSlug = params.cuisineSlug as string;

  const { user, isLoading: isAuthLoading } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState<Record<number, boolean>>({});
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [currentOffset, setCurrentOffset] = useState(0);
  
  const [actualCuisineName, setActualCuisineName] = useState<string | null>(null);
  const [currentUserAllergies, setCurrentUserAllergies] = useState<Allergen[]>([]);

  useEffect(() => {
    if (cuisineSlug) {
      const foundCuisine = CUISINES.find(c => c.toLowerCase().replace(/\s+/g, '-') === cuisineSlug);
      if (foundCuisine) {
        setActualCuisineName(foundCuisine);
      } else {
        setError(`Cuisine "${cuisineSlug}" not found.`);
        setLoading(false);
      }
    }
  }, [cuisineSlug, router]);

  // effect to fetch user allergies
  useEffect(() => {
    async function loadUserAllergies() {
      if (user && !isAuthLoading) {
        try {
          const allergies = await getUserAllergies(user.id);
          setCurrentUserAllergies(allergies);
        } catch (error) {
          console.error("Failed to load user allergies on cuisine page:", error);
        }
      } else if (!user) {
        setCurrentUserAllergies([]);
      }
    }
    if(!isAuthLoading){
        loadUserAllergies();
    }
  }, [user, isAuthLoading]);

  const updateSavedRecipeStatusForDisplayedRecipes = useCallback(async (recipesToCheck: Recipe[]) => {
    if (!user || recipesToCheck.length === 0) return;
    const newSavedIds = new Set<number>();
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

  const fetchCuisineRecipes = useCallback(async (cuisineName: string, offset: number) => {
    if (offset === 0) setLoading(true); // full loading state for initial fetch
    else setIsFetchingMore(true); // specific state for loading more

    setError(null);

    try {
      const rawData = await getRecipesByCuisine(cuisineName, RECIPES_PER_PAGE, offset);
      
      // de-duplicate fetched recipes by id
      const seenRecipeIds = new Set<number>();
      const uniqueFetchedRecipes = rawData.recipes.filter(recipe => {
        if (recipe.id == null) return false;
        if (seenRecipeIds.has(recipe.id)) return false;
        seenRecipeIds.add(recipe.id);
        return true;
      });

      const data = { ...rawData, recipes: uniqueFetchedRecipes };
      
      setRecipes(prevRecipes => offset === 0 ? data.recipes : [...prevRecipes, ...data.recipes]);
      
      const newCurrentOffset = offset + data.recipes.length;
      setCurrentOffset(newCurrentOffset);
      // corrected sethasmore logic: uses newcurrentoffset
      setHasMore(newCurrentOffset < data.totalResults); 
      
      if (user && data.recipes.length > 0) {
        await updateSavedRecipeStatusForDisplayedRecipes(data.recipes);
      }
    } catch (err: unknown) { 
      console.error(`Failed to load recipes for ${cuisineName}:`, err);
      if (err instanceof Error) { // type guard
        setError(err.message || `Could not fetch recipes for ${cuisineName}. Please try again later.`);
      } else {
        setError(`Could not fetch recipes for ${cuisineName}. Please try again later.`);
      }
    } finally {
      if (offset === 0) {
        setLoading(false);
      } else {
        setIsFetchingMore(false);
      }
    }
  }, [user, updateSavedRecipeStatusForDisplayedRecipes]); 

  useEffect(() => {
    if (actualCuisineName && !isAuthLoading) { // ensure auth state and allergies are potentially loaded
      setRecipes([]);
      setCurrentOffset(0);
      setHasMore(true);
      fetchCuisineRecipes(actualCuisineName, 0);
    }
  }, [actualCuisineName, isAuthLoading, fetchCuisineRecipes]); // Added fetchCuisineRecipes to dependency array, removed currentUserAllergies

  const loadMoreRecipes = useCallback(() => {
    if (!isFetchingMore && hasMore && actualCuisineName && !loading) { // added !loading to prevent concurrent fetches
      fetchCuisineRecipes(actualCuisineName, currentOffset);
    }
  }, [isFetchingMore, hasMore, actualCuisineName, currentOffset, fetchCuisineRecipes, loading]);

  useEffect(() => {
    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isFetchingMore && hasMore && !loading) {
        loadMoreRecipes();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreRecipes, isFetchingMore, hasMore, loading]);

  useEffect(() => {
    if (selectedRecipe && user && selectedRecipe.id && !isAuthLoading) {
      const recipeId = selectedRecipe.id;
      checkIsRecipeSaved(user.id, recipeId).then(isSaved => {
        setSavedRecipeIds(prev => {
          const newSet = new Set(prev);
          if (isSaved) newSet.add(recipeId);
          else newSet.delete(recipeId);
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
      if (details) setSelectedRecipe(details);
      else setModalError('Could not fetch recipe details.');
    } catch (err: unknown) { 
      if (err instanceof Error) { // type guard
        setModalError(err.message || 'Could not fetch recipe details.');
      } else {
        setModalError('Could not fetch recipe details.');
      }
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
        setSavedRecipeIds(prev => { const newSet = new Set(prev); newSet.delete(recipeId); return newSet; });
        toast.success(`"${recipeToToggle.title}" unsaved!`);
      } else {
        await saveRecipeToSupabase(user.id, recipeToToggle);
        setSavedRecipeIds(prev => new Set(prev).add(recipeId));
        toast.success(`"${recipeToToggle.title}" saved!`);
      }
    } catch (error: unknown) { 
      if (error instanceof Error && error.message && error.message.includes('already saved')) { // Type guard and check message property
        toast.info('This recipe is already in your saved list.');
        setSavedRecipeIds(prev => new Set(prev).add(recipeId)); 
      } else if (error instanceof Error) { // type guard
        toast.error(error.message || 'Could not update saved status.');
      } else {
        toast.error('Could not update saved status.');
      }
    } finally {
      setIsSaving(prev => ({ ...prev, [recipeId]: false }));
    }
  };

  if (loading || (isAuthLoading && recipes.length === 0)) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-xl font-semibold text-foreground mb-4 sm:text-2xl">Loading {actualCuisineName || 'cuisine'} recipes...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <h2 className="text-xl font-semibold text-destructive mb-3 sm:text-2xl">Oops! Something went wrong.</h2>
        <p className="text-base text-foreground mb-6 max-w-md sm:text-md">{error}</p>
        <Button onClick={() => actualCuisineName && fetchCuisineRecipes(actualCuisineName, 0)}>Try Again</Button>
        <Button variant="link" onClick={() => router.push('/search')} className="mt-2">Back to Search</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      <Button onClick={() => router.back()} className="mb-4 text-sm sm:mb-6 sm:text-md">
        &larr; Back to Search
      </Button>
      <h1 className="text-3xl font-extrabold mb-8 text-center text-foreground tracking-tight sm:text-4xl sm:mb-12">
        {actualCuisineName ? `${actualCuisineName} Recipes` : 'Cuisine Recipes'}
      </h1>
      
      {recipes.length === 0 && !loading && !isFetchingMore && (
        <div className="text-center text-foreground py-10">
            <p className="text-lg mb-2 sm:text-xl">No {actualCuisineName} recipes found.</p>
            <p className="text-sm sm:text-base">Try a different cuisine or check back later!</p>
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
        gridOverallLoading={loading}
        animationType={currentOffset === recipes.length && recipes.length <= RECIPES_PER_PAGE && !isFetchingMore ? 'initial' : 'subsequent'} // determine animation type based on load state
        userAllergies={currentUserAllergies}
      />

      {isFetchingMore && (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
          <p className="ml-3 text-foreground">Loading more recipes...</p>
        </div>
      )}

      {!hasMore && recipes.length > 0 && (
        <p className="text-center text-muted-foreground py-10">You&apos;ve reached the end of {actualCuisineName} recipes!</p>
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
        getRecipeAllergenWarnings={getRecipeAllergenWarningsCuisine} // pass allergen warning helper
      />
    </div>
  )
}

// allergen warning function for the modal on this page
function getRecipeAllergenWarningsCuisine(recipe: Recipe, userAllergies: Allergen[] | undefined): string[] {
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
