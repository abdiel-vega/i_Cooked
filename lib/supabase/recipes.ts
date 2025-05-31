"use client";

import { Recipe } from "@/lib/spoonacular";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";

export interface SavedRecipeEntry {
  id: number; // Primary key of the saved_recipes table
  user_id: string;
  recipe_id: number;
  recipe_data: Recipe; // Store the whole recipe object
  created_at: string;
}

const supabase = createClient();

/**
 * Saves a recipe for a user.
 * Assumes a 'saved_recipes' table with columns: user_id (uuid), recipe_id (int4), recipe_data (jsonb).
 */
export async function saveRecipeToSupabase(
  userId: string,
  recipe: Recipe
): Promise<SavedRecipeEntry> {
  if (!userId || !recipe || !recipe.id) {
    throw new Error("User ID and recipe with ID are required to save.");
  }

  const { data, error } = await supabase
    .from("saved_recipes")
    .insert([
      {
        user_id: userId,
        recipe_id: recipe.id,
        recipe_data: recipe, // Store the full recipe object
      },
    ])
    .select()
    .single(); // Assuming you want the inserted row back and recipe_id + user_id is unique

  if (error) {
    console.error("Error saving recipe to Supabase:", error);
    // Check for unique constraint violation (recipe already saved)
    if (error.code === "23505") {
      // PostgreSQL unique violation error code
      throw new Error("Recipe already saved.");
    }
    throw new Error(error.message || "Could not save recipe.");
  }
  return data as SavedRecipeEntry;
}

/**
 * Unsaves (deletes) a recipe for a user by recipe_id.
 */
export async function unsaveRecipeFromSupabase(
  userId: string,
  recipeId: number
): Promise<{ success: boolean }> {
  if (!userId || !recipeId) {
    throw new Error("User ID and Recipe ID are required to unsave.");
  }

  const { error } = await supabase
    .from("saved_recipes")
    .delete()
    .match({ user_id: userId, recipe_id: recipeId });

  if (error) {
    console.error("Error unsaving recipe from Supabase:", error);
    throw new Error(error.message || "Could not unsave recipe.");
  }
  return { success: true };
}

/**
 * Fetches all saved recipes for a user.
 */
export async function getSavedRecipesFromSupabase(
  userId: string
): Promise<Recipe[]> {
  if (!userId) {
    throw new Error("User ID is required to fetch saved recipes.");
  }

  const { data, error } = await supabase
    .from("saved_recipes")
    .select("recipe_data") // Select only the recipe_data column
    .eq("user_id", userId)
    .order("saved_at", { ascending: false });

  if (error) {
    console.error("Error fetching saved recipes from Supabase:", error);
    throw new Error(error.message || "Could not fetch saved recipes.");
  }

  // The data will be an array of objects like [{ recipe_data: {...} }, ...]
  // We need to map it to return an array of Recipe objects.
  return data ? data.map((item) => item.recipe_data as Recipe) : [];
}

/**
 * Checks if a specific recipe is saved by the user.
 */
export async function checkIsRecipeSaved(
  userId: string,
  recipeId: number
): Promise<boolean> {
  if (!userId || !recipeId) {
    console.warn("User ID or Recipe ID missing for checkIsRecipeSaved");
    return false;
  }

  const { data, error } = await supabase
    .from("saved_recipes")
    .select("recipe_id")
    .match({ user_id: userId, recipe_id: recipeId })
    .maybeSingle(); // Returns one row or null, doesn't error if not found

  if (error) {
    console.error("Error checking if recipe is saved:", error);
    return false; // Or throw error if you want to handle it differently
  }

  return !!data; // True if data is not null (recipe is found/saved)
}
