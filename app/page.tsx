'use client'

import { useEffect, useState, useCallback } from 'react'
import { getRandomRecipes, Recipe, getRecipeDetails } from '@/lib/spoonacular'
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
  checkIsRecipeSaved 
} from '@/lib/supabase/recipes' 
import { toast } from "sonner"

export default function HomePage() {
  const { user, isLoading: isAuthLoading } = useAuth() // Get user and auth loading state
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true) // Page content loading
  const [error, setError] = useState<string | null>(null)
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalLoading, setModalLoading] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [savedRecipeIds, setSavedRecipeIds] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState<Record<number, boolean>>({}); // Track saving state per recipe
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true); // Assume there are always more random recipes
  const [initialLoadAnimationComplete, setInitialLoadAnimationComplete] = useState(false);

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

  const loadMoreRecipes = useCallback(async () => {
    if (isFetchingMore || !hasMore) return;

    setIsFetchingMore(true);
    try {
      const newRecipes = await getRandomRecipes(8);
      if (newRecipes.length === 0) {
        setHasMore(false);
      } else {
        setRecipes(prevRecipes => {
          const existingRecipeIds = new Set(prevRecipes.map(r => r.id));
          const uniqueNewRecipes = newRecipes.filter(r => !existingRecipeIds.has(r.id));
          // No need to set initialLoadAnimationComplete here, only for initial load
          return [...prevRecipes, ...uniqueNewRecipes];
        });
        if (user) {
          const uniqueNewRecipesForStatusUpdate = newRecipes.filter(nr =>
            !recipes.some(pr => pr.id === nr.id) // Ensure we are using the current `recipes` state here
          );
          if (uniqueNewRecipesForStatusUpdate.length > 0) {
             await updateSavedRecipeStatusForDisplayedRecipes(uniqueNewRecipesForStatusUpdate);
          }
        }
      }
    } catch (err: any) {
      console.error("Failed to load more recipes:", err);
      setError(err.message || 'Could not fetch more recipes. Please try again later.');
    } finally {
      setIsFetchingMore(false);
    }
  }, [isFetchingMore, hasMore, user, updateSavedRecipeStatusForDisplayedRecipes, recipes]); // Added recipes to dependency array

  useEffect(() => {
    async function loadInitialData() {
      if (isAuthLoading) return;

      setLoading(true);
      setError(null);
      setInitialLoadAnimationComplete(false); // Reset for initial load
      try {
        const fetchedRecipes = await getRandomRecipes(12);
        setRecipes(fetchedRecipes);
        if (fetchedRecipes.length < 12) {
          setHasMore(false);
        }
        if (user && fetchedRecipes.length > 0) {
          await updateSavedRecipeStatusForDisplayedRecipes(fetchedRecipes);
        }
      } catch (err: any) {
        console.error("Failed to load recipes:", err);
        setError(err.message || 'Could not fetch recipes. Please ensure your API key is correctly configured and try again.');
      } finally {
        setLoading(false);
        // Trigger animation completion after a slight delay to allow rendering
        setTimeout(() => setInitialLoadAnimationComplete(true), 50); 
      }
    }
    loadInitialData();
  }, [user, isAuthLoading, updateSavedRecipeStatusForDisplayedRecipes]);

  // Effect for infinite scrolling
  useEffect(() => {
    const handleScroll = () => {
      // Trigger loadMoreRecipes when the user is near the bottom of the page
      // window.innerHeight: The height of the browser window's viewport.
      // window.scrollY: The number of pixels that the document has already been scrolled vertically.
      // document.body.offsetHeight: The height of the entire HTML body.
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500 && !isFetchingMore && hasMore && !loading) {
        loadMoreRecipes();
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMoreRecipes, isFetchingMore, hasMore, loading]); // Added loading to dependencies

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

  if (loading || isAuthLoading) { // Check both page loading and auth loading
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
      <h1 className="text-4xl font-extrabold mb-12 text-center text-gray-800 tracking-tight">Discover Your Next Meal</h1>
      
      {recipes.length === 0 && !loading && !isFetchingMore && (
        <div className="text-center text-gray-600 py-10">
            <p className="text-xl mb-2">No recipes found at the moment.</p>
            <p>This might be due to an API key issue or network problem. Please ensure <code>NEXT_PUBLIC_SPOONACULAR_API_KEY</code> is set in your <code>.env.local</code> file.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
        {recipes.map((recipe, index) => {
          const currentRecipeId = recipe.id!;
          const isCurrentlySaving = isSaving[currentRecipeId] || false;
          const isRecipeSaved = savedRecipeIds.has(currentRecipeId);
          
          // Calculate delay: 0.1s for initial load, 0.05s for subsequent loads
          // The initialLoadAnimationComplete flag helps differentiate
          const delayBase = initialLoadAnimationComplete || isFetchingMore ? 0.05 : 0.1;
          // If fetching more, we need to calculate the index relative to the newly added batch.
          // This assumes new recipes are appended. If they can be prepended, logic needs adjustment.
          // For simplicity, if fetching more, apply a minimal delay to all new cards.
          // A more precise stagger for newly loaded items would require knowing how many items were already animated.
          
          // Simpler approach for stagger:
          // Stagger all visible cards on initial load.
          // Stagger only newly added cards when loading more.
          // This requires knowing which cards are "new".
          // For now, let's apply a simpler stagger based on overall index for initial load,
          // and a faster, uniform (or minimal stagger) for newly loaded items.

          let animationDelay = '0s';
          if (!loading && !isFetchingMore) { // Apply to initial set or if not currently fetching more
             animationDelay = `${index * delayBase}s`;
          } else if (isFetchingMore) {
            // For items loaded via "load more", we want them to animate in quickly.
            // To stagger *only* the new items, we'd need to know the count of `prevRecipes`.
            // Let's assume `recipes.length - newRecipes.length` was the previous count.
            // This part is tricky without knowing exactly how `recipes` state updates reflect new items.
            // A simpler way for "load more" is a very short, uniform delay or rely on the CSS class alone.
            // For now, let's apply a small fixed delay to newly appearing cards during fetchMore.
            // This won't be perfectly staggered for *only* new items without more complex index tracking.
            // A simpler approach: if it's part of a "load more" batch, give it a small fixed delay.
            // This part needs refinement if perfect staggering of *only* new items is critical.
            // The current `recipe-card-fade-in` will apply to all, so delay is key.

            // Let's assume new items are appended.
            // The `index` will be its position in the full `recipes` array.
            // If we just loaded 8 new items, and there were 12 before, new items are index 12 through 19.
            // We only want to apply a *new* staggered delay to these.
            // This is complex because the component re-renders all items.
            // The easiest is to apply animation class and a *conditional* style for delay.

            // Let's use a simpler logic: if it's beyond the initial batch size (e.g. 12), apply a faster stagger.
            // This is an approximation.
            if (index >= (recipes.length - 8) && recipes.length > 12) { // Assuming initial load was 12, subsequent are 8
                 animationDelay = `${(index - (recipes.length - 8)) * 0.05}s`;
            } else if (index < 12) { // Initial batch
                 animationDelay = `${index * 0.1}s`;
            }
            // If not initialLoadAnimationComplete, it means it's the first render or a reload.
            if (!initialLoadAnimationComplete && index < 12) {
              animationDelay = `${index * 0.1}s`;
            }

          }


          return (
            <div 
              key={currentRecipeId} 
              className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl sm:columns-2 md:columns-3 lg:columns-4 gap-x-6 transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col group recipe-card-fade-in"
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
                    onClick={(e) => { 
                      e.stopPropagation(); 
                      handleToggleSaveRecipe(recipe); 
                    }}
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