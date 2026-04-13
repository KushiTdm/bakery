export type Product = {
  id: string;
  name: string;
  category: 'boulangerie' | 'viennoiserie' | 'patisserie';
  description: string;
  price: number;
  image: string;
  allergenes?: string[];
};

export const products: Product[] = [
  {
    id: '1',
    name: 'Baguette Tradition',
    category: 'boulangerie',
    description: 'Croustillante et dorée, fermentation naturelle sur 24h',
    price: 1.30,
    image: '/products/BaguetteTradition.jpg',
  },
  {
    id: '2',
    name: 'Pain au Levain',
    category: 'boulangerie',
    description: 'Pain rustique aux farines bio, à la mie alvéolée',
    price: 4.50,
    image: '/products/Pain_de_campagne.png',
  },
  {
    id: '3',
    name: 'Pain aux Céréales',
    category: 'boulangerie',
    description: 'Mélange harmonieux de graines et céréales complètes',
    price: 3.80,
    image: '/products/Pain_au_cereales.png',
  },
  {
    id: '4',
    name: 'Croissant Pur Beurre',
    category: 'viennoiserie',
    description: 'Feuilletage croustillant au beurre AOP Charentes-Poitou',
    price: 1.50,
    image: '/products/Croissant.png',
  },
  {
    id: '5',
    name: 'Pain au Chocolat',
    category: 'viennoiserie',
    description: 'Deux barres de chocolat noir 64% de cacao',
    price: 1.60,
    image: '/products/Croissant.png',
  },
  {
    id: '6',
    name: 'Brioche Dorée',
    category: 'viennoiserie',
    description: 'Moelleuse et parfumée, idéale pour le petit-déjeuner',
    price: 3.20,
    image: '/products/Croissant.png',
  },
  {
    id: '7',
    name: 'Tarte au Citron',
    category: 'patisserie',
    description: 'Crème au citron meringuée sur pâte sablée',
    price: 4.80,
    image: '/products/Tarte_au_citron.png',
  },
  {
    id: '8',
    name: 'Éclair au Café',
    category: 'patisserie',
    description: 'Pâte à choux garnie de crème au café, glaçage fondant',
    price: 3.90,
    image: '/products/Eclair_au_chocolat.png',
  },
  {
    id: '9',
    name: 'Millefeuille',
    category: 'patisserie',
    description: 'Trois couches de feuilletage et crème pâtissière vanillée',
    price: 4.50,
    image: '/products/Tarte_au_citron.png',
  },
  {
    id: '10',
    name: 'Tarte aux Fraises',
    category: 'patisserie',
    description: 'Fraises fraîches sur crème pâtissière, pâte sucrée maison',
    price: 5.20,
    image: '/products/Tarte_au_citron.png',
  },
  {
    id: '11',
    name: 'Paris-Brest',
    category: 'patisserie',
    description: 'Pâte à choux pralinée aux noisettes du Piémont',
    price: 4.20,
    image: '/products/Eclair_au_chocolat.png',
  },
  {
    id: '12',
    name: 'Fougasse Provençale',
    category: 'boulangerie',
    description: 'Pain plat aux olives et herbes de Provence',
    price: 3.50,
    image: '/products/Pain_de_campagne.png',
  },
];

export const categories = [
  { id: 'all', label: 'Tous nos produits' },
  { id: 'boulangerie', label: 'Boulangerie' },
  { id: 'viennoiserie', label: 'Viennoiserie' },
  { id: 'patisserie', label: 'Pâtisserie' },
] as const;