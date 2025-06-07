"use client";

import { useAuth } from '../contexts/auth-context';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import SavedRecipesList from '@/components/saved-recipes-list';
import { useEffect, useState, useMemo } from 'react';
import { COMMON_ALLERGENS, Allergen } from '@/lib/allergens';
import { getUserAllergies, updateUserAllergies } from '@/lib/supabase/profiles';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
// Import getRecipeDetails
import { Recipe as SpoonacularRecipe, getRecipeDetails } from '@/lib/spoonacular'; 
import { ClipboardCopy, Printer, RefreshCw, Trash2 } from 'lucide-react'; // Icons

export interface ShoppingListItem {
  id: string; // Unique key: nameClean_unit
  displayName: string; // User-friendly name
  nameClean: string; // The version of the name used for aggregation
  totalAmount: number; // Sum of numeric amounts. If all indeterminate, this will be 0.
  unit: string; // The unit for display. Empty if not specified.
  recipeSources: Array<{ recipeTitle: string; originalEntry: string }>;
  hasIndeterminateAmount: boolean; // True if any source for this item had an indeterminate amount
}

// Helper function to capitalize each word
function capitalizeEachWord(str: string): string {
  if (!str) return "";
  return str.toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}

// Helper function to render shopping list item amount and unit
function renderShoppingListItemAmountUnit(item: ShoppingListItem): string {
  const { totalAmount, unit, hasIndeterminateAmount } = item;
  let displayString = "";

  if (totalAmount > 0) {
    // Use toLocaleString for potentially better formatting of numbers, e.g., 0.5 vs .5
    displayString = totalAmount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    if (unit) {
      displayString += ` ${unit}`;
    }
  }

  if (hasIndeterminateAmount) {
    if (displayString) {
      // If there's a numeric part, append something to indicate more or unspecified amounts
      displayString += " (+ some)"; 
    } else {
      // If no numeric part, it's entirely indeterminate
      displayString = "As needed / To taste"; 
    }
  }
  return displayString;
}

export default function ProfilePage() {
  const { user, logout, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [selectedAllergies, setSelectedAllergies] = useState<Set<Allergen>>(new Set());
  const [isSavingAllergies, setIsSavingAllergies] = useState(false);
  const [initialAllergiesLoaded, setInitialAllergiesLoaded] = useState(false);

  // State for shopping list
  const [selectedRecipesForList, setSelectedRecipesForList] = useState<Map<number, SpoonacularRecipe>>(new Map());
  const [generatedShoppingList, setGeneratedShoppingList] = useState<ShoppingListItem[] | null>(null);
  const [isGeneratingList, setIsGeneratingList] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login?message=Please log in to view your profile.');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    async function loadUserAllergies() {
      if (user && !initialAllergiesLoaded) { // Only load once initially or if user changes
        try {
          const allergies = await getUserAllergies(user.id);
          setSelectedAllergies(new Set(allergies));
        } catch (error) {
          console.error("Failed to load user allergies:", error);
          toast.error("Could not load your allergy settings.");
        } finally {
          setInitialAllergiesLoaded(true);
        }
      }
    }
    if (!authLoading && user) {
        loadUserAllergies();
    } else if (!user) {
        // Clear allergies if user logs out
        setSelectedAllergies(new Set());
        setInitialAllergiesLoaded(false); // Allow reloading if another user logs in
    }
  }, [user, authLoading, initialAllergiesLoaded]);

  const handleAllergyToggle = async (allergen: Allergen, checked: boolean) => {
    if (!user) return;

    const newAllergiesSet = new Set(selectedAllergies);
    if (checked) {
      newAllergiesSet.add(allergen);
    } else {
      newAllergiesSet.delete(allergen);
    }
    // Optimistic UI update
    setSelectedAllergies(newAllergiesSet); 

    setIsSavingAllergies(true);
    try {
      await updateUserAllergies(user.id, Array.from(newAllergiesSet));
      toast.success("Allergy preferences updated!");
    } catch (error) {
      console.error("Failed to update allergies:", error);
      toast.error("Failed to save allergy preferences. Please try again.");
      // Revert optimistic update by refetching
      try {
        const currentAllergies = await getUserAllergies(user.id);
        setSelectedAllergies(new Set(currentAllergies));
      } catch (fetchError) {
        console.error("Failed to refetch allergies after save error:", fetchError);
      }
    } finally {
      setIsSavingAllergies(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout(); // This should handle Supabase signout and update context
      // The AuthProvider's onAuthStateChange should redirect or update UI, 
      // but an explicit push can be a fallback.
      router.push('/auth/login'); 
    } catch (error) {
      console.error('Logout failed:', error);
      // Optionally, show an error to the user
    }
  };

  const handleToggleRecipeForShoppingList = (recipe: SpoonacularRecipe) => {
    setSelectedRecipesForList(prev => {
      const newMap = new Map(prev);
      if (newMap.has(recipe.id)) {
        newMap.delete(recipe.id);
      } else {
        // We will fetch full details in generateShoppingList if needed
        newMap.set(recipe.id, recipe);
      }
      return newMap;
    });
    // If a list was already generated, clear it as the selection has changed
    if (generatedShoppingList) {
        setGeneratedShoppingList(null);
    }
  };
  
  const selectedRecipeIdsForShoppingList = useMemo(() => {
    return new Set(selectedRecipesForList.keys());
  }, [selectedRecipesForList]);

  const generateShoppingList = async () => {
    if (selectedRecipesForList.size === 0) {
      toast.info("Please select at least one recipe to generate a shopping list.");
      return;
    }
    setIsGeneratingList(true);
    setGeneratedShoppingList(null);
    let operationSuccess = true;

    const recipesToProcess: SpoonacularRecipe[] = [];
    const updatedSelectedRecipes = new Map(selectedRecipesForList);

    for (const recipe of selectedRecipesForList.values()) {
      if (!recipe.extendedIngredients || recipe.extendedIngredients.length === 0) {
        try {
          const loadingToastId = toast.loading(`Fetching full details for ${recipe.title}...`);
          const fullDetails = await getRecipeDetails(recipe.id);
          toast.dismiss(loadingToastId);
          if (fullDetails && fullDetails.extendedIngredients && fullDetails.extendedIngredients.length > 0) {
            recipesToProcess.push(fullDetails);
            updatedSelectedRecipes.set(recipe.id, fullDetails); // Update the map with full details
            toast.success(`Details fetched for ${recipe.title}.`);
          } else {
            recipesToProcess.push(recipe); // Process with what we have (likely no ingredients)
            toast.info(`Could not fetch ingredients for ${recipe.title}. It may not contribute to the list.`);
          }
        } catch (fetchErr: any) {
          toast.dismiss(); // Dismiss any loading toast
          console.error(`Error fetching details for ${recipe.title}:`, fetchErr);
          toast.error(`Error fetching details for ${recipe.title}. It may not contribute to the list.`);
          recipesToProcess.push(recipe); // Process with original, likely leading to no ingredients from this one
        }
      } else {
        recipesToProcess.push(recipe);
      }
    }
    setSelectedRecipesForList(updatedSelectedRecipes); // Persist fetched details in state

    const aggregatedIngredients: Map<string, ShoppingListItem> = new Map();

    recipesToProcess.forEach(recipe => {
      if (recipe.extendedIngredients && recipe.extendedIngredients.length > 0) {
        recipe.extendedIngredients.forEach(ingredient => {
          // Use fallbacks for name and unit if they are missing
          const nameForAggregation = (ingredient.nameClean || ingredient.name || ingredient.original || "unknown_ingredient").toLowerCase();
          const unitForAggregation = (ingredient.unit || "").toLowerCase(); // Standardize to lowercase for key
          
          const key = `${nameForAggregation}_${unitForAggregation}`;
          
          // Prioritize originalName, then name, then nameClean for the display name
          const baseDisplayName = ingredient.originalName || ingredient.name || ingredient.nameClean || "Unknown Ingredient";
          const displayName = capitalizeEachWord(baseDisplayName);
          const displayUnit = ingredient.unit || ""; // Unit for display, could be empty

          if (aggregatedIngredients.has(key)) {
            const existing = aggregatedIngredients.get(key)!;
            if (ingredient.amount != null) {
              existing.totalAmount += ingredient.amount;
            } else {
              existing.hasIndeterminateAmount = true;
            }
            existing.recipeSources.push({ recipeTitle: recipe.title, originalEntry: ingredient.original || ingredient.name || "N/A" });
          } else {
            aggregatedIngredients.set(key, {
              id: key,
              displayName: displayName,
              nameClean: nameForAggregation,
              totalAmount: ingredient.amount != null ? ingredient.amount : 0,
              unit: displayUnit,
              recipeSources: [{ recipeTitle: recipe.title, originalEntry: ingredient.original || ingredient.name || "N/A" }],
              hasIndeterminateAmount: ingredient.amount == null,
            });
          }
        });
      } else if (operationSuccess) { // Only show this warning if we haven't already for this recipe
        // This case might be hit if initial fetch failed and we proceeded or if a recipe truly has no ingredients
        // console.warn(`Recipe "${recipe.title}" has no extended ingredients to process for shopping list.`);
      }
    });

    const sortedList = Array.from(aggregatedIngredients.values()).sort((a, b) => 
      a.displayName.localeCompare(b.displayName)
    );
    
    setGeneratedShoppingList(sortedList);
    setIsGeneratingList(false);

    if (sortedList.length === 0) {
      if (selectedRecipesForList.size > 0) { // Recipes were selected, but no ingredients found
        toast.info("No ingredients found in the selected recipes, or ingredient data was missing/could not be fetched.");
      }
      // If selectedRecipesForList.size was 0, the initial check would have caught it.
    } else {
      toast.success("Shopping list generated!");
    }
  };

  const handlePrintShoppingList = () => {
    if (!generatedShoppingList || generatedShoppingList.length === 0) {
      toast.error("No shopping list to print.");
      return;
    }
    window.print();
  };

  const handleCopyShoppingList = () => {
    if (!generatedShoppingList || generatedShoppingList.length === 0) {
      toast.error("No shopping list to copy.");
      return;
    }
    const listText = generatedShoppingList.map(item => {
      const amountUnitDisplay = renderShoppingListItemAmountUnit(item);
      return `${item.displayName}${amountUnitDisplay ? `: ${amountUnitDisplay}` : ''}`;
    }
    ).join('\n');

    navigator.clipboard.writeText(listText)
      .then(() => toast.success("Shopping list copied to clipboard!"))
      .catch(err => {
        console.error("Failed to copy shopping list:", err);
        toast.error("Could not copy shopping list.");
      });
  };
  
  const handleClearShoppingList = () => {
    setGeneratedShoppingList(null);
    setSelectedRecipesForList(new Map()); // Also clear selections
    toast.info("Shopping list cleared.");
  };


  // Display a loading message while checking auth state or if user is null (before redirect)
  if (authLoading || (user && !initialAllergiesLoaded)) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
        <p className="ml-3 text-foreground">Loading profile...</p>
      </div>
    );
  }

  if (!user) {
    // This case should ideally be handled by the redirect, but as a fallback:
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground">Access Denied</h2>
          <p className="mt-2 text-foreground">
            You must be logged in to view this page.
          </p>
          <Button onClick={() => router.push('/auth/login')} className="mt-4">
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4">
      <style jsx global>{`
        @media print {
          /* Reset and hide everything first */
          body * {
            visibility: hidden !important;
          }
          
          /* Show only the shopping list and its contents */
          .printable-shopping-list,
          .printable-shopping-list * {
            visibility: visible !important;
          }
          
          /* Basic page setup */
          @page {
            margin: 20mm;
            size: letter;
          }
          
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          
          /* Main container styling */
          .printable-shopping-list {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            font-family: Arial, sans-serif !important;
            font-size: 12pt !important;
            line-height: 1.6 !important;
            color: #000 !important;
          }
          
          /* Title styling */
          .printable-shopping-list .print-title {
            font-size: 24pt !important;
            font-weight: bold !important;
            text-align: center !important;
            margin: 0 0 10mm 0 !important;
            padding: 5mm 0 !important;
            border-bottom: 1px solid #333 !important;
            page-break-after: avoid !important;
          }
          
          /* List container */
          .printable-shopping-list ul {
            list-style: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          /* Individual item styling */
          .printable-shopping-list li {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 10px !important;
            margin: 0 !important;
            border: none !important;
            border-bottom: 1px solid #d4d4d4 !important;
            page-break-inside: avoid !important;
            min-height: 15mm !important;
          }
          
          .printable-shopping-list li:last-child {
            border-bottom: none !important;
          }
          
          /* Item details container */
          .printable-shopping-list .item-details {
            flex: 1 1 auto !important;
            padding-right: 10mm !important;
            max-width: 70% !important;
          }
          
          /* Item name styling */
          .printable-shopping-list .item-name {
            font-weight: bold !important;
            font-size: 14pt !important;
            margin-bottom: 2mm !important;
            color: #000 !important;
            display: block !important;
          }
          
          /* Recipe source styling */
          .printable-shopping-list .item-source {
            font-size: 10pt !important;
            color: #555 !important;
            font-style: italic !important;
            display: block !important;
            line-height: 1.4 !important;
          }
          
          /* Quantity styling */
          .printable-shopping-list .item-quantity {
            font-weight: semibold !important;
            font-size: 12pt !important;
            text-align: right !important;
            place-items: center !important;
            white-space: nowrap !important;
            min-width: 80px !important;
            flex: 0 0 auto !important;
            color: #000 !important;
          }
          
          /* Hide non-printable elements */
          .no-print,
          button,
          nav,
          header,
          footer,
          .navigation,
          .sidebar,
          .toolbar {
            display: none !important;
          }
          
          /* page numbers */
          @page {
            @bottom-right {
              content: counter(page) " / " counter(pages);
              font-size: 10pt;
              color: #666;
            }
          }
        }
      `}</style>
      <Card className="max-w-2xl mx-auto mb-10 no-print">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-2xl">Your Profile</CardTitle>
              <CardDescription className='text-muted-foreground'>Manage your account settings and preferences.</CardDescription>
            </div>
            <div className="ml-auto bg-background border border-primary px-3 py-1 rounded-md shadow-none transition ease-in-out duration-300 cursor-pointer hover:shadow-lg hover:border-accent hover:scale-105">
              <p className="text-sm text-foreground ">{user.email}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-lg font-medium mb-3">Allergy Preferences</h3>
            <p className="text-sm text-foreground mb-3">
              Select any allergies you have. Recipes with these allergens will show warnings, and personalized recommendations may consider them.
            </p>
            <div className="space-y-3">
              {COMMON_ALLERGENS.map((allergen) => (
                <div key={allergen} className="flex items-center justify-between p-3 border border-background rounded-md bg-background transition duration-300 ease-in-out hover:-translate-y-1 hover:scale-105 hover:border-accent">
                  <Label htmlFor={`allergy-${allergen}`} className="text-sm font-medium text-foreground">
                    {allergen}
                  </Label>
                  <Switch
                    id={`allergy-${allergen}`}
                    checked={selectedAllergies.has(allergen)}
                    onCheckedChange={(checked) => handleAllergyToggle(allergen, checked)}
                    disabled={isSavingAllergies}
                    aria-label={`Toggle ${allergen} allergy`}
                  />
                </div>
              ))}
            </div>
            {isSavingAllergies && <p className="text-sm text-accent mt-2 animate-pulse">Saving allergy settings...</p>}
          </div>

        </CardContent>
      </Card>

      {/* Shopping List Generator Section */}
      <Card className="max-w-4xl mx-auto mb-10"> 
        <CardHeader className="no-print"> 
          <CardTitle className="text-2xl text-foreground">Shopping List Generator</CardTitle>
          <CardDescription>Select recipes from your saved list below, then generate a combined shopping list.</CardDescription>
        </CardHeader>
        <CardContent>
          {selectedRecipesForList.size > 0 && (
            <div className="mb-4 text-sm text-foreground no-print"> 
              {selectedRecipesForList.size} recipe(s) selected for the shopping list.
            </div>
          )}
          <Button 
            variant="outline"
            onClick={generateShoppingList} 
            disabled={isGeneratingList || selectedRecipesForList.size === 0}
            className="w-full sm:w-auto no-print" 
          >
            {isGeneratingList ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : "Generate Shopping List"}
          </Button>

          {isGeneratingList && (
            <div className="mt-6 text-center no-print"> 
              <RefreshCw className="mx-auto h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-foreground mt-2">Combining ingredients...</p>
            </div>
          )}

          {generatedShoppingList && generatedShoppingList.length > 0 && (
            <div className="mt-6 printable-shopping-list">
              <div className="flex justify-between items-center mb-4 no-print">
                <h3 className="text-xl font-semibold">Your Shopping List</h3>
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" onClick={handleCopyShoppingList} aria-label="Copy list">
                    <ClipboardCopy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={handlePrintShoppingList} aria-label="Print list">
                    <Printer className="h-4 w-4 mr-1" /> Print
                  </Button>
                   <Button variant="destructive" size="sm" onClick={handleClearShoppingList} aria-label="Clear list">
                    <Trash2 className="h-4 w-4 mr-1" /> Clear
                  </Button>
                </div>
              </div>
              <h3 className="hidden print:block print-title">Shopping List</h3>
              <ul className="space-y-2">
                {generatedShoppingList.map(item => (
                  <li 
                    key={item.id} 
                    // Tailwind classes for on-screen display:
                    className="p-3 border border-background rounded-md bg-background text-sm text-foreground flex justify-between items-start transition duration-300 ease-in-out hover:border-accent"
                  >
                    <div className="item-details flex-grow pr-2 sm:pr-4"> {/* Adjusted padding for screen */}
                      <span className="font-medium item-name block mb-0.5">{item.displayName}</span>
                      <div className="text-xs text-muted-foreground item-source"> {/* Screen: text-xs, gray; Print: styled by .item-source */}
                        From: {item.recipeSources.map(src => src.recipeTitle).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                      </div>
                    </div>
                    <span className="text-foreground text-right item-quantity whitespace-nowrap flex-shrink-0 pl-2 sm:pl-0"> {/* Added pl for screen if quantity is long */}
                      {renderShoppingListItemAmountUnit(item)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {generatedShoppingList && generatedShoppingList.length === 0 && !isGeneratingList && (
             <p className="mt-6 text-center text-foreground no-print">No ingredients to list. Ensure selected recipes have ingredient data.</p>
          )}
        </CardContent>
      </Card>

      <div className="no-print"> 
        <SavedRecipesList 
          selectedRecipeIdsForShoppingList={selectedRecipeIdsForShoppingList}
          onToggleRecipeForShoppingList={handleToggleRecipeForShoppingList}
        />
      </div>
    </div>
  );
}