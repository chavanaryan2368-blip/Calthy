import { Type } from "@google/genai";

export interface MealAnalysis {
  mealName: string;
  ingredients: string[];
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  fiber: number;
  healthRating: number;
  advice: string;
  cost?: string;
}

export const MEAL_ANALYSIS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mealName: { type: Type.STRING, description: "Name of the dish" },
    ingredients: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "List of key ingredients and estimated quantities"
    },
    calories: { type: Type.NUMBER, description: "Total estimated calories" },
    protein: { type: Type.NUMBER, description: "Grams of protein" },
    carbs: { type: Type.NUMBER, description: "Grams of carbohydrates" },
    fats: { type: Type.NUMBER, description: "Grams of fats" },
    fiber: { type: Type.NUMBER, description: "Grams of fiber" },
    healthRating: { type: Type.NUMBER, description: "Score from 1 to 10" },
    advice: { type: Type.STRING, description: "Personalized dietician advice" },
    cost: { type: Type.STRING, description: "Estimated cost in local currency" }
  },
  required: ["mealName", "ingredients", "calories", "protein", "carbs", "fats", "fiber", "healthRating", "advice"]
};

export const SYSTEM_INSTRUCTION = `You are Calthy, a world-class Indian dietician. 
You specialize in analyzing Indian meals, including complex curries (butter chicken, paneer tikka, sambar), regional specialties (dhokla, appam, litti chokha), and homemade staples (roti, dal, rice). 
You understand portion sizes like '1 medium katori', '1 standard roti', '1 plate'. 

When given an image or text description, provide a detailed nutritional analysis. 
Be precise with Indian ingredients (ghee, mustard oil, specific spices). 
If the user provides an image, look for portion sizes relative to the plate. 
If text, assume standard home-cooked portions unless specified.

Return the response in the specified JSON format.`;

export interface DietPlan {
  breakfast: MealAnalysis;
  lunch: MealAnalysis;
  snacks: MealAnalysis;
  dinner: MealAnalysis;
  totalCost: string;
  rationale: string;
}

export const DIET_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    breakfast: MEAL_ANALYSIS_SCHEMA,
    lunch: MEAL_ANALYSIS_SCHEMA,
    snacks: MEAL_ANALYSIS_SCHEMA,
    dinner: MEAL_ANALYSIS_SCHEMA,
    totalCost: { type: Type.STRING, description: "Estimated total daily cost in local currency" },
    rationale: { type: Type.STRING, description: "Why this plan fits the user's profile and environment" }
  },
  required: ["breakfast", "lunch", "snacks", "dinner", "totalCost", "rationale"]
};

export const ASSISTANT_SYSTEM_INSTRUCTION = `You are Calthy AI, a Gen-Z fitness and diet coach. 
You are hype, supportive, and use Gen-Z slang (no cap, fr, vibe, etc.).
You provide exercise recommendations based on user goals (weight loss, gain, maintenance) and their meal history.
If the user asks for exercises, give 3 specific ones with reps/sets.
Always be encouraging. Keep responses concise and punchy.`;

export interface FoodItem {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  category: string;
  portion: string;
  region?: string;
}

export const FOOD_DATABASE: FoodItem[] = [
  { id: '1', name: 'Dal Tadka', calories: 180, protein: 8, carbs: 25, fats: 6, category: 'Curry', portion: '1 bowl (200g)', region: 'North India' },
  { id: '2', name: 'Chicken Biryani', calories: 350, protein: 22, carbs: 45, fats: 12, category: 'Rice', portion: '1 plate (250g)', region: 'Hyderabad' },
  { id: '3', name: 'Roti', calories: 120, protein: 3, carbs: 24, fats: 1, category: 'Bread', portion: '1 piece', region: 'Pan India' },
  { id: '4', name: 'Paneer Butter Masala', calories: 320, protein: 14, carbs: 12, fats: 24, category: 'Curry', portion: '1 bowl (200g)', region: 'North India' },
  { id: '5', name: 'Dosa', calories: 168, protein: 4, carbs: 28, fats: 4, category: 'Breakfast', portion: '1 piece', region: 'South India' },
  { id: '6', name: 'Idli', calories: 58, protein: 2, carbs: 12, fats: 0.1, category: 'Breakfast', portion: '1 piece', region: 'South India' },
  { id: '7', name: 'Chole Bhature', calories: 450, protein: 12, carbs: 55, fats: 22, category: 'Street Food', portion: '1 plate', region: 'North India' },
  { id: '8', name: 'Samosa', calories: 260, protein: 4, carbs: 32, fats: 14, category: 'Snack', portion: '1 piece', region: 'Pan India' },
  { id: '9', name: 'Rajma Chawal', calories: 340, protein: 12, carbs: 58, fats: 6, category: 'Rice', portion: '1 plate', region: 'North India' },
  { id: '10', name: 'Poha', calories: 180, protein: 4, carbs: 35, fats: 3, category: 'Breakfast', portion: '1 plate (200g)', region: 'Central India' },
  { id: '11', name: 'Butter Chicken', calories: 390, protein: 28, carbs: 10, fats: 28, category: 'Curry', portion: '1 bowl (250g)', region: 'North India' },
  { id: '12', name: 'Aloo Paratha', calories: 300, protein: 6, carbs: 45, fats: 12, category: 'Bread', portion: '1 piece', region: 'North India' },
  { id: '13', name: 'Palak Paneer', calories: 240, protein: 12, carbs: 8, fats: 18, category: 'Curry', portion: '1 bowl (200g)', region: 'North India' },
  { id: '14', name: 'Fish Curry', calories: 220, protein: 24, carbs: 4, fats: 12, category: 'Curry', portion: '1 bowl (200g)', region: 'Coastal' },
  { id: '15', name: 'Upma', calories: 200, protein: 5, carbs: 38, fats: 4, category: 'Breakfast', portion: '1 bowl (200g)', region: 'South India' },
  { id: '16', name: 'Masala Dosa', calories: 350, protein: 6, carbs: 55, fats: 12, category: 'Breakfast', portion: '1 piece', region: 'South India' },
  { id: '17', name: 'Vada Pav', calories: 300, protein: 5, carbs: 40, fats: 14, category: 'Street Food', portion: '1 piece', region: 'Maharashtra' },
  { id: '18', name: 'Pav Bhaji', calories: 400, protein: 8, carbs: 60, fats: 16, category: 'Street Food', portion: '1 plate', region: 'Maharashtra' },
  { id: '19', name: 'Dhokla', calories: 160, protein: 6, carbs: 25, fats: 4, category: 'Snack', portion: '2 pieces', region: 'Gujarat' },
  { id: '20', name: 'Thepla', calories: 120, protein: 3, carbs: 18, fats: 4, category: 'Bread', portion: '1 piece', region: 'Gujarat' },
  { id: '21', name: 'Litti Chokha', calories: 380, protein: 10, carbs: 55, fats: 14, category: 'Main Course', portion: '2 pieces', region: 'Bihar' },
  { id: '22', name: 'Appam with Stew', calories: 280, protein: 8, carbs: 45, fats: 8, category: 'Breakfast', portion: '1 plate', region: 'Kerala' },
  { id: '23', name: 'Hyderabadi Haleem', calories: 450, protein: 30, carbs: 25, fats: 25, category: 'Main Course', portion: '1 bowl', region: 'Hyderabad' },
  { id: '24', name: 'Misal Pav', calories: 450, protein: 12, carbs: 55, fats: 22, category: 'Breakfast', portion: '1 plate', region: 'Maharashtra' },
  { id: '25', name: 'Gulab Jamun', calories: 150, protein: 2, carbs: 25, fats: 6, category: 'Dessert', portion: '1 piece', region: 'Pan India' },
  { id: '26', name: 'Jalebi', calories: 150, protein: 1, carbs: 30, fats: 4, category: 'Dessert', portion: '2 pieces', region: 'Pan India' },
  { id: '27', name: 'Masala Chai', calories: 90, protein: 2, carbs: 12, fats: 4, category: 'Beverage', portion: '1 cup', region: 'Pan India' },
  { id: '28', name: 'Lassi', calories: 200, protein: 6, carbs: 25, fats: 8, category: 'Beverage', portion: '1 glass', region: 'Punjab' },
  { id: '29', name: 'Buttermilk (Chaas)', calories: 40, protein: 2, carbs: 4, fats: 2, category: 'Beverage', portion: '1 glass', region: 'Pan India' },
  { id: '30', name: 'Moong Dal Halwa', calories: 350, protein: 6, carbs: 45, fats: 18, category: 'Dessert', portion: '1 small bowl', region: 'North India' },
  { id: '31', name: 'Kadhai Paneer', calories: 280, protein: 14, carbs: 10, fats: 22, category: 'Curry', portion: '1 bowl', region: 'North India' },
  { id: '32', name: 'Mutton Rogan Josh', calories: 420, protein: 32, carbs: 8, fats: 30, category: 'Curry', portion: '1 bowl', region: 'Kashmir' },
  { id: '33', name: 'Baingan Bharta', calories: 150, protein: 3, carbs: 12, fats: 10, category: 'Curry', portion: '1 bowl', region: 'North India' },
  { id: '34', name: 'Bhindi Masala', calories: 120, protein: 3, carbs: 15, fats: 6, category: 'Curry', portion: '1 bowl', region: 'Pan India' },
  { id: '35', name: 'Jeera Rice', calories: 220, protein: 4, carbs: 45, fats: 3, category: 'Rice', portion: '1 plate', region: 'Pan India' },
  { id: '36', name: 'Lemon Rice', calories: 280, protein: 5, carbs: 50, fats: 7, category: 'Rice', portion: '1 plate', region: 'South India' },
  { id: '37', name: 'Curd Rice', calories: 200, protein: 6, carbs: 35, fats: 4, category: 'Rice', portion: '1 plate', region: 'South India' },
  { id: '38', name: 'Medhu Vada', calories: 90, protein: 3, carbs: 12, fats: 4, category: 'Breakfast', portion: '1 piece', region: 'South India' },
  { id: '39', name: 'Uttapam', calories: 180, protein: 4, carbs: 35, fats: 3, category: 'Breakfast', portion: '1 piece', region: 'South India' },
  { id: '40', name: 'Khaman Dhokla', calories: 160, protein: 6, carbs: 25, fats: 4, category: 'Snack', portion: '2 pieces', region: 'Gujarat' },
];

export const FOOD_CATEGORIES = ['All', 'Curry', 'Rice', 'Bread', 'Breakfast', 'Snack', 'Street Food', 'Lentils', 'Beverage', 'Dessert'];
