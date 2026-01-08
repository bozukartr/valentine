import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

const GEMINI_API_KEY = "AIzaSyB7Ok69yfywK5Gcbmj7JS1gko3IOJ-H2uU";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateAllDistractors(answersAndQuestions, retryCount = 0) {
    if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
        return answersAndQuestions.map(() => ["Alternatif 1", "Alternatif 2"]);
    }

    // Using gemini-2.5-flash as requested
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Aşağıdaki 5 soru ve cevap için, her birine uygun 2 tane yanıltıcı (yanlış) seçenek üret. 
    Lütfen her soru için SADECE 2 şık üret ve aralarına virgül koy.
    
    Format:
    1. YanlışA, YanlışB
    2. YanlışC, YanlışD
    ...
    
    Sorular:
    ${answersAndQuestions.map((item, i) => `${i + 1}. Soru: "${item.question}" Cevap: "${item.answer}"`).join("\n")}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parsing logic
        const lines = text.split('\n').filter(l => l.includes(','));
        const distractors = lines.map(line => {
            const cleanLine = line.replace(/^\d+[\.\)]\s*/, ''); // Remove "1. " or "1) "
            return cleanLine.split(',').map(p => p.trim());
        });

        // Ensure we return 5 items
        if (distractors.length < 5) {
            throw new Error("Missing items in AI response");
        }

        return distractors;
    } catch (e) {
        // Handle Quota (429) or other errors
        if (e.message?.includes('429') || e.status === 429) {
            if (retryCount < 5) {
                console.log(`Kota doldu (429). ${retryCount + 1}. deneme için bekleniyor...`);
                await sleep(5000 * (retryCount + 1));
                return generateAllDistractors(answersAndQuestions, retryCount + 1);
            }
        }

        console.error("Gemini SDK Error:", e);
        // Fallback for each question
        return answersAndQuestions.map(() => ["Alternatif 1", "Alternatif 2"]);
    }
}
