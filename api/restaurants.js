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

  // Cuisine keywords to look for in restaurant names
  // Sorted by length at runtime to match longer phrases first (e.g., "dim sum" before "sum")
  const cuisineKeywords = {
    'fried chicken': 'American',
    'soul food': 'Soul Food',
    'latin american': 'Mexican',
    'middle eastern': 'Mediterranean',
    'dim sum': 'Chinese',
    'banh mi': 'Vietnamese',
    'tex-mex': 'Tex-Mex',
    'fast food': 'American',
    'pizzeria': 'Pizza',
    'taqueria': 'Mexican',
    'steakhouse': 'Steakhouse',
    'barbecue': 'BBQ',
    'szechuan': 'Chinese',
    'cantonese': 'Chinese',
    'teriyaki': 'Japanese',
    'hibachi': 'Japanese',
    'shawarma': 'Mediterranean',
    'gastropub': 'Gastropub',
    'mediterranean': 'Mediterranean',
    'vietnamese': 'Vietnamese',
    'argentinian': 'Argentinian',
    'singaporean': 'Singaporean',
    'indonesian': 'Indonesian',
    'vegetarian': 'Vegetarian',
    'ethiopian': 'Ethiopian',
    'caribbean': 'Caribbean',
    'brazilian': 'Brazilian',
    'malaysian': 'Malaysian',
    'peruvian': 'Peruvian',
    'lebanese': 'Lebanese',
    'moroccan': 'Moroccan',
    'jamaican': 'Caribbean',
    'hawaiian': 'Hawaiian',
    'japanese': 'Japanese',
    'filipino': 'Filipino',
    'southern': 'Southern',
    'mexican': 'Mexican',
    'italian': 'Italian',
    'chinese': 'Chinese',
    'turkish': 'Turkish',
    'spanish': 'Spanish',
    'african': 'African',
    'indian': 'Indian',
    'korean': 'Korean',
    'french': 'French',
    'creole': 'Cajun',
    'greek': 'Greek',
    'cuban': 'Cuban',
    'cajun': 'Cajun',
    'vegan': 'Vegan',
    'hunan': 'Chinese',
    'pizza': 'Pizza',
    'sushi': 'Sushi',
    'thai': 'Thai',
    'taco': 'Mexican',
    'burrito': 'Mexican',
    'curry': 'Indian',
    'pho': 'Vietnamese',
    'bbq': 'BBQ',
    'burger': 'American',
    'steak': 'Steakhouse',
    'seafood': 'Seafood',
    'pasta': 'Italian',
    'ramen': 'Japanese',
    'gyro': 'Greek',
    'falafel': 'Mediterranean',
    'kebab': 'Mediterranean',
    'bistro': 'French',
    'wok': 'Chinese',
    'noodle': 'Asian',
    'dumpling': 'Asian',
    'poke': 'Hawaiian',
    'wings': 'American',
    'deli': 'Deli',
    'sandwich': 'Sandwiches',
    'bakery': 'Bakery',
    'cafe': 'Cafe',
    'coffee': 'Cafe',
    'breakfast': 'Breakfast',
    'brunch': 'Brunch',
    'diner': 'American',
    'pub': 'Pub',
    'tapas': 'Spanish',
    'grill': 'American'
  };

  // Extract cuisine type from restaurant name using keyword matching
  const getCuisineType = (place) => {
    const name = (place.name || '').toLowerCase();

    // Sort keywords by length (longest first) to match "dim sum" before "sum"
    const sortedKeywords = Object.entries(cuisineKeywords)
      .sort((a, b) => b[0].length - a[0].length);

    for (const [keyword, cuisine] of sortedKeywords) {
      if (name.includes(keyword)) {
        return cuisine;
      }
    }

    return 'Restaurant';
  };

  try {
    // Step 1: Geocode the location to get coordinates
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${GOOGLE_API_KEY}`
    );
    const geocodeData = await geocodeResponse.json();

    if (geocodeData.status !== 'OK' || !geocodeData.results || !geocodeData.results[0]) {
      return res.status(400).json({ error: 'Could not find that location. Please check the address or zip code.' });
    }

    const { lat, lng } = geocodeData.results[0].geometry.location;

    // Step 2: Fetch up to 3 pages to build a pool of ~60 restaurants
    let allResults = [];

    // Page 1
    let response = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=restaurant&key=${GOOGLE_API_KEY}`
    );
    let data = await response.json();

    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: 'Google Places API error', details: data.status });
    }

    allResults = [...(data.results || [])];

    // Page 2 (if available) - Google requires ~2 second delay between pagination requests
    if (data.next_page_token) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${data.next_page_token}&key=${GOOGLE_API_KEY}`
      );
      data = await response.json();
      if (data.results) {
        allResults = [...allResults, ...data.results];
      }
    }

    // Page 3 (if available)
    if (data.next_page_token) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      response = await fetch(
        `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${data.next_page_token}&key=${GOOGLE_API_KEY}`
      );
      data = await response.json();
      if (data.results) {
        allResults = [...allResults, ...data.results];
      }
    }

    if (allResults.length === 0) {
      return res.status(200).json({ restaurants: [], message: 'No restaurants found in this area' });
    }

    // Step 3: Fisher-Yates shuffle for true randomization
    for (let i = allResults.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allResults[i], allResults[j]] = [allResults[j], allResults[i]];
    }

    // Step 4: Format ALL shuffled results (frontend will paginate)
    const restaurants = allResults.map(place => ({
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
