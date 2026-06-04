export interface Idea {
  id: string;
  letter: string;
  text: string;
  done: boolean;
  createdAt: string;
}

export interface LetterWithIdeas {
  letter: string;
  ideas: Idea[];
}

export interface StoredData {
  ideas: Idea[];
}
