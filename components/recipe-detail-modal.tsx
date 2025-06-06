import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Recipe } from '@/lib/spoonacular';
import { User } from '@supabase/supabase-js';
import { Allergen } from '@/lib/allergens';
import { AlertTriangle } from 'lucide-react';

interface RecipeDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedRecipe: Recipe | null;
  modalLoading: boolean;
  modalError: string | null;
  user: User | null | undefined;
  isAuthLoading: boolean;
  savedRecipeIds: Set<number>;
  isSaving: Record<number, boolean>; // For the save button state specific to the recipe ID
  onToggleSave: (recipe: Recipe) => void;
  currentUserAllergies: Allergen[];
  getRecipeAllergenWarnings: (recipe: Recipe, userAllergies: Allergen[] | undefined) => string[];
}

export function RecipeDetailModal({
  isOpen,
  onOpenChange,
  selectedRecipe,
  modalLoading,
  modalError,
  user,
  isAuthLoading,
  savedRecipeIds,
  isSaving,
  onToggleSave,
  currentUserAllergies,
  getRecipeAllergenWarnings,
}: RecipeDetailModalProps) {
  
  const recipeIdForSavingState = selectedRecipe?.id;
  const isCurrentlySavingThisRecipe = recipeIdForSavingState ? (isSaving[recipeIdForSavingState] || false) : false;
  const isThisRecipeSaved = recipeIdForSavingState ? savedRecipeIds.has(recipeIdForSavingState) : false;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col p-0">
        {modalLoading && (
          <div className="flex justify-center items-center h-96">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent">
              <DialogTitle className="sr-only">Loading Recipe Details</DialogTitle>
            </div>
            <p className="ml-3 text-foreground">Loading recipe details...</p>
          </div>
        )}
        {modalError && !modalLoading && (
          <div className="p-8 text-center">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-destructive">Error</DialogTitle>
            </DialogHeader>
            <p className="text-foreground mt-2 mb-6">{modalError}</p>
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          </div>
        )}
        {selectedRecipe && !modalLoading && !modalError && (
          <>
            <DialogHeader className="p-6 border-b border-background">
              <DialogTitle className="text-2xl font-bold text-accent">{selectedRecipe.title}</DialogTitle>
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

              {(() => {
                const allergenWarningsInModal = getRecipeAllergenWarnings(selectedRecipe, currentUserAllergies);
                if (allergenWarningsInModal.length > 0) {
                  return (
                    <div className="mb-4 p-3 rounded-md border border-destructive bg-destructive-foreground text-destructive flex items-center text-sm">
                      <AlertTriangle size={18} className="mr-2 flex-shrink-0 text-destructive" />
                      <span className="font-semibold text-destructive">Allergy Alert:</span>&nbsp;
                      <span className="text-destructive">{allergenWarningsInModal.join(', ')}</span>
                    </div>
                  );
                }
                return null;
              })()}
              
              {selectedRecipe.summary && (
                  <div>
                      <h4 className="font-semibold text-lg mb-1 text-accent">Summary:</h4>
                      <div className="prose prose-sm max-w-none text-foreground" dangerouslySetInnerHTML={{ __html: selectedRecipe.summary }} />
                  </div>
              )}
              
              {selectedRecipe.extendedIngredients && selectedRecipe.extendedIngredients.length > 0 && (
                <div>
                  <h4 className="font-semibold text-lg mb-2 text-accent">Ingredients:</h4>
                  <ul className="list-disc list-inside pl-4 space-y-1 text-foreground">
                    {selectedRecipe.extendedIngredients.map(ingredient => (
                      <li key={ingredient.id || ingredient.name || ingredient.original} className="text-sm">{ingredient.original}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedRecipe.analyzedInstructions && selectedRecipe.analyzedInstructions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-lg mt-3 mb-2 text-accent">Instructions:</h4>
                  {selectedRecipe.analyzedInstructions.map((instructionSet, index) => (
                    <div key={index} className="mb-4">
                      {instructionSet.name && <h5 className="font-medium text-md mb-1 text-foreground">{instructionSet.name}</h5>}
                      <ol className="list-decimal list-inside pl-4 space-y-1.5 text-foreground text-sm">
                        {instructionSet.steps.map(step => (
                          <li key={step.number}>{step.step}</li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              )}
              {!selectedRecipe.summary && (!selectedRecipe.extendedIngredients || selectedRecipe.extendedIngredients.length === 0) && (!selectedRecipe.analyzedInstructions || selectedRecipe.analyzedInstructions.length === 0) && (
                  <p className="text-foreground">Detailed information for this recipe is not available.</p>
              )}
            </div>
            <DialogFooter className="p-6 border-t border-background flex justify-end space-x-2">
              <Button 
                  variant={isThisRecipeSaved ? "destructive" : "outline"}
                  onClick={(e) => { 
                      e.stopPropagation(); 
                      if(selectedRecipe) onToggleSave(selectedRecipe); 
                  }}
                  disabled={!selectedRecipe || isCurrentlySavingThisRecipe || !user || isAuthLoading}
              >
                {isCurrentlySavingThisRecipe ? (isThisRecipeSaved ? 'Unsaving...' : 'Saving...') : (isThisRecipeSaved ? 'Unsave Recipe' : 'Save Recipe')}
              </Button>
              <DialogClose asChild>
                <Button variant={'outline'}>Close</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
