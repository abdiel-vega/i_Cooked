import { createClient } from "@/lib/supabase/client";
import { Allergen } from "@/lib/allergens";

// 'profiles' table has 'user_id'
// and 'allergies' (text[]).

const supabase = createClient();

export async function getUserAllergies(userId: string): Promise<Allergen[]> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("allergies")
      .eq("user_id", userId)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // "resource not found"
        // profile row might not exist yet, especially for new users.
        // consider creating it here or as part of your on-signup trigger.
        return []; // no profile means no allergies.
      }
      console.error("Error fetching user allergies:", error.message);
      throw error;
    }
    return (data?.allergies as Allergen[]) || [];
  } catch {
    return []; // fallback to empty array on any unexpected error
  }
}

export async function updateUserAllergies(
  userId: string,
  allergies: Allergen[]
): Promise<void> {
  try {
    // use upsert to handle cases where the profile row might not exist yet.
    // this requires 'user_id' to be the primary key or have a unique constraint.
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
    throw error; // re-throw to be caught by the caller
  }
}
