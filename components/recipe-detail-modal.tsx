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
import Image from 'next/image';

interface RecipeDetailModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  selectedRecipe: Recipe | null;
  modalLoading: boolean;
  modalError: string | null;
  user: User | null | undefined;
  isAuthLoading: boolean;
  savedRecipeIds: Set<number>;
  isSaving: Record<number, boolean>; // save button state specific to the recipe id
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
          <div className="flex justify-center items-center h-96 p-4 sm:p-6">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-accent">
              <DialogTitle className="sr-only">Loading Recipe Details</DialogTitle> {/* accessible title for loading state */}
            </div>
            <p className="ml-3 text-foreground">Loading recipe details...</p>
          </div>
        )}
        {modalError && !modalLoading && (
          <div className="p-4 text-center sm:p-8">
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
            <DialogHeader className="p-4 border-b border-background sm:p-6">
              <DialogTitle className="text-xl font-bold text-accent sm:text-2xl">{selectedRecipe.title}</DialogTitle>
            </DialogHeader>
            <div className="overflow-y-auto flex-grow p-4 space-y-4 sm:p-6 sm:space-y-5 group">
              {selectedRecipe.image && (
                <div className="relative h-60 w-full rounded-lg overflow-hidden shadow-md mb-4 sm:h-72 sm:mb-6">
                  <Image 
                    src={selectedRecipe.image} 
                    alt={selectedRecipe.title} 
                    layout="fill"
                    objectFit="cover"
                    className="w-full h-full"
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
                      <h4 className="font-semibold text-md mb-1 text-accent sm:text-lg">Summary:</h4>
                      <div className="prose prose-sm max-w-none text-foreground [&_a:hover]:text-accent" dangerouslySetInnerHTML={{ __html: selectedRecipe.summary }} />
                  </div>
              )}
              
              {selectedRecipe.extendedIngredients && selectedRecipe.extendedIngredients.length > 0 && (
                <div>
                  <h4 className="font-semibold text-md mb-2 text-accent sm:text-lg">Ingredients:</h4>
                  <ul className="list-disc list-inside pl-4 space-y-1 text-foreground">
                    {selectedRecipe.extendedIngredients.map((ingredient, index) => (
                      <li key={`ingredient-${index}-${ingredient.id ?? ingredient.originalName ?? ingredient.name ?? 'unknown'}`} className="text-sm">{ingredient.original}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedRecipe.analyzedInstructions && selectedRecipe.analyzedInstructions.length > 0 && (
                <div>
                  <h4 className="font-semibold text-md mt-3 mb-2 text-accent sm:text-lg">Instructions:</h4>
                  {selectedRecipe.analyzedInstructions.map((instructionSet, index) => (
                    <div key={index} className="mb-4">
                      {instructionSet.name && <h5 className="font-medium text-base mb-1 text-foreground sm:text-md">{instructionSet.name}</h5>}
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
            <DialogFooter className="p-4 border-t border-background flex flex-col space-y-2 sm:flex-row sm:justify-end sm:space-x-2 sm:space-y-0">
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
