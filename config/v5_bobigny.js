module.exports = {
    version: 'v5', // Change export directory to "data/VX"
    location: {
        name: 'Bobigny 93',
        keywords: ['bobigny', '93000'],
        zip: '93000',
        coords: { lat: 48.905015, lng: 2.366706 },
        radius: 1000
    },
    categories: [
        'paysagiste',
        'architecte'
    ],
    // Spécifique pour Pappers (NAF/Keywords)
    pappersQueries: [
        'paysagiste',
        'architecte'
    ],
    // Catégories spécifiques à Planity
    categoriesPlanity: [
        'paysagiste',
        'architecte'
    ],
    // Spécifique pour Google Places
    googleTypes: [
        'architect'
    ]
};
