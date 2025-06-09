'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchRecipesWithFilters, Recipe, getRecipeDetails, SearchParams } from '@/lib/spoonacular';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/contexts/auth-context';
import { 
  saveRecipeToSupabase, 
  unsaveRecipeFromSupabase, 
  checkIsRecipeSaved 
} from '@/lib/supabase/recipes'; 
import { toast } from "sonner";
import Link from 'next/link';
import { RecipeGrid } from '@/components/recipe-grid';
import { Allergen } from '@/lib/allergens';
import { getUserAllergies } from '@/lib/supabase/profiles';
import { RecipeDetailModal } from '@/components/recipe-detail-modal';

const RECIPES_PER_PAGE = 12;

// helper function to check for allergens in a recipe for the modal
function getRecipeAllergenWarningsResults(recipe: Recipe, userAllergies: Allergen[] | undefined): string[] {
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
  return [...new Set(triggeredAllergens)]; // return names of allergens
}


function SearchResultsPageContent() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const searchParams = useSearchParams();

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState<Record<number, boolean>>({});
  
  const [currentOffset, setCurrentOffset] = useState(0);
  const [totalResults, setTotalResults] = useState(0);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [currentUserAllergies, setCurrentUserAllergies] = useState<Allergen[]>([]);

  const query = searchParams.get('query') || undefined;
  const cuisine = searchParams.get('cuisine') || undefined;
  const diet = searchParams.get('diet') || undefined;
  const type = searchParams.get('type') || undefined;
  const maxReadyTimeString = searchParams.get('maxReadyTime');
  const maxReadyTime = maxReadyTimeString ? parseInt(maxReadyTimeString, 10) : undefined;

  const updateSavedRecipeStatus = useCallback(async (recipesToCheck: Recipe[]) => {
    if (!user || recipesToCheck.length === 0) return;

    const checks = recipesToCheck
      .filter(recipe => recipe.id != null)
      .map(recipe => 
        checkIsRecipeSaved(user.id, recipe.id!).then(isSaved => ({ id: recipe.id!, isSaved }))
      );
    const results = await Promise.all(checks);

    setSavedRecipeIds(prevSavedIds => {
      const newSavedIds = new Set<number>(prevSavedIds);
      results.forEach(result => {
        if (result.isSaved) {
          newSavedIds.add(result.id);
        }
      });
      return newSavedIds;
    });
  }, [user]);

  // effect to fetch user allergies
  useEffect(() => {
    async function loadUserAllergies() {
      if (user && !isAuthLoading) {
        try {
          const allergies = await getUserAllergies(user.id);
          setCurrentUserAllergies(allergies);
        } catch (error) {
          console.error("Failed to load user allergies on search results page:", error);
        }
      } else if (!user) {
        setCurrentUserAllergies([]);
      }
    }
    // fetch allergies when auth state is resolved
    if(!isAuthLoading) {
        loadUserAllergies();
    }
  }, [user, isAuthLoading]);

  const fetchRecipes = useCallback(async (offset: number, initialFetch: boolean = false) => {
    if (initialFetch) {
      setLoading(true);
      setRecipes([]); // clear previous results for a new search
      setCurrentOffset(0);
      setTotalResults(0);
    } else {
      setIsFetchingMore(true);
    }
    setError(null);

    const searchApiParams: SearchParams = {
      query,
      cuisine,
      diet,
      type, 
      maxReadyTime,
      number: RECIPES_PER_PAGE,
      offset,
    };

    try {
      const data = await searchRecipesWithFilters(searchApiParams);
      setRecipes(prev => initialFetch ? data.recipes : [...prev, ...data.recipes]);
      setTotalResults(data.totalResults);
      if (user && data.recipes.length > 0) {
        await updateSavedRecipeStatus(data.recipes);
      }
    } catch (err: unknown) { 
      console.error("Failed to fetch search results:", err);
      if (err instanceof Error) { // type guard
        setError(err.message || 'Could not fetch recipes. Please try again.');
      } else {
        setError('Could not fetch recipes. Please try again.');
      }
    } finally {
      if (initialFetch) setLoading(false);
      setIsFetchingMore(false);
      if (initialFetch) setInitialLoadComplete(true);
    }
  }, [query, cuisine, diet, type, maxReadyTime, user, updateSavedRecipeStatus]);

  useEffect(() => {
    // trigger initial fetch on search param change or when allergies load (if user logged in)
    setInitialLoadComplete(false);
    if (!isAuthLoading) { // ensure auth state is resolved before fetching
        fetchRecipes(0, true);
    }
  }, [query, cuisine, diet, type, maxReadyTime, isAuthLoading, fetchRecipes]);


   useEffect(() => {
    if (!initialLoadComplete || recipes.length === 0 || isFetchingMore || recipes.length >= totalResults) return;

    const handleScroll = () => {
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isFetchingMore) {
        if (recipes.length < totalResults) {
          const newOffset = currentOffset + RECIPES_PER_PAGE;
          setCurrentOffset(newOffset);
          fetchRecipes(newOffset, false);
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [initialLoadComplete, recipes, totalResults, isFetchingMore, currentOffset, fetchRecipes]);


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
      setSelectedRecipe(details);
      if (details && user) {
        const isSaved = await checkIsRecipeSaved(user.id, details.id);
        if (isSaved) setSavedRecipeIds(prev => new Set(prev).add(details.id));
      }
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
    if (!recipeToToggle || recipeToToggle.id == null) return;

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
        toast.success(`\"${recipeToToggle.title}\" saved!`);
      }
    } catch (error: unknown) { 
      if (error instanceof Error && error.message && error.message.includes('already saved')) { // Type guard and check message property
        toast.error(error.message || 'Could not update saved status.');
      } else if (error instanceof Error) { // type guard
        toast.error(error.message || 'Could not update saved status.');
      } else {
        toast.error('Could not update saved status.');
      }
       if (error instanceof Error && error.message && error.message.includes('already saved')) { // Type guard and check message property
        setSavedRecipeIds(prev => new Set(prev).add(recipeId)); 
      }
    } finally {
      setIsSaving(prev => ({ ...prev, [recipeId]: false }));
    }
  };

  if (loading && !initialLoadComplete) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-xl font-semibold text-foreground mb-4 sm:text-2xl">Searching for recipes...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <h2 className="text-xl font-semibold text-destructive mb-3 sm:text-2xl">Search Error</h2>
        <p className="text-base text-foreground mb-6 max-w-md sm:text-md">{error}</p>
        <Link href="/search">
          <Button variant="outline">Try a New Search</Button>
        </Link>
      </div>
    );
  }
  
  const hasActiveFilters = query || cuisine || diet || type || maxReadyTime;
  const searchDescription = [
    query ? `results for "${query}"` : "recipes",
    cuisine ? `in ${cuisine} cuisine` : "",
    diet ? `fitting ${diet} diet` : "",
    type ? `of type ${type}` : "",
    maxReadyTime ? `ready in ${maxReadyTime} mins or less` : "",
  ].filter(Boolean).join(", ");


  return (
    <div className="container mx-auto px-4">
      <header className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-2 sm:text-3xl">
          Search Results
        </h1>
        {hasActiveFilters && (
             <p className="text-base text-foreground sm:text-lg">
                Showing {searchDescription}. ({totalResults} found)
            </p>
        )}
         {!hasActiveFilters && recipes.length === 0 && !loading && (
             <p className="text-base text-foreground sm:text-lg">
                Please specify search criteria to find recipes.
            </p>
        )}
      </header>

      {recipes.length === 0 && initialLoadComplete && !loading && !isFetchingMore && (
        <div className="text-center text-foreground py-10">
          <p className="text-lg mb-2 sm:text-xl">No recipes found matching your criteria.</p>
          <p className="text-sm sm:text-base">Try adjusting your search terms or filters.</p>
           <Link href="/search" className="mt-4 inline-block">
            <Button variant="outline">Back to Search</Button>
          </Link>
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
        gridOverallLoading={loading && !initialLoadComplete}
        animationType={'subsequent'} // search results are typically a new set, so use 'subsequent' animation
        userAllergies={currentUserAllergies}
      />

      {isFetchingMore && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
          <p className="ml-3 text-foreground">Loading more recipes...</p>
        </div>
      )}

      {initialLoadComplete && recipes.length > 0 && recipes.length >= totalResults && !isFetchingMore && (
        <p className="text-center text-muted-foreground py-8">You&apos;ve reached the end of the results.</p> // Escaped apostrophe
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
        getRecipeAllergenWarnings={getRecipeAllergenWarningsResults} // pass allergen warning helper
      />
    </div>
  );
}

// wrap with suspense because usesearchparams() needs it
export default function SearchResultsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div><p className="ml-3 text-foreground">Loading search page...</p></div>}>
      <SearchResultsPageContent />
    </Suspense>
  );
}
