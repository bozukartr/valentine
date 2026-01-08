import { GoogleGenerativeAI } from "https://esm.run/@google/generative-ai";

const GEMINI_API_KEY = "AIzaSyB7Ok69yfywK5Gcbmj7JS1gko3IOJ-H2uU";
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function generateAllDistractors(answersAndQuestions, retryCount = 0) {
    if (GEMINI_API_KEY === "YOUR_GEMINI_API_KEY") {
        return answersAndQuestions.map(() => ({ corrected: "Alternatif Doğru", distractors: ["Alternatif 1", "Alternatif 2"] }));
    }

    // Using gemini-2.5-flash as requested
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `Aşağıdaki 5 soru ve kullanıcı cevabı için:
    1. Eğer kullanıcı cevabında yazım yanlışı varsa düzelt.
    2. Cevapla uyumlu, mantıklı ama yanlış 2 seçenek (distractor) üret.
    
    Lütfen her soru için SADECE şu formatta yanıt ver (Arada dikey çizgi | olsun):
    DoğruCevap(Düzeltilmiş) | Yanlış1 | Yanlış2
    
    Sorular:
    ${answersAndQuestions.map((item, i) => `${i + 1}. Soru: "${item.question}" Kullanıcı Cevabı: "${item.answer}"`).join("\n")}`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parsing logic for "Corrected | Dist1 | Dist2"
        const lines = text.split('\n').filter(l => l.includes('|'));
        const processedData = lines.map(line => {
            const cleanLine = line.replace(/^\d+[\.\)]\s*/, ''); // Remove "1. "
            const parts = cleanLine.split('|').map(p => p.trim());
            return {
                corrected: parts[0] || "Hata",
                distractors: [parts[1] || "Alternatif 1", parts[2] || "Alternatif 2"]
            };
        });

        // Ensure we return 5 items, fallback if missing
        while (processedData.length < 5) {
            processedData.push({ corrected: "Hata", distractors: ["Alternatif 1", "Alternatif 2"] });
        }

        return processedData;
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
