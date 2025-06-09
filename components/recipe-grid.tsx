import { Recipe } from '@/lib/spoonacular';
import { Button } from '@/components/ui/button';
import { User } from '@supabase/supabase-js';
import { Allergen } from '@/lib/allergens';
import { AlertTriangle, ImageIcon, LeafyGreen, MilkOff, Vegan, WheatOff } from 'lucide-react';

interface RecipeGridProps {
  recipes: Recipe[];
  savedRecipeIds: Set<number>;
  isSaving: Record<number, boolean>;
  onRecipeClick: (recipeId: number) => void;
  onToggleSave: (recipe: Recipe) => void;
  user: User | null | undefined;
  isAuthLoading: boolean;
  gridOverallLoading: boolean;
  animationType: 'initial' | 'subsequent';
  userAllergies?: Allergen[];
}

const ANIMATION_BATCH_SIZE = 12;

// helper function to check for allergens in a recipe
function getRecipeAllergenWarnings(recipe: Recipe, userAllergies: Allergen[] | undefined): string[] {
  if (!userAllergies || userAllergies.length === 0) {
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
        // if glutenfree is false, it might contain wheat. this is an assumption.
        if (recipe.glutenFree === false) triggeredAllergens.push("Wheat");
        break;
      // add other cases based on available recipe properties
    }
  });
  return [...new Set(triggeredAllergens)]; // return names of allergens
}


export function RecipeGrid({
  recipes,
  savedRecipeIds,
  isSaving,
  onRecipeClick,
  onToggleSave,
  user,
  isAuthLoading,
  gridOverallLoading,
  animationType,
  userAllergies = [], // default to empty array
}: RecipeGridProps) {
  if (recipes.length === 0 && !gridOverallLoading) {
    return null; // parent component handles "no recipes" message
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-10">
      {recipes.map((recipe, index) => {
        const currentRecipeId = recipe.id!;
        const isCurrentlySaving = isSaving[currentRecipeId] || false;
        const isRecipeSaved = savedRecipeIds.has(currentRecipeId);
        const allergenWarnings = getRecipeAllergenWarnings(recipe, userAllergies);

        let calculatedAnimationDelay = '0s';
        if (!gridOverallLoading && recipes.length > 0) {
          if (animationType === 'initial') {
            // slower stagger for initial items
            calculatedAnimationDelay = `${index * 0.1}s`;
          } else {
            // faster, repeating stagger for subsequent items
            calculatedAnimationDelay = `${(index % ANIMATION_BATCH_SIZE) * 0.05}s`;
          }
        }

        return (
          <div
            key={currentRecipeId}
            className="bg-muted rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col group recipe-card-fade-in"
            style={{ animationDelay: calculatedAnimationDelay }}
          >
            <div
              className="relative h-56 w-full overflow-hidden cursor-pointer"
              onClick={() => onRecipeClick(currentRecipeId)}
            >
              {recipe.image ? (
                <img
                  src={recipe.image}
                  alt={recipe.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div className="w-full h-full bg-muted flex flex-col items-center justify-center text-muted-foreground p-3 transition-transform duration-500 group-hover:scale-110">
                  <ImageIcon size={40} className="mb-2" />
                  <p className="text-sm text-center font-semibold">{recipe.title}</p>
                </div>
              )}
            </div>

            <div className="p-5 flex flex-col flex-grow">
              <h3
                className="font-semibold text-lg mb-2 text-foreground truncate group-hover:text-accent transition-colors cursor-pointer"
                title={recipe.title}
                onClick={() => onRecipeClick(currentRecipeId)}
              >
                {recipe.title}
              </h3>
              {allergenWarnings.length > 0 && (
                <div className="mb-2 text-xs text-destructive bg-destructive-foreground p-1.5 rounded-md border border-destructive flex items-center">
                  <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
                  <span className="font-medium">Allergy Alert:</span>&nbsp;
                  <span className="truncate">{allergenWarnings.join(', ')}</span>
                </div>
              )}
              <div className="mb-2 space-y-1 text-xs text-muted-foreground">
                {recipe.readyInMinutes && (
                  <p>Ready in: {recipe.readyInMinutes} mins</p>
                )}
                {recipe.servings && <p>Servings: {recipe.servings}</p>}
                {recipe.cuisines && recipe.cuisines.length > 0 && (
                  <p>Cuisine: {recipe.cuisines.join(', ')}</p>
                )}
                {recipe.diets && recipe.diets.length > 0 && (
                  <p>Diet: {recipe.diets.join(', ')}</p>
                )}
                {recipe.vegetarian && (
                  <div className="flex items-center gap-1">
                    <p className="text-green-600">Vegetarian</p>
                    <LeafyGreen className="text-green-600" size={14} />
                  </div>
                )}
                {recipe.vegan && (
                  <div className="flex items-center gap-1">
                    <p className="text-emerald-500">Vegan</p>
                    <Vegan className="text-emerald-500" size={14} />
                  </div>
                )}
                {recipe.glutenFree && (
                  <div className="flex items-center gap-1">
                    <p className="text-orange-500">Gluten-Free</p>
                    <WheatOff className="text-orange-500" size={14} />
                  </div>
                )}
                {recipe.dairyFree && (
                  <div className="flex items-center gap-1">
                    <p className="text-blue-500">Dairy-Free</p>
                    <MilkOff className="text-blue-500" size={14} />
                  </div>
                )}
              </div>
              <div className="mt-auto pt-3">
                <Button
                  variant={isRecipeSaved ? "destructive" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSave(recipe);
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
  );
}
