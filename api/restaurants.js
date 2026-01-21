export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { location, radius = 8047, pageToken } = req.query; // radius in meters (default 5 miles = 8047m)

  // If no location and no pageToken, error
  if (!location && !pageToken) {
    return res.status(400).json({ error: 'Location parameter required' });
  }

  const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

  if (!GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

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

    // 1. First, look for cuisine-specific types (they end with _restaurant)
    const cuisineType = types.find(type =>
      type.endsWith('_restaurant') && type !== 'restaurant'
    );

    if (cuisineType) {
      // Clean up: "italian_restaurant" -> "Italian"
      return cuisineType
        .replace('_restaurant', '')
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    // 2. Second, check the restaurant name for cuisine keywords
    for (const [keyword, cuisine] of Object.entries(cuisineKeywords)) {
      if (name.includes(keyword)) {
        return cuisine;
      }
    }

    // 3. Fallback to "Restaurant"
    return 'Restaurant';
  };

  try {
    let data;

    // If pageToken provided, fetch next page directly (no geocoding needed)
    if (pageToken) {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${pageToken}&key=${GOOGLE_API_KEY}`
      );
      data = await response.json();
    } else {
      // Step 1: Geocode the location to get coordinates
      const geocodeResponse = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`
      );
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status !== 'OK' || !geocodeData.results || !geocodeData.results[0]) {
        return res.status(400).json({ error: 'Could not find that location. Please check the address or zip code.' });
      }

      const { lat, lng } = geocodeData.results[0].geometry.location;

      // Step 2: Use Nearby Search API (returns richer cuisine type data than Text Search)
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_API_KEY}`
      );
      data = await response.json();
    }

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

    return res.status(200).json({
      restaurants,
      nextPageToken: data.next_page_token || null
    });

  } catch (error) {
    console.error('Error fetching restaurants:', error);
    return res.status(500).json({ error: 'Failed to fetch restaurants', details: error.message });
  }
}
