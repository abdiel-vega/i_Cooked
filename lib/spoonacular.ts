const API_KEY = process.env.NEXT_PUBLIC_SPOONACULAR_API_KEY;
const BASE_URL = "https://api.spoonacular.com"; // Changed to base Spoonacular URL

if (!API_KEY) {
  console.warn(
    "Spoonacular API key is missing. Please set NEXT_PUBLIC_SPOONACULAR_API_KEY in your environment variables. You can get one from https://spoonacular.com/food-api"
  );
}

// Define interfaces for better type safety
export interface Recipe {
  id: number;
  title: string;
  image: string;
  imageType?: string;
  readyInMinutes?: number;
  servings?: number;
  summary?: string;
  extendedIngredients?: Ingredient[];
  analyzedInstructions?: AnalyzedInstruction[];
  // Add any other properties you expect from the API
  vegetarian?: boolean;
  vegan?: boolean;
  glutenFree?: boolean;
  dairyFree?: boolean;
  diets?: string[];
  cuisines?: string[];
  dishTypes?: string[];
}

export interface Ingredient {
  id: number;
  aisle: string;
  image: string;
  consistency: string;
  name: string;
  nameClean: string;
  original: string;
  originalName: string;
  amount: number;
  unit: string;
  meta: string[];
  measures: {
    us: {
      amount: number;
      unitShort: string;
      unitLong: string;
    };
    metric: {
      amount: number;
      unitShort: string;
      unitLong: string;
    };
  };
}

export interface AnalyzedInstruction {
  name: string;
  steps: Step[];
}

export interface Step {
  number: number;
  step: string;
  ingredients: EquipmentOrIngredient[];
  equipment: EquipmentOrIngredient[];
  length?: {
    number: number;
    unit: string;
  };
}

export interface EquipmentOrIngredient {
  id: number;
  name: string;
  localizedName: string;
  image: string;
  temperature?: {
    number: number;
    unit: string;
  };
}

export async function getRandomRecipes(number: number = 10): Promise<Recipe[]> {
  if (!API_KEY) {
    // console.error('Spoonacular API key is not configured.');
    // Return an empty array or throw a specific error to be handled by UI
    return [];
  }
  try {
    const response = await fetch(
      `${BASE_URL}/recipes/random?apiKey=${API_KEY}&number=${number}`
    );
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      console.error(
        "Spoonacular API error (getRandomRecipes):",
        response.status,
        errorData
      );
      throw new Error(
        `API request failed with status ${response.status}: ${
          errorData.message || response.statusText || "Unknown error"
        }`
      );
    }
    const data = await response.json();
    return data.recipes as Recipe[];
  } catch (error) {
    console.error("Failed to fetch random recipes:", error);
    throw error; // Re-throw to be caught by the calling component
  }
}

export async function getRecipeDetails(id: number): Promise<Recipe | null> {
  if (!API_KEY) {
    // console.error('Spoonacular API key is not configured.');
    return null;
  }
  try {
    const response = await fetch(
      `${BASE_URL}/recipes/${id}/information?includeNutrition=false&apiKey=${API_KEY}`
    );
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      console.error(
        "Spoonacular API error (getRecipeDetails):",
        response.status,
        errorData
      );
      throw new Error(
        `API request failed with status ${response.status}: ${
          errorData.message || response.statusText || "Unknown error"
        }`
      );
    }
    const data = await response.json();
    return data as Recipe;
  } catch (error) {
    console.error(`Failed to fetch recipe details for id ${id}:`, error);
    throw error; // Re-throw to be caught by the calling component
  }
}

// Keeping searchRecipes function, can be used later or removed if not needed.
export async function searchRecipes(query: string): Promise<Recipe[]> {
  if (!API_KEY) {
    // console.error('Spoonacular API key is not configured.');
    return [];
  }
  try {
    const response = await fetch(
      `${BASE_URL}/recipes/complexSearch?apiKey=${API_KEY}&query=${query}&addRecipeInformation=true&number=10` // Added number limit
    );
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      console.error(
        "Spoonacular API error (searchRecipes):",
        response.status,
        errorData
      );
      throw new Error(
        `API request failed with status ${response.status}: ${
          errorData.message || response.statusText || "Unknown error"
        }`
      );
    }
    const data = await response.json();
    return data.results as Recipe[];
  } catch (error) {
    console.error(`Failed to search recipes for query "${query}":`, error);
    throw error; // Re-throw to be caught by the calling component
  }
}
