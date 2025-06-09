const API_KEY = process.env.NEXT_PUBLIC_SPOONACULAR_API_KEY;
const BASE_URL = "https://api.spoonacular.com";

if (!API_KEY) {
  console.warn(
    "Spoonacular API key is missing. Please set NEXT_PUBLIC_SPOONACULAR_API_KEY in your environment variables. You can get one from https://spoonacular.com/food-api"
  );
}

// interfaces for api responses and parameters
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

export interface SearchParams {
  query?: string;
  cuisine?: string | string[];
  diet?: string | string[];
  type?: string;
  maxReadyTime?: number;
  number?: number;
  offset?: number;
  intolerances?: string | string[];
}

// search recipes with various filters
export async function searchRecipesWithFilters(
  params: SearchParams
): Promise<{ recipes: Recipe[]; totalResults: number }> {
  if (!API_KEY) {
    return { recipes: [], totalResults: 0 };
  }

  try {
    const searchParamsObj = new URLSearchParams({
      apiKey: API_KEY,
      addRecipeInformation: "true",
      number: (params.number || 12).toString(),
      offset: (params.offset || 0).toString(),
    });

    if (params.query) searchParamsObj.append("query", params.query);

    // Handle array or string for cuisine and diet
    if (params.cuisine) {
      const cuisines = Array.isArray(params.cuisine)
        ? params.cuisine.join(",")
        : params.cuisine;
      if (cuisines) searchParamsObj.append("cuisine", cuisines);
    }
    if (params.diet) {
      const diets = Array.isArray(params.diet)
        ? params.diet.join(",")
        : params.diet;
      if (diets) searchParamsObj.append("diet", diets);
    }

    if (params.type) {
      // Add type parameter
      searchParamsObj.append("type", params.type);
    }

    if (params.intolerances) {
      const intolerances = Array.isArray(params.intolerances)
        ? params.intolerances.join(",")
        : params.intolerances;
      if (intolerances) searchParamsObj.append("intolerances", intolerances);
    }

    if (params.maxReadyTime)
      searchParamsObj.append("maxReadyTime", params.maxReadyTime.toString());

    const response = await fetch(
      `${BASE_URL}/recipes/complexSearch?${searchParamsObj.toString()}`
    );

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      throw new Error(
        `API request failed with status ${response.status}: ${
          errorData.message || response.statusText || "Unknown error"
        }`
      );
    }

    const data = await response.json();
    return {
      recipes: data.results as Recipe[],
      totalResults: data.totalResults || 0,
    };
  } catch (error) {
    console.error("Failed to search recipes with filters:", error);
    throw error;
  }
}

// fetch recipes based on user preferences like cuisines, diets, and intolerances
export async function fetchPersonalizedRecipes(params: {
  cuisines?: string[];
  diets?: string[];
  intolerances?: string[];
  count: number;
  offset?: number;
}): Promise<{ recipes: Recipe[]; totalResults: number }> {
  if (!API_KEY) {
    return { recipes: [], totalResults: 0 };
  }

  return searchRecipesWithFilters({
    cuisine: params.cuisines,
    diet: params.diets,
    intolerances: params.intolerances,
    number: params.count,
    offset: params.offset,
  });
}

// fetch a list of random recipes
export async function getRandomRecipes(
  count: number = 12,
  tags?: string,
  intolerances?: string[]
): Promise<Recipe[]> {
  if (!API_KEY) {
    return [];
  }
  try {
    const searchParamsObj = new URLSearchParams({
      apiKey: API_KEY,
      number: count.toString(),
      addRecipeInformation: "true", // ensure we get details like glutenFree, dairyFree
    });
    if (tags) searchParamsObj.append("tags", tags);
    if (intolerances && intolerances.length > 0) {
      searchParamsObj.append("intolerances", intolerances.join(","));
    }

    const response = await fetch(
      `${BASE_URL}/recipes/random?${searchParamsObj.toString()}`
    );
    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      throw new Error(
        `API request failed with status ${response.status}: ${
          errorData.message || response.statusText || "Unknown error"
        }`
      );
    }
    const data = await response.json();
    return data.recipes as Recipe[];
  } catch (error) {
    console.error("Failed to get random recipes:", error);
    throw error; // re-throw to be handled by the caller
  }
}

// fetch recipes belonging to a specific cuisine
export async function getRecipesByCuisine(
  cuisine: string,
  count: number = 12,
  offset: number = 0,
  intolerances?: string[]
): Promise<{ recipes: Recipe[]; totalResults: number }> {
  return searchRecipesWithFilters({
    cuisine: cuisine,
    number: count,
    offset: offset,
    intolerances: intolerances,
  });
}

// fetch detailed information for a single recipe by its id
export async function getRecipeDetails(id: number): Promise<Recipe | null> {
  if (!API_KEY) {
    return null;
  }
  try {
    const response = await fetch(
      `${BASE_URL}/recipes/${id}/information?apiKey=${API_KEY}&includeNutrition=false`
    );
    if (!response.ok) {
      if (response.status === 404) return null; // recipe not found
      const errorData = await response
        .json()
        .catch(() => ({ message: "Failed to parse error response" }));
      throw new Error(
        `API request failed with status ${response.status}: ${
          errorData.message || response.statusText || "Unknown error"
        }`
      );
    }
    const data = await response.json();
    return data as Recipe;
  } catch (error) {
    console.error(`Failed to get recipe details for ID ${id}:`, error);
    throw error; // re-throw
  }
}

// predefined lists for cuisines, diets, and meal types
export const CUISINES = [
  "African",
  "Asian",
  "American",
  "British",
  "Cajun",
  "Caribbean",
  "Chinese",
  "Eastern European",
  "European",
  "French",
  "German",
  "Greek",
  "Indian",
  "Irish",
  "Italian",
  "Japanese",
  "Jewish",
  "Korean",
  "Latin American",
  "Mediterranean",
  "Mexican",
  "Middle Eastern",
  "Nordic",
  "Southern",
  "Spanish",
  "Thai",
  "Vietnamese",
];

export const DIETS = [
  "Gluten Free",
  "Ketogenic",
  "Vegetarian",
  "Lacto-Vegetarian",
  "Ovo-Vegetarian",
  "Vegan",
  "Pescetarian",
  "Paleo",
  "Primal",
  "Low FODMAP",
  "Whole30",
];

export const MEAL_TYPES = [
  "main course",
  "side dish",
  "dessert",
  "appetizer",
  "salad",
  "bread",
  "breakfast",
  "soup",
  "beverage",
  "sauce",
  "marinade",
  "fingerfood",
  "snack",
  "drink",
];
