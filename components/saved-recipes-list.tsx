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
import { Dialog, DialogContent, DialogClose, DialogHeader, DialogFooter, DialogTitle as ModalTitle } from '@/components/ui/dialog'; // For modal title accessibility
import { toast } from 'sonner';
import Link from 'next/link';
import { 
  Recipe as SpoonacularRecipe, 
  getRecipeDetails // Import getRecipeDetails
} from '@/lib/spoonacular'; 
import { Allergen } from '@/lib/allergens'; // Import Allergen type
import { getUserAllergies } from '@/lib/supabase/profiles'; // Import getUserAllergies
import { AlertTriangle, ImageIcon, ShoppingCart } from 'lucide-react'; // For warning icon & shopping cart
import { Checkbox } from "@/components/ui/checkbox"; // Import Checkbox
import { Label } from "@/components/ui/label"; // Import Label
import { RecipeDetailModal } from '@/components/recipe-detail-modal'; // Import the new modal

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


export default function SavedRecipesList({
  selectedRecipeIdsForShoppingList,
  onToggleRecipeForShoppingList,
}: {
  selectedRecipeIdsForShoppingList?: Set<number>;
  onToggleRecipeForShoppingList?: (recipe: SpoonacularRecipe) => void;
}) {
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
        const recipesFromSupabase = await getSavedRecipesFromSupabase(user.id);
        
        // De-duplicate recipesFromSupabase by ID
        const seenRecipeIds = new Set<number>();
        const uniqueRecipes = recipesFromSupabase.filter(recipe => {
          if (recipe.id == null) return false;
          if (seenRecipeIds.has(recipe.id)) {
            console.warn(`Duplicate saved recipe ID ${recipe.id} found and removed from display.`);
            return false;
          }
          seenRecipeIds.add(recipe.id);
          return true;
        });

        setSavedRecipes(uniqueRecipes);
        await fetchAndSetInitialSavedIds(uniqueRecipes); // Initialize saved IDs based on fetched recipes
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
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
            <p className="ml-3 text-foreground">Loading your saved recipes...</p>
        </div>
    );
  }

  if (error) {
    return (
        <div className="text-center py-10">
            <p className="text-destructive">{error}</p>
            {/* Optional: Add a retry button if applicable */}
        </div>
    );
  }

  if (!user && !isAuthLoading) { // Ensure auth check is complete
    return (
        <div className="text-center py-10">
            <p className="text-foreground">Please <Link href="/auth/login" className="text-accent hover:underline">log in</Link> to see your saved recipes.</p>
        </div>
    );
  }

  if (savedRecipes.length === 0 && !loading && !isAuthLoading) { // Ensure auth check is complete
    return (
        <div className="text-center py-10">
            <p className="text-foreground">You haven't saved any recipes yet.</p>
            <Link href="/" className="text-accent hover:underline mt-2 inline-block">
                Discover recipes
            </Link>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-3xl font-semibold text-foreground mb-6">Your Saved Recipes</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10"> {/* Updated gap to match RecipeGrid */}
        {savedRecipes.map(recipe => {
          const allergenWarningsOnCard = getRecipeAllergenWarningsForModal(recipe, currentUserAllergies);
          return (
          <div // Replaces Card
            key={recipe.id} 
            className="bg-muted rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col group recipe-card-fade-in"
          >
            <div onClick={() => handleRecipeCardClick(recipe.id)} className="cursor-pointer">
              <div className="relative h-56 w-full overflow-hidden"> {/* Replaces CardHeader, matches RecipeGrid image container */}
                {recipe.image ? (
                  <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground p-3 transition-transform duration-500 group-hover:scale-110"> {/* Matches RecipeGrid placeholder */}
                    <ImageIcon size={40} className="mb-2" />
                    <p className="text-sm text-center font-semibold">{recipe.title}</p>
                  </div>
                )}
              </div>
              <div className="p-5 flex-grow"> {/* Replaces CardContent, matches RecipeGrid content area */}
                <h3 
                  className="font-semibold text-lg mb-2 text-foreground truncate group-hover:text-accent transition-colors" /* Matches RecipeGrid title */
                  title={recipe.title}
                >
                  {recipe.title}
                </h3>

                {allergenWarningsOnCard.length > 0 && (
                  <div className="mb-2 text-xs text-destructive bg-destructive-foreground p-1.5 rounded-md border border-destructive flex items-center">
                    <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
                    <span className="font-medium">Allergy Alert:</span>&nbsp;
                    <span className="truncate">{allergenWarningsOnCard.join(', ')}</span>
                  </div>
                )}

                {recipe.summary && (
                  <p 
                    className="text-xs text-muted-foreground line-clamp-3 mb-2" /* Styled like RecipeGrid info */
                    dangerouslySetInnerHTML={{ __html: recipe.summary.length > 100 ? recipe.summary.substring(0,100) + '...': recipe.summary}} 
                  />
                )}
              </div>
            </div>
            <div className="mt-auto pt-3 p-5 border-t border-background"> {/* Replaces CardFooter, matches RecipeGrid button container + padding */}
              {onToggleRecipeForShoppingList && selectedRecipeIdsForShoppingList && (
                <div className="flex items-center space-x-2 w-full p-2 rounded-md hover:bg-background transition-colors mb-2"> {/* Added mb-2 for spacing */}
                  <Checkbox
                    id={`shopping-list-${recipe.id}`}
                    checked={selectedRecipeIdsForShoppingList.has(recipe.id)}
                    onCheckedChange={() => onToggleRecipeForShoppingList(recipe)}
                    aria-label={`Select ${recipe.title} for shopping list`}
                  />
                  <Label htmlFor={`shopping-list-${recipe.id}`} className="text-sm font-medium text-foreground cursor-pointer flex-grow">
                    Add to Shopping List
                  </Label>
                  <ShoppingCart size={16} className="text-foreground" />
                </div>
              )}
              <Button 
                variant="destructive" 
                size="sm" /* Added size sm for consistency */
                className="w-full"
                onClick={(e) => {
                    e.stopPropagation(); 
                    handleUnsaveRecipeCard(recipe.id, recipe.title);
                }}
              >
                Unsave
              </Button>
            </div>
          </div>
        )})}
      </div>

      {/* Recipe Details Modal */}
      <RecipeDetailModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        selectedRecipe={selectedRecipeDetail}
        modalLoading={modalLoading}
        modalError={modalError}
        user={user}
        isAuthLoading={isAuthLoading}
        savedRecipeIds={componentSavedRecipeIds} // Use component's saved IDs state
        isSaving={isSavingRecipe} // Use component's saving state
        onToggleSave={handleToggleSaveRecipeInModal} // Pass the correct handler
        currentUserAllergies={currentUserAllergies}
        getRecipeAllergenWarnings={getRecipeAllergenWarningsForModal} // Pass existing helper
      />
    </div>
  );
}
