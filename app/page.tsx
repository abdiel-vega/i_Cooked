'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

type Recipe = {
  id: number
  title: string
  image: string
  cuisines: string[]
  readyInMinutes: number
}

export default function HomePage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // For now, we'll use dummy data
    // Later, replace with actual API call
    const dummyRecipes = [
      {
        id: 1,
        title: "Spaghetti Carbonara",
        image: "/api/placeholder/300/200",
        cuisines: ["Italian"],
        readyInMinutes: 30
      },
      // Add more dummy recipes
    ]
    
    setRecipes(dummyRecipes)
    setLoading(false)
  }, [])

  if (loading) {
    return <div>Loading recipes...</div>
  }

  return (
    <div>
      <h1 className="text-3xl font-bold mb-8">Discover Recipes</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {recipes.map((recipe) => (
          <div key={recipe.id} className="border rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
            <div className="relative h-48 bg-gray-200">
              {/* We'll add actual images later */}
              <div className="flex items-center justify-center h-full text-gray-500">
                {recipe.title}
              </div>
            </div>
            
            <div className="p-4">
              <h3 className="font-semibold text-lg mb-2">{recipe.title}</h3>
              <div className="flex gap-2 mb-2">
                {recipe.cuisines.map((cuisine) => (
                  <span key={cuisine} className="text-xs bg-gray-100 px-2 py-1 rounded">
                    {cuisine}
                  </span>
                ))}
              </div>
              <p className="text-sm text-gray-600">{recipe.readyInMinutes} minutes</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}