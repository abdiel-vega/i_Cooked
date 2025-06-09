'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CUISINES, DIETS as DIET_OPTIONS, MEAL_TYPES } from '@/lib/spoonacular';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// searchbar component
const SearchBar = ({ value, onChange, onKeyDown }: { value: string; onChange: (value: string) => void; onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void; }) => (
  <input
    type="text"
    placeholder="Search recipes, ingredients..."
    className="p-3 placeholder-muted-foreground bg-background text-foreground rounded-lg w-full focus:ring-2 focus:ring-accent focus:border-transparent outline-none"
    aria-label="Search recipes"
    value={value}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={onKeyDown}
  />
);

// ready time options (in minutes)
const READY_TIME_OPTIONS = ["15", "30", "45", "60", "90", "120+"];


export default function SearchPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDiet, setSelectedDiet] = useState('');
  const [selectedCuisine, setSelectedCuisine] = useState('');
  const [selectedReadyTime, setSelectedReadyTime] = useState('');
  const [selectedMealType, setSelectedMealType] = useState('');

  const handleSearch = () => {
    const params = new URLSearchParams();
    if (searchQuery) params.append('query', searchQuery);
    if (selectedDiet) params.append('diet', selectedDiet);
    if (selectedCuisine) params.append('cuisine', selectedCuisine);
    if (selectedMealType) params.append('type', selectedMealType);
    if (selectedReadyTime) {
      if (selectedReadyTime === "120+") {
        params.append('maxReadyTime', '120'); // or a higher number, or handle as "any"
      } else if (selectedReadyTime) {
        params.append('maxReadyTime', selectedReadyTime);
      }
    }

    router.push(`/search/results?${params.toString()}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="container mx-auto">
      <header className="mb-6 text-center sm:mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2 sm:text-4xl">Discover Recipes</h1>
        <p className="text-base text-foreground sm:text-lg">Find and learn how to cook your next meal!</p>
      </header>

      {/* search bar and filters section */}
      <section className="mb-8 p-4 bg-muted rounded-xl shadow-lg sm:p-6 sm:mb-10">
        <div className="mb-4 sm:mb-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} onKeyDown={handleKeyDown} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"> {/* adjusted grid to 4 cols for filters */}
          {/* diet filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="filter" className="w-full justify-between">
                {selectedDiet || "Select Diet"}
                <span className="ml-2 text-xs opacity-70">▼</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Diet Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedDiet} onValueChange={setSelectedDiet}>
                <DropdownMenuRadioItem value="">Any</DropdownMenuRadioItem>
                {DIET_OPTIONS.map((diet) => (
                  <DropdownMenuRadioItem key={diet} value={diet}>
                    {diet}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* cuisine filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="filter" className="w-full justify-between">
                {selectedCuisine || "Select Cuisine"}
                <span className="ml-2 text-xs opacity-70">▼</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Cuisine Preference</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedCuisine} onValueChange={setSelectedCuisine}>
                <DropdownMenuRadioItem value="">Any</DropdownMenuRadioItem>
                {CUISINES.map((cuisine) => (
                  <DropdownMenuRadioItem key={cuisine} value={cuisine}>
                    {cuisine}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ready time filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="filter" className="w-full justify-between">
                {selectedReadyTime ? (selectedReadyTime === "120+" ? "120+ min" : `${selectedReadyTime} min`) : "Max Ready Time"}
                <span className="ml-2 text-xs opacity-70">▼</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Max Ready Time (minutes)</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedReadyTime} onValueChange={setSelectedReadyTime}>
                <DropdownMenuRadioItem value="">Any</DropdownMenuRadioItem>
                {READY_TIME_OPTIONS.map((time) => (
                  <DropdownMenuRadioItem key={time} value={time}>
                    {time === "120+" ? "120+" : time}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* meal type filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="filter" className="w-full justify-between">
                {selectedMealType || "Select Meal Type"}
                <span className="ml-2 text-xs opacity-70">▼</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Meal Type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup value={selectedMealType} onValueChange={setSelectedMealType}>
                <DropdownMenuRadioItem value="">Any</DropdownMenuRadioItem>
                {MEAL_TYPES.map((type) => (
                  <DropdownMenuRadioItem key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          className="mt-4 w-full bg-primary hover:bg-accent text-background font-semibold py-3 px-4 rounded-lg transition duration-150 ease-in-out sm:mt-6"
          onClick={handleSearch}
        >
          Search Recipes
        </Button>
      </section>

      {/* cuisine sections */}
      <section>
        <h2 className="text-2xl font-semibold mb-4 text-foreground sm:text-3xl sm:mb-6">Browse by Cuisine</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {CUISINES.map((cuisine) => (
            <Link
              key={cuisine}
              href={`/search/cuisine/${encodeURIComponent(cuisine.toLowerCase().replace(/\s+/g, '-'))}`}
              className="group block p-3 bg-muted rounded-lg shadow-md hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 border border-muted hover:border-accent sm:p-4"
            >
              <h3 className="text-base font-medium text-foreground group-hover:text-accent transition-colors duration-300 text-center sm:text-md">
                {cuisine}
              </h3>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
