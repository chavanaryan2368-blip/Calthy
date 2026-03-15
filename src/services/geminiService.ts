import { GoogleGenAI, Modality } from "@google/genai";
import { SYSTEM_INSTRUCTION, MEAL_ANALYSIS_SCHEMA, MealAnalysis, DIET_PLAN_SCHEMA, DietPlan, ASSISTANT_SYSTEM_INSTRUCTION } from "../constants";

export class GeminiService {
  private ai: GoogleGenAI | null = null;

  private getAI(): GoogleGenAI {
    if (!this.ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is missing. Please add it to your environment variables.");
      }
      this.ai = new GoogleGenAI({ apiKey });
    }
    return this.ai;
  }

  async analyzeMeal(input: string | { data: string; mimeType: string }): Promise<MealAnalysis> {
    const ai = this.getAI();
    const isImage = typeof input !== 'string';
    
    const parts = isImage 
      ? [{ inlineData: input }, { text: "Analyze this Indian meal." }]
      : [{ text: `Analyze this Indian meal: ${input}` }];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: MEAL_ANALYSIS_SCHEMA,
      },
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    return JSON.parse(text) as MealAnalysis;
  }

  async generateDietPlan(profile: any, environment: any): Promise<DietPlan> {
    const ai = this.getAI();
    const prompt = `Create a daily diet plan for:
    Age: ${profile.age}, Weight: ${profile.weight}kg, Height: ${profile.height}cm, Goal: ${profile.goal}.
    Climate: ${environment.climate}, Season: ${environment.season}.
    Include estimated costs for each meal in INR.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        systemInstruction: "You are a professional dietician. Provide a diet plan in JSON format.",
        responseMimeType: "application/json",
        responseSchema: DIET_PLAN_SCHEMA,
      },
    });

    return JSON.parse(response.text!) as DietPlan;
  }

  async chatWithAssistant(message: string, history: any[]): Promise<string> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: message,
      config: {
        systemInstruction: ASSISTANT_SYSTEM_INSTRUCTION,
      },
    });
    return response.text!;
  }

  async textToSpeech(text: string): Promise<string> {
    const ai = this.getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });
    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";
  }
}

export const geminiService = new GeminiService();
