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
    const restaurants = data.results.map(place => {
      // Extract a more meaningful cuisine type from the place types
      const cuisineTypes = place.types?.filter(t =>
        !['restaurant', 'food', 'point_of_interest', 'establishment'].includes(t)
      ) || [];

      let cuisine = cuisineTypes[0]?.replace(/_/g, ' ') || 'Restaurant';
      // Capitalize first letter of each word
      cuisine = cuisine.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');

      return {
        name: place.name,
        cuisine: cuisine,
        location: place.vicinity || place.formatted_address?.split(',')[0] || 'Unknown location',
        rating: place.rating || null,
        priceLevel: place.price_level || null,
        placeId: place.place_id
      };
    });

    return res.status(200).json({ restaurants });

  } catch (error) {
    console.error('Error fetching restaurants:', error);
    return res.status(500).json({ error: 'Failed to fetch restaurants', details: error.message });
  }
}
