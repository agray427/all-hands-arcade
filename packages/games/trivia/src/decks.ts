export interface TriviaQuestion {
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: number;
}

export interface TriviaDeck {
  id: string;
  name: string;
  questions: TriviaQuestion[];
}

export const decks: TriviaDeck[] = [
  {
    id: "general",
    name: "General Knowledge",
    questions: [
      { prompt: "What is the capital of Australia?", choices: ["Sydney", "Melbourne", "Canberra", "Perth"], correctIndex: 2 },
      { prompt: "How many continents are there?", choices: ["five", "six", "seven", "eight"], correctIndex: 2 },
      { prompt: "Which planet is known as the Red Planet?", choices: ["Venus", "Mars", "Jupiter", "Mercury"], correctIndex: 1 },
      { prompt: "What is the largest ocean on Earth?", choices: ["Atlantic", "Indian", "Arctic", "Pacific"], correctIndex: 3 },
      { prompt: "Who painted the Mona Lisa?", choices: ["Michelangelo", "Leonardo da Vinci", "Raphael", "Rembrandt"], correctIndex: 1 },
      { prompt: "What is the longest river in the world?", choices: ["Amazon", "Nile", "Yangtze", "Mississippi"], correctIndex: 1 },
      { prompt: "Which country invented paper?", choices: ["Egypt", "Greece", "China", "India"], correctIndex: 2 },
      { prompt: "How many strings does a standard violin have?", choices: ["four", "five", "six", "seven"], correctIndex: 0 },
      { prompt: "What is the smallest country in the world?", choices: ["Monaco", "Malta", "Vatican City", "San Marino"], correctIndex: 2 },
      { prompt: "Which language has the most native speakers?", choices: ["English", "Hindi", "Spanish", "Mandarin Chinese"], correctIndex: 3 },
      { prompt: "What currency is used in Japan?", choices: ["Won", "Yuan", "Yen", "Ringgit"], correctIndex: 2 },
      { prompt: "Mount Everest sits on the border of Nepal and which country?", choices: ["India", "China", "Bhutan", "Pakistan"], correctIndex: 1 },
      { prompt: "Which instrument has 88 keys?", choices: ["Organ", "Harpsichord", "Piano", "Accordion"], correctIndex: 2 },
      { prompt: "What is the tallest animal in the world?", choices: ["Elephant", "Giraffe", "Ostrich", "Moose"], correctIndex: 1 },
      { prompt: "In which city is the Colosseum located?", choices: ["Athens", "Rome", "Istanbul", "Cairo"], correctIndex: 1 },
      { prompt: "How many sides does a hexagon have?", choices: ["five", "six", "seven", "eight"], correctIndex: 1 },
      { prompt: "Which sea creature has three hearts?", choices: ["Dolphin", "Octopus", "Shark", "Starfish"], correctIndex: 1 },
      { prompt: "What is the largest desert in the world?", choices: ["Sahara", "Gobi", "Antarctic Desert", "Arabian Desert"], correctIndex: 2 },
      { prompt: "Which country gifted the Statue of Liberty to the USA?", choices: ["England", "Spain", "France", "Italy"], correctIndex: 2 },
      { prompt: "How many minutes are in a full week?", choices: ["10,080", "1,440", "7,200", "20,160"], correctIndex: 0 },
    ],
  },
  {
    id: "science-tech",
    name: "Science & Tech",
    questions: [
      { prompt: "What does CPU stand for?", choices: ["Central Processing Unit", "Computer Personal Unit", "Central Program Utility", "Core Processing Unit"], correctIndex: 0 },
      { prompt: "What is the chemical symbol for gold?", choices: ["Go", "Gd", "Au", "Ag"], correctIndex: 2 },
      { prompt: "Which gas do plants absorb from the atmosphere?", choices: ["Oxygen", "Nitrogen", "Carbon dioxide", "Hydrogen"], correctIndex: 2 },
      { prompt: "What year was the first iPhone released?", choices: ["2005", "2007", "2009", "2010"], correctIndex: 1 },
      { prompt: "What is the hardest natural substance on Earth?", choices: ["Titanium", "Quartz", "Diamond", "Graphene"], correctIndex: 2 },
      { prompt: "Which planet has the most moons?", choices: ["Jupiter", "Saturn", "Uranus", "Neptune"], correctIndex: 1 },
      { prompt: "What does HTTP stand for?", choices: ["HyperText Transfer Protocol", "High Tech Transfer Process", "HyperText Terminal Program", "Home Tool Transfer Protocol"], correctIndex: 0 },
      { prompt: "At what temperature (Celsius) does water boil at sea level?", choices: ["90", "95", "100", "110"], correctIndex: 2 },
      { prompt: "Who developed the theory of general relativity?", choices: ["Isaac Newton", "Albert Einstein", "Niels Bohr", "Stephen Hawking"], correctIndex: 1 },
      { prompt: "What is the powerhouse of the cell?", choices: ["Nucleus", "Ribosome", "Mitochondria", "Golgi apparatus"], correctIndex: 2 },
      { prompt: "Which company created the Android operating system?", choices: ["Apple", "Google", "Android Inc.", "Samsung"], correctIndex: 2 },
      { prompt: "How many bones are in the adult human body?", choices: ["186", "206", "226", "246"], correctIndex: 1 },
      { prompt: "What does 'www' stand for?", choices: ["World Wide Web", "Wide World Web", "Web World Wide", "World Web Wire"], correctIndex: 0 },
      { prompt: "Which metal is liquid at room temperature?", choices: ["Gallium", "Mercury", "Sodium", "Lead"], correctIndex: 1 },
      { prompt: "What is the speed of light, roughly?", choices: ["300,000 km/s", "150,000 km/s", "1,000,000 km/s", "30,000 km/s"], correctIndex: 0 },
    ],
  },
  {
    id: "pop-culture",
    name: "Pop Culture",
    questions: [
      { prompt: "Which movie features the quote 'May the Force be with you'?", choices: ["Star Trek", "Star Wars", "Dune", "The Matrix"], correctIndex: 1 },
      { prompt: "How many players are on a soccer team on the field?", choices: ["nine", "ten", "eleven", "twelve"], correctIndex: 2 },
      { prompt: "Which band recorded the album 'Abbey Road'?", choices: ["The Rolling Stones", "The Beatles", "Queen", "Pink Floyd"], correctIndex: 1 },
      { prompt: "What is the name of the wizarding school in Harry Potter?", choices: ["Durmstrang", "Beauxbatons", "Hogwarts", "Ilvermorny"], correctIndex: 2 },
      { prompt: "Which streaming show features the Upside Down?", choices: ["Dark", "Stranger Things", "The OA", "Black Mirror"], correctIndex: 1 },
      { prompt: "Who is the alter ego of Tony Stark?", choices: ["Batman", "Superman", "Iron Man", "Green Lantern"], correctIndex: 2 },
      { prompt: "Which video game features the character Mario?", choices: ["Sonic", "Zelda", "Super Mario Bros.", "Mega Man"], correctIndex: 2 },
      { prompt: "In which country did the Olympic Games originate?", choices: ["Italy", "Greece", "France", "Egypt"], correctIndex: 1 },
      { prompt: "What is the highest-grossing film of all time (unadjusted)?", choices: ["Titanic", "Avengers: Endgame", "Avatar", "Star Wars: The Force Awakens"], correctIndex: 2 },
      { prompt: "Which artist painted 'The Starry Night'?", choices: ["Claude Monet", "Vincent van Gogh", "Pablo Picasso", "Salvador Dalí"], correctIndex: 1 },
      { prompt: "What board game involves buying properties like Boardwalk?", choices: ["Risk", "Clue", "Monopoly", "Life"], correctIndex: 2 },
      { prompt: "Which city hosted the first modern Olympics in 1896?", choices: ["Paris", "London", "Athens", "Rome"], correctIndex: 2 },
      { prompt: "Who wrote 'Romeo and Juliet'?", choices: ["Charles Dickens", "William Shakespeare", "Jane Austen", "Oscar Wilde"], correctIndex: 1 },
      { prompt: "Which animal is the mascot of the Linux operating system?", choices: ["Fox", "Penguin", "Gecko", "Whale"], correctIndex: 1 },
      { prompt: "How many squares are on a chessboard?", choices: ["36", "49", "64", "81"], correctIndex: 2 },
    ],
  },
];

export function deckById(id: string): TriviaDeck | null {
  return decks.find((d) => d.id === id) ?? null;
}
