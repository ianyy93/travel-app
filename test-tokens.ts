import { GoogleGenAI, Type } from "@google/genai";
import * as dotenv from 'dotenv';
dotenv.config();
async function test() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const config = { 
        maxOutputTokens: 15,
        responseMimeType: "application/json",
        responseSchema: { type: Type.ARRAY, items: { type: Type.NUMBER } }
    };
    let res = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: "Output a JSON array of numbers from 1 to 20.",
      config
    });
    let fullText = res.text;
    console.log("Chunk 1:", fullText);
    
    if (res.candidates?.[0]?.finishReason === "MAX_TOKENS") {
        res = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: [
                { role: 'user', parts: [{ text: "Output a JSON array of numbers from 1 to 20. Must be valid JSON matching the schema." }] },
                { role: 'model', parts: [{ text: fullText }] },
                { role: 'user', parts: [{ text: "Your JSON got cut off. Continue exactly from where you left off. Output only the raw JSON continuation characters. Do not output anything else." }] }
            ],
            config: { maxOutputTokens: 15 } // No schema on continuation!
        });
        console.log("Chunk 2:", res.text);
        fullText += res.text;
    }
  } catch (e: any) {
    console.error("Failed:", e.message);
  }
}
test();
