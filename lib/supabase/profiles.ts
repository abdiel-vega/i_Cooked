import { createClient } from "@/lib/supabase/client"; // Changed import
import { Allergen } from "@/lib/allergens";

// Ensure your 'profiles' table has a 'user_id' (UUID, primary key, references auth.users.id)
// and an 'allergies' column of type TEXT[] (array of strings).

const supabase = createClient(); // Instantiate the client

export async function getUserAllergies(userId: string): Promise<Allergen[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("allergies")
      .eq("user_id", userId) // Assuming 'id' is the column referencing auth.users.id
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // "Resource not found"
        // Profile row might not exist yet, especially for new users.
        // Consider creating it here or as part of your on-signup trigger.
        return []; // No profile means no allergies.
      }
      console.error("Error fetching user allergies:", error.message);
      throw error;
    }
    return (data?.allergies as Allergen[]) || [];
  } catch (error) {
    // console.error('Supabase call failed for getUserAllergies:', error);
    return []; // Fallback to empty array on any unexpected error
  }
}

export async function updateUserAllergies(
  userId: string,
  allergies: Allergen[]
): Promise<void> {
  try {
    // Use upsert to handle cases where the profile row might not exist yet.
    // This requires 'id' to be the primary key or have a unique constraint.
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { user_id: userId, allergies: allergies },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Error updating user allergies:", error.message);
      throw error;
    }
  } catch (error) {
    // console.error('Supabase call failed for updateUserAllergies:', error);
    throw error; // Re-throw to be caught by the caller
  }
}
