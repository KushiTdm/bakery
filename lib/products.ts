export type Product = {
  id: string;
  name: string;
  category: 'boulangerie' | 'viennoiserie' | 'patisserie';
  description: string;
  price: number;
  image: string;
};

export const products: Product[] = [
  {
    id: '1',
    name: 'Baguette Tradition',
    category: 'boulangerie',
    description: 'Croustillante et dorée, fermentation naturelle sur 24h',
    price: 1.30,
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800&q=80',
  },
  {
    id: '2',
    name: 'Pain au Levain',
    category: 'boulangerie',
    description: 'Pain rustique aux farines bio, à la mie alvéolée',
    price: 4.50,
    image: 'https://images.unsplash.com/photo-1585478259715-876acc5be8eb?w=800&q=80',
  },
  {
    id: '3',
    name: 'Pain aux Céréales',
    category: 'boulangerie',
    description: 'Mélange harmonieux de graines et céréales complètes',
    price: 3.80,
    image: 'https://images.unsplash.com/photo-1586444248902-2f64eddc13df?w=800&q=80',
  },
  {
    id: '4',
    name: 'Croissant Pur Beurre',
    category: 'viennoiserie',
    description: 'Feuilletage croustillant au beurre AOP Charentes-Poitou',
    price: 1.50,
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
  },
  {
    id: '5',
    name: 'Pain au Chocolat',
    category: 'viennoiserie',
    description: 'Deux barres de chocolat noir 64% de cacao',
    price: 1.60,
    image: 'https://images.unsplash.com/photo-1623334044303-241021148842?w=800&q=80',
  },
  {
    id: '6',
    name: 'Brioche Dorée',
    category: 'viennoiserie',
    description: 'Moelleuse et parfumée, idéale pour le petit-déjeuner',
    price: 3.20,
    image: 'https://images.unsplash.com/photo-1608198399988-3e5c0c2f2f6e?w=800&q=80',
  },
  {
    id: '7',
    name: 'Tarte au Citron',
    category: 'patisserie',
    description: 'Crème au citron meringuée sur pâte sablée',
    price: 4.80,
    image: 'https://images.unsplash.com/photo-1519915212116-7cfef71f1d3e?w=800&q=80',
  },
  {
    id: '8',
    name: 'Éclair au Café',
    category: 'patisserie',
    description: 'Pâte à choux garnie de crème au café, glaçage fondant',
    price: 3.90,
    image: 'https://images.unsplash.com/photo-1612201142855-e7f48e08c92b?w=800&q=80',
  },
  {
    id: '9',
    name: 'Millefeuille',
    category: 'patisserie',
    description: 'Trois couches de feuilletage et crème pâtissière vanillée',
    price: 4.50,
    image: 'https://images.unsplash.com/photo-1612180888157-90cc8f5a0c82?w=800&q=80',
  },
  {
    id: '10',
    name: 'Tarte aux Fraises',
    category: 'patisserie',
    description: 'Fraises fraîches sur crème pâtissière, pâte sucrée maison',
    price: 5.20,
    image: 'https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800&q=80',
  },
  {
    id: '11',
    name: 'Paris-Brest',
    category: 'patisserie',
    description: 'Pâte à choux pralinée aux noisettes du Piémont',
    price: 4.20,
    image: 'https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=800&q=80',
  },
  {
    id: '12',
    name: 'Fougasse Provençale',
    category: 'boulangerie',
    description: "Pain plat aux olives et herbes de Provence",
    price: 3.50,
    image: 'https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=800&q=80',
  },
];

export const categories = [
  { id: 'all', label: 'Tous nos produits' },
  { id: 'boulangerie', label: 'Boulangerie' },
  { id: 'viennoiserie', label: 'Viennoiserie' },
  { id: 'patisserie', label: 'Pâtisserie' },
] as const;
