// A broad, searchable catalogue for quick-match suggestions. People can still
// add any safe custom interest; this list only powers autocomplete.
export const matchInterestCatalog = [
  // Music & audio
  'Music', 'K-pop', 'Hip-hop', 'Pop', 'Rock',
  'Afrobeats', 'R&B', 'Jazz', 'Classical music', 'Indie music',
  'Electronic music', 'House music', 'Techno', 'Country music', 'Reggae',
  'Latin music', 'Metal', 'Punk', 'Soul music', 'Funk',
  'Live music', 'Music festivals', 'Vinyl records', 'Karaoke', 'Songwriting',

  // Film & television
  'Movies', 'TV series', 'Anime', 'Documentaries', 'Comedies',
  'Romantic comedies', 'Horror movies', 'Science fiction', 'Fantasy films', 'Action movies',
  'Thrillers', 'Independent films', 'Classic cinema', 'Foreign films', 'Animation',
  'Reality TV', 'Crime shows', 'Sitcoms', 'Period dramas', 'Superhero movies',
  'Film photography', 'Movie nights', 'Film festivals', 'Screenwriting', 'Cinema history',

  // Gaming & tabletop
  'Gaming', 'PC gaming', 'Console gaming', 'Mobile gaming', 'Indie games',
  'Retro gaming', 'Board games', 'Card games', 'Chess', 'Dungeons & Dragons',
  'Role-playing games', 'Strategy games', 'Cozy games', 'Racing games', 'Sports games',
  'Puzzle games', 'Escape rooms', 'Trivia nights', 'Esports', 'Game development',
  'Virtual reality', 'Tabletop games', 'Arcade games', 'Pokémon', 'Fantasy worlds',

  // Books & writing
  'Books', 'Fiction', 'Nonfiction', 'Fantasy books', 'Science fiction books',
  'Mystery novels', 'Romance novels', 'Historical fiction', 'Poetry', 'Comics',
  'Manga', 'Graphic novels', 'Audiobooks', 'Book clubs', 'Creative writing',
  'Journaling', 'Blogging', 'Short stories', 'Memoirs', 'Philosophy books',
  'Psychology books', 'Biographies', 'Literary fiction', 'Spoken word', 'Libraries',

  // Art, design & making
  'Art', 'Drawing', 'Painting', 'Watercolor', 'Illustration',
  'Digital art', 'Graphic design', 'Product design', 'Interior design', 'Architecture',
  'Ceramics', 'Pottery', 'Sculpture', 'Woodworking', 'Calligraphy',
  'Hand lettering', 'Photography', 'Street photography', 'Portrait photography', 'Fashion photography',
  'Filmmaking', 'Video editing', 'Memes', 'Collage', 'Museum visits',

  // Food & drink
  'Food & cooking', 'Baking', 'Coffee', 'Tea', 'Wine tasting',
  'Craft beer', 'Cocktails', 'Mocktails', 'Italian food', 'Japanese food',
  'Korean food', 'Indian food', 'Mexican food', 'Thai food', 'Mediterranean food',
  'Vegan cooking', 'Vegetarian food', 'Street food', 'Fine dining', 'Brunch',
  'BBQ', 'Desserts', 'Chocolate', 'Food markets', 'Trying new restaurants',

  // Travel & culture
  'Travel', 'Weekend trips', 'Backpacking', 'Road trips', 'Solo travel',
  'Luxury travel', 'Budget travel', 'Train travel', 'Van life', 'City breaks',
  'Beach holidays', 'Mountain escapes', 'Island hopping', 'Camping trips', 'Cultural travel',
  'Food tourism', 'Adventure travel', 'Hidden gems', 'World heritage sites', 'Travel photography',
  'Learning abroad', 'Digital nomad life', 'Staycations', 'Travel planning', 'Language exchange',

  // Outdoors & nature
  'Nature', 'Hiking', 'Camping', 'Backpacking outdoors', 'Trekking',
  'Rock climbing', 'Bouldering', 'Mountaineering', 'Birdwatching', 'Stargazing',
  'Gardening', 'Houseplants', 'Foraging', 'Fishing', 'Kayaking',
  'Canoeing', 'Sailing', 'Surfing', 'Scuba diving', 'Snorkeling',
  'Paddleboarding', 'Picnics', 'National parks', 'Waterfalls', 'Sunrise chasing',

  // Fitness & wellness
  'Fitness', 'Running', 'Gym workouts', 'Weightlifting', 'Bodybuilding',
  'CrossFit', 'Yoga', 'Pilates', 'Barre', 'Dance fitness',
  'Cycling', 'Indoor cycling', 'Swimming', 'Walking', 'Meditation',
  'Mindfulness', 'Breathwork', 'Cold plunging', 'Sauna', 'Nutrition',
  'Healthy cooking', 'Sleep wellness', 'Self-care', 'Mental wellness', 'Personal growth',

  // Team sports & fandom
  'Football', 'Basketball', 'Volleyball', 'Beach volleyball', 'Baseball',
  'Softball', 'Cricket', 'Rugby', 'Hockey', 'Ice hockey',
  'Field hockey', 'Handball', 'Netball', 'Water polo', 'Futsal',
  'Ultimate frisbee', 'Flag football', 'Lacrosse', 'Pickleball', 'Padel',
  'Tennis doubles', 'Sports fandom', 'Fantasy sports', 'Stadium trips', 'Local leagues',

  // Individual & adventure sports
  'Formula 1', 'Motorsports', 'Tennis', 'Badminton', 'Table tennis',
  'Golf', 'Boxing', 'Kickboxing', 'Martial arts', 'Judo',
  'Karate', 'Taekwondo', 'Wrestling', 'Fencing', 'Archery',
  'Skateboarding', 'Roller skating', 'Skiing', 'Snowboarding', 'Ice skating',
  'Horse riding', 'Parkour', 'Triathlons', 'Marathon training', 'Adventure racing',

  // Technology & science
  'Tech', 'AI', 'Coding', 'Web development', 'App development',
  'Game programming', 'Cybersecurity', 'Robotics', 'Data science', 'Machine learning',
  'Cloud computing', 'Open source', 'Startups', 'Gadgets', 'Smart homes',
  '3D printing', 'Drones', 'Space', 'Astronomy', 'Physics',
  'Biology', 'Neuroscience', 'Climate science', 'Renewable energy', 'Future technology',

  // Learning & ideas
  'Study', 'Languages', 'History', 'Ancient history', 'Modern history',
  'Archaeology', 'Geography', 'Economics', 'Politics', 'Current events',
  'Sociology', 'Anthropology', 'Psychology', 'Philosophy', 'Literature',
  'Mathematics', 'Chemistry', 'Medicine', 'Law', 'Language learning',
  'Italian language', 'Spanish language', 'French language', 'German language', 'Japanese language',

  // Going out
  'Nightclubs', 'Dancing', 'Salsa dancing', 'Bachata', 'Ballroom dancing',
  'Live comedy', 'Stand-up comedy', 'Theatre', 'Musicals', 'Concerts',
  'Festivals', 'Art galleries', 'Museums', 'Bars', 'Pubs',
  'Rooftop bars', 'Dinner parties', 'House parties', 'Karaoke nights', 'Quiz nights',
  'Bowling', 'Mini golf', 'Farmers markets', 'Flea markets', 'Thrifting',

  // Staying in
  'Staying in', 'Movie marathons', 'TV binges', 'Home cooking', 'Cozy nights',
  'Reading at home', 'Board game nights', 'Video game nights', 'Puzzle nights', 'Baking days',
  'Sunday mornings', 'Lazy weekends', 'Podcasts', 'True crime podcasts', 'Music podcasts',
  'ASMR', 'Streaming', 'Home cinema', 'Tea time', 'Coffee at home',
  'Candle collecting', 'Scrapbooking', 'Knitting', 'Crocheting', 'Jigsaw puzzles',

  // Style, beauty & home
  'Fashion', 'Streetwear', 'Vintage fashion', 'Sustainable fashion', 'Luxury fashion',
  'Sneakers', 'Watches', 'Jewelry', 'Makeup', 'Skincare',
  'Haircare', 'Nail art', 'Fragrance', 'Tattoos', 'Piercings',
  'Cosplay', 'Sewing', 'Upcycling', 'Home decor', 'DIY projects',
  'Furniture restoration', 'Minimalism', 'Maximalism', 'Vintage shopping', 'Personal style',

  // Pets, animals & plants
  'Pets', 'Dogs', 'Cats', 'Puppies', 'Kittens',
  'Rescue animals', 'Animal shelters', 'Dog walking', 'Dog training', 'Cat cafés',
  'Horses', 'Birds', 'Parrots', 'Rabbits', 'Hamsters',
  'Reptiles', 'Aquariums', 'Marine life', 'Wildlife', 'Wildlife photography',
  'Zoos', 'Animal conservation', 'Botany', 'Succulents', 'Flower arranging',

  // Work, business & ambition
  'Business', 'Entrepreneurship', 'Investing', 'Personal finance', 'Marketing',
  'Branding', 'Sales', 'Product management', 'Project management', 'Leadership',
  'Networking', 'Freelancing', 'Remote work', 'Coworking', 'Career growth',
  'Mentoring', 'Public speaking', 'Negotiation', 'E-commerce', 'Small business',
  'Social enterprise', 'Real estate', 'Astrology', 'Creative careers', 'Side projects',

  // Values & community
  'Volunteering', 'Environmentalism', 'Sustainability', 'Climate action', 'Animal welfare',
  'Human rights', 'Voter rights', 'Community building', 'Local activism', 'Charity work',
  'Education access', 'Mental health advocacy', 'Disability inclusion', 'LGBTQ+ allyship', 'Gender equality',
  'Racial justice', 'Body positivity', 'Kindness', 'Positivity', 'Spirituality',
  'Faith', 'Cultural exchange', 'Social impact', 'Ethical living', 'Zero waste',

  // Connection & personality
  'Relationships', 'Dating', 'Friendship', 'New friendships', 'Deep conversations',
  'Late night talks', 'Funny conversations', 'Random conversations', 'Life stories', 'Childhood nostalgia',
  'Personal goals', 'Dream sharing', 'Travel stories', 'Cultural stories', 'Career talks',
  'Creative collaboration', 'Accountability buddies', 'Study buddies', 'Workout partners', 'Language partners',
  'Introverts', 'Extroverts', 'Ambiverts', 'Optimism', 'Curiosity',
] as const;
