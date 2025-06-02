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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { useAuth } from '@/app/contexts/auth-context'
import { 
  saveRecipeToSupabase, 
  unsaveRecipeFromSupabase, 
  checkIsRecipeSaved 
} from '@/lib/supabase/recipes' 
import { toast } from "sonner"
// import { RecipeGrid } from '@/components/recipe-grid'; // Not used here
import { Allergen, getAllergenQueryValue } from '@/lib/allergens';
import { getUserAllergies } from '@/lib/supabase/profiles';
import { AlertTriangle } from 'lucide-react'; // For warning icon

const RECIPES_PER_PAGE = 12;

// Helper function to check for allergens in a recipe (similar to RecipeGrid)
function getRecipeAllergenWarningsCuisine(recipe: Recipe, userAllergies: Allergen[] | undefined): string[] {
  if (!userAllergies || userAllergies.length === 0) {
    return [];
  }
  const warnings: string[] = [];
  userAllergies.forEach(allergy => {
    switch (allergy) {
      case "Gluten":
        if (recipe.glutenFree === false) warnings.push("Contains Gluten");
        break;
      case "Dairy":
        if (recipe.dairyFree === false) warnings.push("Contains Dairy");
        break;
      case "Wheat":
        if (recipe.glutenFree === false) warnings.push("May contain Wheat");
        break;
    }
  });
  return [...new Set(warnings)];
}


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
  const [totalResults, setTotalResults] = useState(0);
  const [initialLoadAnimationComplete, setInitialLoadAnimationComplete] = useState(false);
  
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
        // Optionally redirect or show a 404-like message
        // router.push('/search'); // Example redirect
      }
    }
  }, [cuisineSlug, router]);

  // Effect to fetch user allergies
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
    if (offset === 0) setLoading(true); // Full loading state for initial fetch
    else setIsFetchingMore(true); // Specific state for loading more

    setError(null);
    const intoleranceParams = currentUserAllergies.map(allergy => getAllergenQueryValue(allergy));

    try {
      const data = await getRecipesByCuisine(cuisineName, RECIPES_PER_PAGE, offset, intoleranceParams); // Pass intolerances
      setRecipes(prevRecipes => offset === 0 ? data.recipes : [...prevRecipes, ...data.recipes]);
      setTotalResults(data.totalResults);
      
      const newCurrentOffset = offset + data.recipes.length;
      setCurrentOffset(newCurrentOffset);
      // Corrected setHasMore logic: uses newCurrentOffset
      setHasMore(newCurrentOffset < data.totalResults); 
      
      if (user && data.recipes.length > 0) {
        await updateSavedRecipeStatusForDisplayedRecipes(data.recipes);
      }
    } catch (err: any) {
      console.error(`Failed to load recipes for ${cuisineName}:`, err);
      setError(err.message || `Could not fetch recipes for ${cuisineName}. Please try again later.`);
    } finally {
      if (offset === 0) {
        setLoading(false);
        setTimeout(() => setInitialLoadAnimationComplete(true), 50);
      } else {
        setIsFetchingMore(false);
      }
    }
  // Removed recipes.length from dependencies to break the cycle
  }, [user, updateSavedRecipeStatusForDisplayedRecipes, currentUserAllergies]); 

  useEffect(() => {
    if (actualCuisineName && !isAuthLoading) { // Ensure auth state and allergies are potentially loaded
      setRecipes([]);
      setCurrentOffset(0);
      setHasMore(true);
      setInitialLoadAnimationComplete(false);
      fetchCuisineRecipes(actualCuisineName, 0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualCuisineName, isAuthLoading, currentUserAllergies]); // Removed fetchCuisineRecipes, added currentUserAllergies. User is implied by isAuthLoading for allergy fetch.

  const loadMoreRecipes = useCallback(() => {
    if (!isFetchingMore && hasMore && actualCuisineName && !loading) { // Added !loading to prevent concurrent fetches
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
    } catch (error: any) {
      if (error.message && error.message.includes('already saved')) {
        toast.info('This recipe is already in your saved list.');
        setSavedRecipeIds(prev => new Set(prev).add(recipeId)); 
      } else {
        toast.error(error.message || 'Could not update saved status.');
      }
    } finally {
      setIsSaving(prev => ({ ...prev, [recipeId]: false }));
    }
  };

  if (loading || (isAuthLoading && recipes.length === 0)) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <p className="text-2xl font-semibold text-gray-700 mb-4">Loading {actualCuisineName || 'cuisine'} recipes...</p>
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col justify-center items-center min-h-screen text-center px-4">
        <h2 className="text-2xl font-semibold text-red-600 mb-3">Oops! Something went wrong.</h2>
        <p className="text-md text-gray-700 mb-6 max-w-md">{error}</p>
        <Button onClick={() => actualCuisineName && fetchCuisineRecipes(actualCuisineName, 0)}>Try Again</Button>
        <Button variant="link" onClick={() => router.push('/search')} className="mt-2">Back to Search</Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <Button variant="outline" onClick={() => router.back()} className="mb-6 text-sm">
        &larr; Back to Search
      </Button>
      <h1 className="text-4xl font-extrabold mb-12 text-center text-gray-800 tracking-tight">
        {actualCuisineName ? `${actualCuisineName} Recipes` : 'Cuisine Recipes'}
      </h1>
      
      {recipes.length === 0 && !loading && !isFetchingMore && (
        <div className="text-center text-gray-600 py-10">
            <p className="text-xl mb-2">No {actualCuisineName} recipes found.</p>
            <p>Try a different cuisine or check back later!</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
        {recipes.map((recipe, index) => {
          const currentRecipeId = recipe.id!;
          const isCurrentlySaving = isSaving[currentRecipeId] || false;
          const isRecipeSaved = savedRecipeIds.has(currentRecipeId);
          const allergenWarnings = getRecipeAllergenWarningsCuisine(recipe, currentUserAllergies);
          
          const delayBase = initialLoadAnimationComplete || isFetchingMore ? 0.05 : 0.1;
          let animationDelay = '0s';

          if (!loading && !isFetchingMore) {
             animationDelay = `${index * delayBase}s`;
          } else if (isFetchingMore) {
            // Apply faster stagger for newly loaded items
            // This assumes new items are appended and RECIPES_PER_PAGE items were just loaded
            const previousItemCount = recipes.length - RECIPES_PER_PAGE;
            if (index >= previousItemCount && previousItemCount >=0) {
                 animationDelay = `${(index - previousItemCount) * 0.05}s`;
            } else if (index < RECIPES_PER_PAGE) { // Fallback for initial batch if somehow isFetchingMore is true
                 animationDelay = `${index * 0.1}s`;
            }
          }
          if (!initialLoadAnimationComplete && index < RECIPES_PER_PAGE) {
            animationDelay = `${index * 0.1}s`;
          }

          return (
            <div 
              key={currentRecipeId} 
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col group recipe-card-fade-in"
              style={{ animationDelay: (!loading && recipes.length > 0) ? animationDelay : '0s' }} 
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
                  <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                    <p className="text-gray-500 text-sm">Image not available</p>
                  </div>
                )}
              </div>
              
              <div className="p-5 flex flex-col flex-grow">
                <h3 
                  className="font-semibold text-lg mb-2 text-gray-900 truncate group-hover:text-blue-600 transition-colors cursor-pointer"
                  title={recipe.title}
                  onClick={() => handleRecipeClick(currentRecipeId)}
                >
                  {recipe.title}
                </h3>
                {allergenWarnings.length > 0 && (
                  <div className="mb-1 text-xs text-red-600 bg-red-50 p-1 rounded border border-red-200">
                    <div className="flex items-center">
                      <AlertTriangle size={14} className="mr-1 flex-shrink-0" />
                      <span className="font-medium">Alert:</span>
                    </div>
                    <ul className="list-disc list-inside pl-3.5 mt-0.5">
                      {allergenWarnings.map(warning => <li key={warning}>{warning}</li>)}
                    </ul>
                  </div>
                )}
                <div className="mb-2 space-y-1 text-xs text-gray-500">
                  {recipe.readyInMinutes && <p>Ready in: {recipe.readyInMinutes} mins</p>}
                  {recipe.servings && <p>Servings: {recipe.servings}</p>}
                  {/* Cuisine is already known, but API might return sub-cuisines or more specific tags */}
                  {recipe.cuisines && recipe.cuisines.length > 0 && !recipe.cuisines.includes(actualCuisineName || '') && (
                    <p>Also: {recipe.cuisines.join(', ')}</p>
                  )}
                  {recipe.diets && recipe.diets.length > 0 && <p>Diet: {recipe.diets.join(', ')}</p>}
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
                    {isCurrentlySaving ? (isRecipeSaved ? 'Unsaving...' : 'Saving...') : (isRecipeSaved ? 'Unsave Recipe' : 'Save Recipe')}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {isFetchingMore && (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
          <p className="ml-3 text-gray-600">Loading more recipes...</p>
        </div>
      )}

      {!hasMore && recipes.length > 0 && (
        <p className="text-center text-gray-500 py-10">You've reached the end of {actualCuisineName} recipes!</p>
      )}

      {/* Recipe Details Modal (same as homepage) */}
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
              <DialogHeader><DialogTitle className="text-xl font-semibold text-red-600">Error</DialogTitle></DialogHeader>
              <p className="text-gray-700 mt-2 mb-6">{modalError}</p>
              <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
            </div>
          )}
          {selectedRecipe && !modalLoading && !modalError && (
            <>
              <DialogHeader className="p-6 border-b"><DialogTitle className="text-2xl font-bold text-gray-800">{selectedRecipe.title}</DialogTitle></DialogHeader>
              <div className="overflow-y-auto flex-grow p-6 space-y-5">
                {selectedRecipe.image && (
                  <div className="relative h-72 w-full rounded-lg overflow-hidden shadow-md mb-6">
                    <img src={selectedRecipe.image} alt={selectedRecipe.title} className="w-full h-full object-cover"/>
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
                      {selectedRecipe.extendedIngredients.map(ing => <li key={ing.id || ing.name} className="text-sm">{ing.original}</li>)}
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
                  {selectedRecipe && isSaving[selectedRecipe.id!] ? (savedRecipeIds.has(selectedRecipe.id!) ? 'Unsaving...' : 'Saving...') : (selectedRecipe && savedRecipeIds.has(selectedRecipe.id!) ? 'Unsave Recipe' : 'Save Recipe')}
                </Button>
                <DialogClose asChild><Button variant="outline">Close</Button></DialogClose>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
