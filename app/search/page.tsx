'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CUISINES, DIETS as DIET_OPTIONS } from '@/lib/spoonacular'; // Import from lib
import { Button } from '@/components/ui/button';

// SearchBar component
const SearchBar = ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
  <input
    type="text"
    placeholder="Search recipes, ingredients..."
    className="p-3 bg-background text-foreground rounded-lg w-full focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
    aria-label="Search recipes"
    value={value}
    onChange={(e) => onChange(e.target.value)}
  />
);

// FilterDropdown component
const FilterDropdown = ({
  label,
  options,
  id,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  id: string;
  value: string;
  onChange: (value: string) => void;
}) => (
  <div className="flex flex-col">
    <label htmlFor={id} className="mb-1 text-sm font-medium text-foreground">
      {label}:
    </label>
    <select
      id={id}
      className="p-2 rounded-lg bg-background focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Any</option>
      {options.map((option) => (
        // Use the option itself as the value, URL encoding will handle spaces.
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  </div>
);

// Ready time options (in minutes)
const READY_TIME_OPTIONS = ["15", "30", "45", "60", "90", "120+"];


export default function SearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiet, setSelectedDiet] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('');
  const [selectedReadyTime, setSelectedReadyTime] = useState('');

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.append('query', searchQuery);
    if (selectedDiet) params.append('diet', selectedDiet);
    if (selectedCuisine) params.append('cuisine', selectedCuisine);
    if (selectedReadyTime) {
      if (selectedReadyTime === "120+") {
        params.append('maxReadyTime', '120'); // Or a higher number, or handle as "any"
      } else if (selectedReadyTime) {
        params.append('maxReadyTime', selectedReadyTime);
      }
    }
    // Servings filter is not added to params as it's not directly supported by API for search

    router.push(`/search/results?${params.toString()}`);
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <header className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-foreground mb-2">Discover Recipes</h1>
        <p className="text-lg text-foreground">Find your next favorite meal with our extensive recipe collection.</p>
      </header>

      {/* Search Bar and Filters Section */}
      <section className="mb-10 p-6 bg-muted rounded-xl shadow-lg">
        <div className="mb-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterDropdown label="Diet" options={DIET_OPTIONS} id="diet-filter" value={selectedDiet} onChange={setSelectedDiet} />
          <FilterDropdown label="Cuisine Preference" options={CUISINES} id="cuisine-filter" value={selectedCuisine} onChange={setSelectedCuisine} />
          <FilterDropdown label="Max Ready Time (min)" options={READY_TIME_OPTIONS} id="ready-time-filter" value={selectedReadyTime} onChange={setSelectedReadyTime} />
        </div>
        <Button 
          className="mt-6 w-full bg-primary hover:bg-accent text-background font-semibold py-3 px-4 rounded-lg transition duration-150 ease-in-out"
          onClick={handleSearch}
        >
          Search Recipes
        </Button>
      </section>

      {/* Cuisine Sections */}
      <section>
        <h2 className="text-3xl font-semibold mb-6 text-foreground">Browse by Cuisine</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {CUISINES.map((cuisine) => (
            <Link
              key={cuisine}
              href={`/search/cuisine/${encodeURIComponent(cuisine.toLowerCase().replace(/\s+/g, '-'))}`}
              className="group block p-4 bg-muted rounded-lg shadow-md hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-muted hover:border-accent"
            >
              <h3 className="text-md sm:text-lg font-medium text-foreground group-hover:text-accent transition-colors duration-300 text-center">
                {cuisine}
              </h3>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
