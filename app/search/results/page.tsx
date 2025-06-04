'use client';

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { searchRecipesWithFilters, Recipe, getRecipeDetails, SearchParams } from '@/lib/spoonacular';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useAuth } from '@/app/contexts/auth-context';
import { 
  saveRecipeToSupabase, 
  unsaveRecipeFromSupabase, 
  checkIsRecipeSaved 
} from '@/lib/supabase/recipes'; 
import { toast } from "sonner";
import Link from 'next/link';
// import { RecipeGrid } from '@/components/recipe-grid'; // Not used here, page has its own grid
import { Allergen, getAllergenQueryValue, COMMON_ALLERGENS as ALL_ALLERGENS_LIST } from '@/lib/allergens';
import { getUserAllergies } from '@/lib/supabase/profiles';
import { AlertTriangle, ImageIcon } from 'lucide-react'; // For warning icon

const RECIPES_PER_PAGE = 12;

// Helper function to check for allergens in a recipe (similar to RecipeGrid)
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
      // Add other cases based on available recipe properties
    }
  });
  return [...new Set(triggeredAllergens)]; // Return names of allergens
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
  const maxReadyTimeString = searchParams.get('maxReadyTime');
  const maxReadyTime = maxReadyTimeString ? parseInt(maxReadyTimeString, 10) : undefined;

  const updateSavedRecipeStatus = useCallback(async (recipesToCheck: Recipe[]) => {
    if (!user || recipesToCheck.length === 0) return;
    const newSavedIds = new Set<number>(savedRecipeIds);
    const checks = recipesToCheck
      .filter(recipe => recipe.id != null)
      .map(recipe => 
        checkIsRecipeSaved(user.id, recipe.id!).then(isSaved => ({ id: recipe.id!, isSaved }))
      );
    const results = await Promise.all(checks);
    results.forEach(result => {
      if (result.isSaved) {
        newSavedIds.add(result.id);
      }
    });
    setSavedRecipeIds(newSavedIds);
  }, [user, savedRecipeIds]);

  // Effect to fetch user allergies
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
    // Fetch allergies when auth state is resolved
    if(!isAuthLoading) {
        loadUserAllergies();
    }
  }, [user, isAuthLoading]);

  const fetchRecipes = useCallback(async (offset: number, initialFetch: boolean = false) => {
    if (initialFetch) {
      setLoading(true);
      setRecipes([]); // Clear previous results for a new search
      setCurrentOffset(0);
      setTotalResults(0);
    } else {
      setIsFetchingMore(true);
    }
    setError(null);

    // const intoleranceParams = currentUserAllergies.map(allergy => getAllergenQueryValue(allergy)); // Removed for displaying warnings instead of filtering

    const searchApiParams: SearchParams = {
      query,
      cuisine,
      diet,
      maxReadyTime,
      // intolerances: intoleranceParams, // Removed: No longer filtering by intolerances
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
    } catch (err: any) {
      console.error("Failed to fetch search results:", err);
      setError(err.message || 'Could not fetch recipes. Please try again.');
    } finally {
      if (initialFetch) setLoading(false);
      setIsFetchingMore(false);
      if (initialFetch) setInitialLoadComplete(true);
    }
  }, [query, cuisine, diet, maxReadyTime, user, updateSavedRecipeStatus, currentUserAllergies]);

  useEffect(() => {
    // Trigger initial fetch when search params change OR when allergies are loaded (if user is logged in and auth is resolved)
    setInitialLoadComplete(false);
    if (!isAuthLoading) { // Ensure auth state is resolved before fetching
        fetchRecipes(0, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, cuisine, diet, maxReadyTime, currentUserAllergies, isAuthLoading]); // Removed 'user' as isAuthLoading covers its resolution for allergy fetching. fetchRecipes itself depends on user for saved status.


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
    } catch (err: any) {
      setModalError(err.message || 'Could not fetch recipe details.');
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
        toast.success(`"${recipeToToggle.title}" saved!`);
      }
    } catch (error: any) {
      toast.error(error.message || 'Could not update saved status.');
       if (error.message && error.message.includes('already saved')) {
        setSavedRecipeIds(prev => new Set(prev).add(recipeId)); 
      }
    } finally {
      setIsSaving(prev => ({ ...prev, [recipeId]: false }));
    }
  };

  if (loading && !initialLoadComplete) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-2xl font-semibold text-gray-700 mb-4">Searching for recipes...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <h2 className="text-2xl font-semibold text-red-600 mb-3">Search Error</h2>
        <p className="text-md text-gray-700 mb-6 max-w-md">{error}</p>
        <Link href="/search">
          <Button variant="outline">Try a New Search</Button>
        </Link>
      </div>
    );
  }
  
  const hasActiveFilters = query || cuisine || diet || maxReadyTime;
  const searchDescription = [
    query ? `results for "${query}"` : "recipes",
    cuisine ? `in ${cuisine} cuisine` : "",
    diet ? `fitting ${diet} diet` : "",
    maxReadyTime ? `ready in ${maxReadyTime} mins or less` : "",
  ].filter(Boolean).join(", ");


  return (
    <div className="container mx-auto px-4 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">
          Search Results
        </h1>
        {hasActiveFilters && (
             <p className="text-lg text-gray-600">
                Showing {searchDescription}. ({totalResults} found)
            </p>
        )}
         {!hasActiveFilters && recipes.length === 0 && !loading && (
             <p className="text-lg text-gray-600">
                Please specify search criteria to find recipes.
            </p>
        )}
      </header>

      {recipes.length === 0 && initialLoadComplete && !loading && !isFetchingMore && (
        <div className="text-center text-gray-600 py-10">
          <p className="text-xl mb-2">No recipes found matching your criteria.</p>
          <p>Try adjusting your search terms or filters.</p>
           <Link href="/search" className="mt-4 inline-block">
            <Button variant="outline">Back to Search</Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
        {recipes.map((recipe, index) => {
          const currentRecipeId = recipe.id!;
          const isCurrentlySaving = isSaving[currentRecipeId] || false;
          const isRecipeSaved = savedRecipeIds.has(currentRecipeId);
          const allergenWarnings = getRecipeAllergenWarningsResults(recipe, currentUserAllergies);
          // Basic animation for newly loaded items
          const animationDelay = `${(index % RECIPES_PER_PAGE) * 0.05}s`;

          return (
            <div 
              key={`${currentRecipeId}-${index}`} // Ensure unique key if IDs could repeat across fetches (though unlikely here)
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col group recipe-card-fade-in"
              style={{ animationDelay: animationDelay }} 
            >
              <div 
                className="relative h-56 w-full overflow-hidden cursor-pointer"
                onClick={() => handleRecipeClick(currentRecipeId)}
              >
                {recipe.image ? (
                  <img 
                    src={recipe.image} 
                    alt={recipe.title} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-200 flex flex-col items-center justify-center text-gray-500 p-3 transition-transform duration-500 group-hover:scale-110">
                    <ImageIcon size={40} className="mb-2" />
                    <p className="text-sm text-center font-semibold">{recipe.title}</p>
                  </div>
                )}
              </div>
              
              <div className="p-5 flex flex-col flex-grow">
                <h3 
                  className="font-semibold text-lg mb-2 text-gray-900 truncate group-hover:text-orange-600 transition-colors cursor-pointer"
                  title={recipe.title}
                  onClick={() => handleRecipeClick(currentRecipeId)}
                >
                  {recipe.title}
                </h3>
                {allergenWarnings.length > 0 && (
                  <div className="mb-1 text-xs text-red-600 bg-red-50 p-1 rounded border border-red-200 flex items-center">
                    <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
                    <span className="font-medium">Allergy Alert:</span>&nbsp;
                    <span className="truncate">{allergenWarnings.join(', ')}</span>
                  </div>
                )}
                <div className="mb-2 space-y-1 text-xs text-gray-500">
                  {recipe.readyInMinutes && (
                    <p>Ready in: {recipe.readyInMinutes} mins</p>
                  )}
                  {recipe.servings && (
                    <p>Servings: {recipe.servings}</p>
                  )}
                  {recipe.cuisines && recipe.cuisines.length > 0 && (
                    <p>Cuisine: {recipe.cuisines.join(', ')}</p>
                  )}
                  {recipe.diets && recipe.diets.length > 0 && (
                    <p>Diet: {recipe.diets.join(', ')}</p>
                  )}
                  {/* Displaying boolean dietary flags - you might want to format this differently */}
                  {recipe.vegetarian && <p className="text-green-600">Vegetarian</p>}
                  {recipe.vegan && <p className="text-green-600">Vegan</p>}
                  {recipe.glutenFree && <p className="text-blue-600">Gluten-Free</p>}
                  {recipe.dairyFree && <p className="text-blue-600">Dairy-Free</p>}
                </div>
                <div className="mt-auto pt-3">
                  <Button 
                    variant={isRecipeSaved ? "default" : "outline"}
                    size="sm"
                    className="w-full"
                    onClick={(e) => { e.stopPropagation(); handleToggleSaveRecipe(recipe); }}
                    disabled={isCurrentlySaving || !user || isAuthLoading} 
                  >
                    {isCurrentlySaving ? (isRecipeSaved ? 'Unsaving...' : 'Saving...') : (isRecipeSaved ? 'Unsave' : 'Save')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isFetchingMore && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
          <p className="ml-3 text-gray-600">Loading more recipes...</p>
        </div>
      )}

      {initialLoadComplete && recipes.length > 0 && recipes.length >= totalResults && !isFetchingMore && (
        <p className="text-center text-gray-500 py-8">You've reached the end of the results.</p>
      )}

      {/* Recipe Details Modal (similar to HomePage) */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
          {modalLoading && (
            <div className="flex justify-center items-center h-96">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-orange-500">
                <DialogTitle className="sr-only">Loading Recipe Details</DialogTitle>
              </div>
              <p className="ml-3 text-gray-600">Loading recipe details...</p>
            </div>
          )}
          {modalError && !modalLoading && (
            <div className="p-8 text-center">
              <DialogHeader><DialogTitle className="text-xl font-semibold text-red-600">Error</DialogTitle></DialogHeader>
              <p className="text-gray-700 mt-2 mb-6">{modalError}</p>
              <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
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
                    <img src={selectedRecipe.image} alt={selectedRecipe.title} className="w-full h-full object-cover"/>
                  </div>
                )}

                {/* Allergen Warnings in Modal */}
                {(() => {
                  const allergenWarningsInModal = getRecipeAllergenWarningsResults(selectedRecipe, currentUserAllergies);
                  if (allergenWarningsInModal.length > 0) {
                    return (
                      <div className="mb-4 p-3 rounded-md border border-red-300 bg-red-50 text-red-700 flex items-center text-sm">
                        <AlertTriangle size={18} className="mr-2 flex-shrink-0 text-red-600" />
                        <span className="font-semibold text-red-800">Allergy Alert:</span>&nbsp;
                        <span className="text-red-700">{allergenWarningsInModal.join(', ')}</span>
                      </div>
                    );
                  }
                  return null;
                })()}
                
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
                      {selectedRecipe.extendedIngredients.map(ing => <li key={ing.id || ing.original} className="text-sm">{ing.original}</li>)}
                    </ul>
                  </div>
                )}
                {selectedRecipe.analyzedInstructions && selectedRecipe.analyzedInstructions.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-lg mt-3 mb-2 text-gray-700">Instructions:</h4>
                    {selectedRecipe.analyzedInstructions.map((instrSet, idx) => (
                      <div key={idx} className="mb-4">
                        {instrSet.name && <h5 className="font-medium text-md mb-1 text-gray-700">{instrSet.name}</h5>}
                        <ol className="list-decimal list-inside pl-4 space-y-1.5 text-gray-600 text-sm">
                          {instrSet.steps.map(step => <li key={step.number}>{step.step}</li>)}
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
                    onClick={(e) => { e.stopPropagation(); if(selectedRecipe) handleToggleSaveRecipe(selectedRecipe); }}
                    disabled={!selectedRecipe || isSaving[selectedRecipe.id!] || !user || isAuthLoading}
                >
                  {selectedRecipe && isSaving[selectedRecipe.id!] ? (savedRecipeIds.has(selectedRecipe.id!) ? 'Unsaving...' : 'Saving...') : (selectedRecipe && savedRecipeIds.has(selectedRecipe.id!) ? 'Unsave' : 'Save')}
                </Button>
                <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Wrap with Suspense because useSearchParams() needs it
export default function SearchResultsPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center min-h-screen"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500"></div><p className="ml-3 text-gray-600">Loading search page...</p></div>}>
      <SearchResultsPageContent />
    </Suspense>
  );
}
