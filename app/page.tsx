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

      const currentDisplayedRecipeIds = new Set(isInitialLoad ? [] : recipes.map(r => r.id!));
      const uniqueNewRecipes = newRawRecipes.filter(r => r.id != null && !currentDisplayedRecipeIds.has(r.id!)).slice(0, recipeCount);


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
    currentPersonalizedOffset, hasMore, recipes, // recipes is needed for currentDisplayedRecipeIds for "load more"
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
        <p className="text-2xl font-semibold text-gray-700 mb-4">Loading delicious recipes...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <h2 className="text-2xl font-semibold text-red-600 mb-3">Oops! Something went wrong.</h2>
        <p className="text-md text-gray-700 mb-6 max-w-md">{error}</p>
        <Button onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-extrabold mb-12 text-center text-gray-800 tracking-tight">
        {user && userSavedRecipesForAnalysis.length > 0 ? "Recipes For You" : "Discover Your Next Meal"}
      </h1>
      
      {recipes.length === 0 && !loading && !isFetchingMore && (
        <div className="text-center text-gray-600 py-10">
            <p className="text-xl mb-2">No recipes found at the moment.</p>
            <p>This might be due to an API key issue or network problem. Please ensure <code>NEXT_PUBLIC_SPOONACULAR_API_KEY</code> is set in your <code>.env.local</code> file.</p>
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
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <p className="ml-3 text-gray-600">Loading more recipes...</p>
        </div>
      )}

      {!hasMore && recipes.length > 0 && !isFetchingMore && (
         <p className="text-center text-gray-500 py-8">You've seen all available recipes for now!</p>
      )}

      {/* Recipe Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
          {modalLoading && (
            <div className="flex justify-center items-center h-96">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500">
                <DialogTitle className="sr-only">Loading Recipe Details</DialogTitle>
              </div>
              <p className="ml-3 text-gray-600">Loading recipe details...</p>
            </div>
          )}
          {modalError && !modalLoading && (
            <div className="p-8 text-center">
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold text-red-600">Error</DialogTitle>
              </DialogHeader>
              <p className="text-gray-700 mt-2 mb-6">{modalError}</p>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </div>
          )}
          {selectedRecipe && !modalLoading && !modalError && (
            <>
              <DialogHeader className="p-6 border-b">
                <DialogTitle className="text-2xl font-bold text-gray-800">{selectedRecipe.title}</DialogTitle>
              </DialogHeader>
              <div className="overflow-y-auto flex-grow p-6 space-y-5">
                {selectedRecipe.image && (
                  <div className="relative h-72 w-full rounded-lg overflow-hidden shadow-md mb-6">
                    <img 
                      src={selectedRecipe.image} 
                      alt={selectedRecipe.title} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                {selectedRecipe.summary && (
                    <div>
                        <h4 className="font-semibold text-lg mb-1 text-gray-700">Summary:</h4>
                        <div className="prose prose-sm max-w-none text-gray-600" dangerouslySetInnerHTML={{ __html: selectedRecipe.summary }} />
                    </div>
                )}
                
                {selectedRecipe.extendedIngredients && selectedRecipe.extendedIngredients.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-lg mb-2 text-gray-700">Ingredients:</h4>
                    <ul className="list-disc list-inside pl-4 space-y-1 text-gray-600">
                      {selectedRecipe.extendedIngredients.map(ingredient => (
                        <li key={ingredient.id || ingredient.name} className="text-sm">{ingredient.original}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedRecipe.analyzedInstructions && selectedRecipe.analyzedInstructions.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-lg mt-3 mb-2 text-gray-700">Instructions:</h4>
                    {selectedRecipe.analyzedInstructions.map((instructionSet, index) => (
                      <div key={index} className="mb-4">
                        {instructionSet.name && <h5 className="font-medium text-md mb-1 text-gray-700">{instructionSet.name}</h5>}
                        <ol className="list-decimal list-inside pl-4 space-y-1.5 text-gray-600 text-sm">
                          {instructionSet.steps.map(step => (
                            <li key={step.number}>{step.step}</li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
                {!selectedRecipe.summary && (!selectedRecipe.extendedIngredients || selectedRecipe.extendedIngredients.length === 0) && (!selectedRecipe.analyzedInstructions || selectedRecipe.analyzedInstructions.length === 0) && (
                    <p className="text-gray-600">Detailed information for this recipe is not available.</p>
                )}
              </div>
              <DialogFooter className="p-6 border-t flex justify-end space-x-2">
                <Button 
                    variant={selectedRecipe && savedRecipeIds.has(selectedRecipe.id!) ? "default" : "outline"}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if(selectedRecipe) handleToggleSaveRecipe(selectedRecipe); 
                    }}
                    disabled={!selectedRecipe || isSaving[selectedRecipe.id!] || !user || isAuthLoading}
                >
                  {selectedRecipe && isSaving[selectedRecipe.id!] ? (savedRecipeIds.has(selectedRecipe.id!) ? 'Unsaving...' : 'Saving...') : (selectedRecipe && savedRecipeIds.has(selectedRecipe.id!) ? 'Unsave Recipe' : 'Save Recipe')}
                </Button>
                <DialogClose asChild>
                  <Button variant="outline">Close</Button>
                </DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}