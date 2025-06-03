import { Recipe } from '@/lib/spoonacular';
import { Button } from '@/components/ui/button';
import { User } from '@supabase/supabase-js';
import { Allergen } from '@/lib/allergens'; // Import Allergen type
import { AlertTriangle } from 'lucide-react'; // For warning icon

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
  userAllergies?: Allergen[]; // Added userAllergies prop
}

const ANIMATION_BATCH_SIZE = 12;

// Helper function to check for allergens in a recipe
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
        // If glutenFree is false, it might contain wheat. This is an assumption.
        if (recipe.glutenFree === false) triggeredAllergens.push("Wheat");
        break;
      // Add other cases based on available recipe properties
    }
  });
  return [...new Set(triggeredAllergens)]; // Return names of allergens
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
  userAllergies = [], // Default to empty array
}: RecipeGridProps) {
  if (recipes.length === 0 && !gridOverallLoading) {
    return null; // Parent component should handle "no recipes" message
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
            // Slower stagger for the initial set of items
            calculatedAnimationDelay = `${index * 0.1}s`;
          } else {
            // Faster, repeating stagger for subsequent items (e.g., infinite scroll, search results)
            calculatedAnimationDelay = `${(index % ANIMATION_BATCH_SIZE) * 0.05}s`;
          }
        }

        return (
          <div
            key={currentRecipeId}
            className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 flex flex-col group recipe-card-fade-in"
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
                <div className="w-full h-full bg-gray-300 flex items-center justify-center">
                  <p className="text-gray-500 text-sm">Image not available</p>
                </div>
              )}
            </div>

            <div className="p-5 flex flex-col flex-grow">
              <h3
                className="font-semibold text-lg mb-2 text-gray-900 truncate group-hover:text-blue-600 transition-colors cursor-pointer"
                title={recipe.title}
                onClick={() => onRecipeClick(currentRecipeId)}
              >
                {recipe.title}
              </h3>
              {allergenWarnings.length > 0 && (
                <div className="mb-2 text-xs text-red-600 bg-red-50 p-1.5 rounded-md border border-red-200 flex items-center">
                  <AlertTriangle size={14} className="mr-1.5 flex-shrink-0" />
                  <span className="font-medium">Allergy Alert:</span>&nbsp;
                  <span className="truncate">{allergenWarnings.join(', ')}</span>
                </div>
              )}
              <div className="mb-2 space-y-1 text-xs text-gray-500">
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
