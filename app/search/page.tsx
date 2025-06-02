import Link from 'next/link';

// Placeholder for a SearchBar component
const SearchBar = () => (
  <input
    type="text"
    placeholder="Search recipes, ingredients..."
    className="p-3 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
    aria-label="Search recipes"
  />
);

// Placeholder for a FilterDropdown component
const FilterDropdown = ({ label, options, id }: { label: string; options: string[]; id: string }) => (
  <div className="flex flex-col">
    <label htmlFor={id} className="mb-1 text-sm font-medium text-gray-700">
      {label}:
    </label>
    <select
      id={id}
      className="p-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
    >
      <option value="">Any</option>
      {options.map((option) => (
        <option key={option} value={option.toLowerCase().replace(/\s+/g, '-')}>
          {option}
        </option>
      ))}
    </select>
  </div>
);

// A comprehensive list of common cuisines
const CUISINES = [
  "African", "Asian", "American", "British", "Cajun", "Caribbean",
  "Chinese", "Eastern European", "European", "French", "German",
  "Greek", "Indian", "Irish", "Italian", "Japanese", "Jewish",
  "Korean", "Latin American", "Mediterranean", "Mexican",
  "Middle Eastern", "Nordic", "Southern", "Spanish", "Thai", "Vietnamese"
];

// Diet options
const DIET_OPTIONS = [
  "Gluten Free", "Ketogenic", "Vegetarian", "Lacto-Vegetarian", 
  "Ovo-Vegetarian", "Vegan", "Pescetarian", "Paleo", "Primal", "Low FODMAP", "Whole30"
];

// Servings options
const SERVING_OPTIONS = ["1", "2", "3-4", "4-6", "6+"];

// Ready time options (in minutes)
const READY_TIME_OPTIONS = ["15", "30", "45", "60", "90", "120+"];


export default function SearchPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-gray-800 mb-2">Discover Recipes</h1>
        <p className="text-lg text-gray-600">Find your next favorite meal with our extensive recipe collection.</p>
      </header>

      {/* Search Bar and Filters Section */}
      <section className="mb-10 p-6 bg-gray-50 rounded-xl shadow-lg">
        <div className="mb-6">
          <SearchBar />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterDropdown label="Diet" options={DIET_OPTIONS} id="diet-filter" />
          <FilterDropdown label="Cuisine Preference" options={CUISINES} id="cuisine-filter" />
          <FilterDropdown label="Servings" options={SERVING_OPTIONS} id="servings-filter" />
          <FilterDropdown label="Max Ready Time (min)" options={READY_TIME_OPTIONS} id="ready-time-filter" />
        </div>
        {/* Add a search button here if search isn't triggered on input change or enter */}
        {/* <button className="mt-6 w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3 px-4 rounded-lg transition duration-150 ease-in-out">
          Apply Filters & Search
        </button> */}
      </section>

      {/* Cuisine Sections */}
      <section>
        <h2 className="text-3xl font-semibold mb-6 text-gray-700">Browse by Cuisine</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {CUISINES.map((cuisine) => (
            <Link
              key={cuisine}
              href={`/search/cuisine/${encodeURIComponent(cuisine.toLowerCase().replace(/\s+/g, '-'))}`}
              legacyBehavior
            >
              <a className="group block p-4 bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-gray-200 hover:border-orange-400">
                <h3 className="text-md sm:text-lg font-medium text-gray-800 group-hover:text-orange-600 transition-colors duration-300 text-center">
                  {cuisine}
                </h3>
              </a>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
