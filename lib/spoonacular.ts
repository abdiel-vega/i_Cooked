const API_KEY = process.env.SPOONACULAR_API_KEY;
const BASE_URL = "https://api.spoonacular.com/recipes";

export async function getRandomRecipes(number = 20) {
  const response = await fetch(
    `${BASE_URL}/random?apiKey=${API_KEY}&number=${number}`
  );
  const data = await response.json();
  return data.recipes;
}

export async function searchRecipes(query: string) {
  const response = await fetch(
    `${BASE_URL}/complexSearch?apiKey=${API_KEY}&query=${query}&addRecipeInformation=true`
  );
  const data = await response.json();
  return data.results;
}
