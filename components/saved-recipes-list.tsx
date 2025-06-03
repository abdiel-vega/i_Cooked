'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/app/contexts/auth-context';
import { 
  getSavedRecipesFromSupabase, 
  unsaveRecipeFromSupabase,
  checkIsRecipeSaved, // Import checkIsRecipeSaved
  saveRecipeToSupabase // Import saveRecipeToSupabase
} from '@/lib/supabase/recipes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import Link from 'next/link';
import { 
  Recipe as SpoonacularRecipe, 
  getRecipeDetails // Import getRecipeDetails
} from '@/lib/spoonacular'; 
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle as ModalTitle, // Renamed to avoid conflict with CardTitle
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Allergen } from '@/lib/allergens'; // Import Allergen type
import { getUserAllergies } from '@/lib/supabase/profiles'; // Import getUserAllergies
import { AlertTriangle } from 'lucide-react'; // For warning icon

// Helper function to check for allergens in a recipe for the modal
function getRecipeAllergenWarningsForModal(recipe: SpoonacularRecipe, userAllergies: Allergen[] | undefined): string[] {
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
        // This is a basic check. Spoonacular's `intolerances=Wheat` filter is more reliable if filtering.
        // For display purposes, if glutenFree is false, it might contain wheat.
        if (recipe.glutenFree === false) triggeredAllergens.push("Wheat");
        break;
      // Add more cases if your SpoonacularRecipe type includes other direct boolean flags for allergens
    }
  });
  return [...new Set(triggeredAllergens)]; // Return names of allergens
}


export default function SavedRecipesList() {
  const { user, isLoading: isAuthLoading } = useAuth(); // Added isAuthLoading
  const [savedRecipes, setSavedRecipes] = useState<SpoonacularRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // State for recipe details modal
  const [selectedRecipeDetail, setSelectedRecipeDetail] = useState<SpoonacularRecipe | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [currentUserAllergies, setCurrentUserAllergies] = useState<Allergen[]>([]);
  
  // State for managing saved status within this component, especially for the modal
  const [componentSavedRecipeIds, setComponentSavedRecipeIds] = useState<Set<number>>(new Set());
  const [isSavingRecipe, setIsSavingRecipe] = useState<Record<number, boolean>>({});


  const fetchAndSetInitialSavedIds = useCallback(async (recipes: SpoonacularRecipe[]) => {
    if (!user || recipes.length === 0) return;
    const ids = new Set<number>();
    // Assuming all recipes in `savedRecipes` are indeed saved.
    recipes.forEach(recipe => ids.add(recipe.id));
    setComponentSavedRecipeIds(ids);
  }, [user]);

  useEffect(() => {
    async function fetchSavedRecipes() {
      if (!user) {
        setLoading(false);
        setSavedRecipes([]);
        setComponentSavedRecipeIds(new Set()); // Clear saved IDs
        setIsModalOpen(false); // Close modal if open
        setSelectedRecipeDetail(null);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const recipes = await getSavedRecipesFromSupabase(user.id);
        setSavedRecipes(recipes);
        await fetchAndSetInitialSavedIds(recipes); // Initialize saved IDs based on fetched recipes
      } catch (err: any) {
        console.error('Failed to fetch saved recipes:', err);
        setError(err.message || 'Could not load your saved recipes.');
      } finally {
        setLoading(false);
      }
    }

    if (!isAuthLoading) { // Fetch only when auth state is resolved
        fetchSavedRecipes();
    }
  }, [user, isAuthLoading, fetchAndSetInitialSavedIds]);

  // Effect to fetch user allergies
  useEffect(() => {
    async function loadUserAllergies() {
      if (user && !isAuthLoading) {
        try {
          const allergies = await getUserAllergies(user.id);
          setCurrentUserAllergies(allergies);
        } catch (error) {
          console.error("Failed to load user allergies in saved recipes:", error);
          // Optionally set an error state for allergies
        }
      } else if (!user && !isAuthLoading) { // Clear allergies if user logs out or auth is resolved without user
        setCurrentUserAllergies([]);
      }
    }
    loadUserAllergies();
  }, [user, isAuthLoading]);


  // Effect to update saved status for the selected recipe in the modal
  useEffect(() => {
    if (selectedRecipeDetail && user && selectedRecipeDetail.id && !isAuthLoading) {
      const recipeId = selectedRecipeDetail.id;
      checkIsRecipeSaved(user.id, recipeId).then(isSaved => {
        setComponentSavedRecipeIds(prev => {
          const newSet = new Set(prev);
          if (isSaved) newSet.add(recipeId);
          else newSet.delete(recipeId);
          return newSet;
        });
      });
    }
  }, [selectedRecipeDetail, user, isAuthLoading]);


  const handleUnsaveRecipeCard = async (recipeId: number, recipeTitle: string) => {
    if (!user) {
      toast.error('You must be logged in.');
      return;
    }
    // Optimistically update UI for the main list
    setSavedRecipes(prevRecipes => prevRecipes.filter(recipe => recipe.id !== recipeId));
    setComponentSavedRecipeIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(recipeId);
        return newSet;
    });

    try {
      await unsaveRecipeFromSupabase(user.id, recipeId);
      toast.success(`"${recipeTitle}" unsaved successfully!`);
    } catch (err: any) {
      console.error('Failed to unsave recipe:', err);
      toast.error(err.message || 'Could not unsave the recipe.');
      // Revert UI if error (optional, depends on desired UX)
      // For simplicity, we're not reverting here, assuming unsave usually succeeds if initiated.
      // To revert, you'd need to refetch or add the recipe back to state.
    }
  };
  
  const handleRecipeCardClick = async (recipeId: number) => {
    if (isModalOpen) return; // Prevent opening if already open / loading

    setSelectedRecipeDetail(null);
    setModalLoading(true);
    setModalError(null);
    setIsModalOpen(true);
    try {
      const details = await getRecipeDetails(recipeId); // Fetch fresh details
      if (details) {
        setSelectedRecipeDetail(details);
        // Check and update saved status for the modal
        if (user) {
            const isSaved = await checkIsRecipeSaved(user.id, details.id);
            setComponentSavedRecipeIds(prev => {
                const newSet = new Set(prev);
                if(isSaved) newSet.add(details.id);
                else newSet.delete(details.id);
                return newSet;
            });
        }
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

  const handleToggleSaveRecipeInModal = async (recipeToToggle: SpoonacularRecipe) => {
    if (!user) {
      toast.error('Please log in to save recipes.');
      return;
    }
    if (!recipeToToggle || !recipeToToggle.id) {
      toast.error('Cannot save recipe without a valid ID.');
      return;
    }

    const recipeId = recipeToToggle.id;
    setIsSavingRecipe(prev => ({ ...prev, [recipeId]: true }));

    try {
      if (componentSavedRecipeIds.has(recipeId)) {
        await unsaveRecipeFromSupabase(user.id, recipeId);
        setComponentSavedRecipeIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(recipeId);
          return newSet;
        });
        // Also update the main list if the recipe is unsaved from modal
        setSavedRecipes(prev => prev.filter(r => r.id !== recipeId));
        toast.success(`"${recipeToToggle.title}" unsaved!`);
      } else {
        await saveRecipeToSupabase(user.id, recipeToToggle);
        setComponentSavedRecipeIds(prev => new Set(prev).add(recipeId));
         // Also update the main list if a new recipe is saved from modal (though less likely in "saved list" context)
        if (!savedRecipes.find(r => r.id === recipeId)) {
            setSavedRecipes(prev => [...prev, recipeToToggle]);
        }
        toast.success(`"${recipeToToggle.title}" saved!`);
      }
    } catch (error: any) {
      console.error("Failed to toggle save recipe in modal:", error);
      if (error.message && error.message.includes('already saved')) {
        toast.info('This recipe is already in your saved list.');
        setComponentSavedRecipeIds(prev => new Set(prev).add(recipeId)); 
      } else {
        toast.error(error.message || 'Could not update saved status. Please try again.');
      }
    } finally {
      setIsSavingRecipe(prev => ({ ...prev, [recipeId]: false }));
    }
  };


  if (loading || isAuthLoading && savedRecipes.length === 0) {
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

  if (!user && !isAuthLoading) { // Ensure auth check is complete
    return (
        <div className="text-center py-10">
            <p className="text-gray-600">Please <Link href="/auth/login" className="text-blue-600 hover:underline">log in</Link> to see your saved recipes.</p>
        </div>
    );
  }

  if (savedRecipes.length === 0 && !loading && !isAuthLoading) { // Ensure auth check is complete
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
          <Card 
            key={recipe.id} 
            className="flex flex-col overflow-hidden shadow-lg hover:shadow-xl transition-shadow cursor-pointer group"
            onClick={() => handleRecipeCardClick(recipe.id)}
          >
            <CardHeader className="p-0 relative h-48 w-full">
              {recipe.image ? (
                <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
              ) : (
                <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                  <p className="text-gray-500">No image</p>
                </div>
              )}
            </CardHeader>
            <CardContent className="p-4 flex-grow">
              <CardTitle className="text-lg font-semibold mb-2 truncate group-hover:text-blue-600" title={recipe.title}>{recipe.title}</CardTitle>
              {/* You can add more details here if stored, e.g., recipe.readyInMinutes */}
              {recipe.summary && (
                <p className="text-sm text-gray-600 line-clamp-3" dangerouslySetInnerHTML={{ __html: recipe.summary.length > 100 ? recipe.summary.substring(0,100) + '...': recipe.summary}} />
              )}
            </CardContent>
            <CardFooter className="p-4 border-t">
              <Button 
                variant="destructive" 
                className="w-full"
                onClick={(e) => {
                    e.stopPropagation(); // Prevent card click from triggering modal
                    handleUnsaveRecipeCard(recipe.id, recipe.title);
                }}
              >
                Unsave
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      {/* Recipe Details Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
          {modalLoading && (
            <div className="flex justify-center items-center h-96">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500">
                 <ModalTitle className="sr-only">Loading Recipe Details</ModalTitle>
              </div>
              <p className="ml-3 text-gray-600">Loading recipe details...</p>
            </div>
          )}
          {modalError && !modalLoading && (
            <div className="p-8 text-center">
              <DialogHeader>
                <ModalTitle className="text-xl font-semibold text-red-600">Error</ModalTitle>
              </DialogHeader>
              <p className="text-gray-700 mt-2 mb-6">{modalError}</p>
              <DialogClose asChild>
                <Button variant="outline">Close</Button>
              </DialogClose>
            </div>
          )}
          {selectedRecipeDetail && !modalLoading && !modalError && (
            <>
              <DialogHeader className="p-6 border-b">
                <ModalTitle className="text-2xl font-bold text-gray-800">{selectedRecipeDetail.title}</ModalTitle>
              </DialogHeader>
              <div className="overflow-y-auto flex-grow p-6 space-y-5">
                {selectedRecipeDetail.image && (
                  <div className="relative h-72 w-full rounded-lg overflow-hidden shadow-md mb-6">
                    <img 
                      src={selectedRecipeDetail.image} 
                      alt={selectedRecipeDetail.title} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Allergen Warnings in Modal */}
                {(() => {
                  const allergenWarningsInModal = getRecipeAllergenWarningsForModal(selectedRecipeDetail, currentUserAllergies);
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

                {selectedRecipeDetail.summary && (
                    <div>
                        <h4 className="font-semibold text-lg mb-1 text-gray-700">Summary:</h4>
                        <div className="prose prose-sm max-w-none text-gray-600" dangerouslySetInnerHTML={{ __html: selectedRecipeDetail.summary }} />
                    </div>
                )}
                
                {selectedRecipeDetail.extendedIngredients && selectedRecipeDetail.extendedIngredients.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-lg mb-2 text-gray-700">Ingredients:</h4>
                    <ul className="list-disc list-inside pl-4 space-y-1 text-gray-600">
                      {selectedRecipeDetail.extendedIngredients.map(ingredient => (
                        <li key={ingredient.id || ingredient.name} className="text-sm">{ingredient.original}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedRecipeDetail.analyzedInstructions && selectedRecipeDetail.analyzedInstructions.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-lg mt-3 mb-2 text-gray-700">Instructions:</h4>
                    {selectedRecipeDetail.analyzedInstructions.map((instructionSet, index) => (
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
                {!selectedRecipeDetail.summary && (!selectedRecipeDetail.extendedIngredients || selectedRecipeDetail.extendedIngredients.length === 0) && (!selectedRecipeDetail.analyzedInstructions || selectedRecipeDetail.analyzedInstructions.length === 0) && (
                    <p className="text-gray-600">Detailed information for this recipe is not available.</p>
                )}
              </div>
              <DialogFooter className="p-6 border-t flex justify-end space-x-2">
                <Button 
                    variant={selectedRecipeDetail && componentSavedRecipeIds.has(selectedRecipeDetail.id!) ? "default" : "outline"}
                    onClick={(e) => { 
                        e.stopPropagation(); 
                        if(selectedRecipeDetail) handleToggleSaveRecipeInModal(selectedRecipeDetail); 
                    }}
                    disabled={!selectedRecipeDetail || isSavingRecipe[selectedRecipeDetail.id!] || !user || isAuthLoading}
                >
                  {selectedRecipeDetail && isSavingRecipe[selectedRecipeDetail.id!] ? (componentSavedRecipeIds.has(selectedRecipeDetail.id!) ? 'Unsaving...' : 'Saving...') : (selectedRecipeDetail && componentSavedRecipeIds.has(selectedRecipeDetail.id!) ? 'Unsave Recipe' : 'Save Recipe')}
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
  );
}
