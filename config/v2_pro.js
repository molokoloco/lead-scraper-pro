module.exports = {
  version: 'v2',
  location: {
    name: 'Pantin 93',
    keywords: ['pantin', '93500'],
    zip: '93500',
    coords: { lat: 48.8952, lng: 2.4008 },
    radius: 2000
  },
  categories: [
    'entreprise de rénovation générale',
    'paysagiste',
    'architecte',
    'startup saas',
    'climatisation chauffage',
    'coach sportif',
    'coach business',
    'coach santé',
    'coach carrière',
    'couvreur toiture',
    'conseil B2B',
    'kinésithérapeute',
    'expert-comptable',
    'isolation thermique',
    'rénovation énergétique',
    'toilettage animaux',
    'garde animaux'
  ],
  // Spécifique pour Pappers (NAF/Keywords)
  pappersQueries: [
    'renovation generale', 'renovation batiment',
    'paysagiste', 'espaces verts',
    'architecte', 'maitrise d oeuvre',
    'startup saas', 'editeur logiciel',
    'climatisation', 'chauffagiste',
    'coach sportif', 'coach business', 'coach carriere',
    'couvreur', 'toiture',
    'conseil b2b', 'consultant gestion',
    'kinesitherapeute', 'cabinet kine',
    'expert comptable', 'cabinet comptable',
    'isolation thermique', 'renovation energetique',
    'toilettage animaux', 'pension canine'
  ],
  // Spécifique pour Google Places
  googleTypes: [
    'general_contractor',
    'architect',
    'hvac_contractor',
    'physiotherapist',
    'accounting',
    'roofing_contractor',
    'veterinary_care',
    'pet_store',
    'gym',
    'real_estate_agency',
    'establishment'
  ]
};
