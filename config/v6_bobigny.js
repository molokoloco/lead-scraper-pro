module.exports = {
    version: 'v6', // Change export directory to "data/VX"
    location: {
        name: 'Bobigny 93',
        keywords: ['bobigny', '93000'],
        zip: '93000',
        coords: { lat: 48.905015, lng: 2.366706 },
        radius: 1000
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
    // Catégories spécifiques à Planity
    categoriesPlanity: [
        'kinesitherapeute',
        'osteopathe',
        'coach',
        'reflexologue',
        'sophrologue',
        'massage',
        'bien_etre'
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
