export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { location, radius = 8047 } = req.query; // radius in meters (default 5 miles = 8047m)

  if (!location) {
    return res.status(400).json({ error: 'Location parameter required' });
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  // Generic types to filter out when looking for cuisine
  const genericTypes = [
    'restaurant', 'food', 'point_of_interest', 'establishment',
    'bar', 'cafe', 'meal_takeaway', 'meal_delivery', 'store',
    'liquor_store', 'convenience_store', 'grocery_or_supermarket'
  ];

  // Cuisine keywords to look for in restaurant names
  const cuisineKeywords = {
    'pizza': 'Pizza',
    'pizzeria': 'Pizza',
    'sushi': 'Sushi',
    'thai': 'Thai',
    'chinese': 'Chinese',
    'mexican': 'Mexican',
    'taco': 'Mexican',
    'taqueria': 'Mexican',
    'burrito': 'Mexican',
    'indian': 'Indian',
    'curry': 'Indian',
    'vietnamese': 'Vietnamese',
    'pho': 'Vietnamese',
    'banh mi': 'Vietnamese',
    'korean': 'Korean',
    'bbq': 'BBQ',
    'barbecue': 'BBQ',
    'burger': 'American',
    'steakhouse': 'Steakhouse',
    'steak': 'Steakhouse',
    'seafood': 'Seafood',
    'italian': 'Italian',
    'pasta': 'Italian',
    'ramen': 'Japanese',
    'japanese': 'Japanese',
    'teriyaki': 'Japanese',
    'hibachi': 'Japanese',
    'mediterranean': 'Mediterranean',
    'greek': 'Greek',
    'gyro': 'Greek',
    'falafel': 'Mediterranean',
    'shawarma': 'Mediterranean',
    'kebab': 'Mediterranean',
    'french': 'French',
    'bistro': 'French',
    'dim sum': 'Chinese',
    'szechuan': 'Chinese',
    'cantonese': 'Chinese',
    'hunan': 'Chinese',
    'wok': 'Chinese',
    'noodle': 'Asian',
    'dumpling': 'Asian',
    'peruvian': 'Peruvian',
    'cuban': 'Cuban',
    'caribbean': 'Caribbean',
    'jamaican': 'Caribbean',
    'hawaiian': 'Hawaiian',
    'poke': 'Hawaiian',
    'ethiopian': 'Ethiopian',
    'african': 'African',
    'soul food': 'Soul Food',
    'southern': 'Southern',
    'cajun': 'Cajun',
    'creole': 'Cajun',
    'tex-mex': 'Tex-Mex',
    'wings': 'American',
    'fried chicken': 'American',
    'deli': 'Deli',
    'sandwich': 'Sandwiches',
    'sub': 'Sandwiches',
    'bakery': 'Bakery',
    'cafe': 'Cafe',
    'coffee': 'Cafe',
    'breakfast': 'Breakfast',
    'brunch': 'Brunch',
    'diner': 'American',
    'pub': 'Pub',
    'gastropub': 'Gastropub',
    'tapas': 'Spanish',
    'spanish': 'Spanish',
    'brazilian': 'Brazilian',
    'argentinian': 'Argentinian',
    'turkish': 'Turkish',
    'lebanese': 'Lebanese',
    'moroccan': 'Moroccan',
    'filipino': 'Filipino',
    'malaysian': 'Malaysian',
    'singaporean': 'Singaporean',
    'indonesian': 'Indonesian',
    'vegan': 'Vegan',
    'vegetarian': 'Vegetarian'
  };

  // Extract cuisine type from place data
  const getCuisineType = (place) => {
    const types = place.types || [];
    const name = (place.name || '').toLowerCase();

    // First, check the types array for specific cuisine types
    const specificType = types.find(type => !genericTypes.includes(type));

    if (specificType) {
      // Clean up the type: "italian_restaurant" -> "Italian"
      let cuisine = specificType
        .replace('_restaurant', '')
        .replace('_', ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      // Skip generic results like "Meal Takeaway"
      if (!['Meal Takeaway', 'Meal Delivery', 'Night Club', 'Lodging'].includes(cuisine)) {
        return cuisine;
      }
    }

    // Second, check the restaurant name for cuisine keywords
    for (const [keyword, cuisineType] of Object.entries(cuisineKeywords)) {
      if (name.includes(keyword)) {
        return cuisineType;
      }
    }

    // Fallback to "Restaurant"
    return 'Restaurant';
  };

  try {
    // Call Google Places API - Text Search for restaurants
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/textsearch/json?query=restaurants+near+${encodeURIComponent(location)}&radius=${radius}&type=restaurant&key=${GOOGLE_API_KEY}`
    );

    const data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: 'Google Places API error', details: data.status });
    }

    if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
      return res.status(200).json({ restaurants: [], message: 'No restaurants found in this area' });
    }

    // Format the results to match our app's structure
    const restaurants = data.results.map(place => ({
      name: place.name,
      cuisine: getCuisineType(place),
      location: place.vicinity || place.formatted_address?.split(',')[0] || 'Unknown location',
      rating: place.rating || null,
      priceLevel: place.price_level || null,
      placeId: place.place_id
    }));

    return res.status(200).json({ restaurants });

  } catch (error) {
    console.error('Error fetching restaurants:', error);
    return res.status(500).json({ error: 'Failed to fetch restaurants', details: error.message });
  }
}
