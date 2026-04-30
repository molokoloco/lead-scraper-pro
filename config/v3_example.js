module.exports = {
  version: 'v3', // Change export directory to "data/VX"
  location: {
    name: 'Pantin 93',
    keywords: ['pantin', '93500'],
    zip: '93500',
    coords: { lat: 48.8952, lng: 2.4008 },
    radius: 2000
  },
  categories: [
    'kinésithérapeute'
  ],
  // Catégories spécifiques à Planity
  categoriesPlanity: [
    'kinesitherapeute'
  ],
  // Spécifique pour Pappers (NAF/Keywords)
  pappersQueries: [
    'kinésithérapeute'
  ],
  // Spécifique pour Google Places
  googleTypes: [
    'physiotherapist'
  ]
};
