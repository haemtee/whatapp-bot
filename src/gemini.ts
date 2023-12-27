import {
    GoogleGenerativeAI,
    HarmCategory,
    HarmBlockThreshold,
} from "@google/generative-ai";
import fs from 'fs';

require("dotenv").config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

export const MODEL_VISION = {
    model: genAI.getGenerativeModel({ model: process.env.MODEL_VISION! }),
    config: {
        temperature: 0.2,
        topK: 32,
        topP: 1,
        maxOutputTokens: 4096
    }
};

export const MODEL_TEXT = {
    model: genAI.getGenerativeModel({ model: process.env.MODEL_TEXT! }),
    config: {
        temperature: 0.3,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048
    }
};

export const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
    },
];
// const tempFile = "./temp_image/temp.jpeg"


// https://core.telegram.org/bots/api#markdownv2-style
// const SPECIAL_CHARS = [
//     '\\', '_', '*', '[', ']', '(', ')', '~', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!'
// ]

// const regex = new RegExp(`[${SPECIAL_CHARS.join('\\')}]`, 'ig')

// function escapeMarkdown(text: string) {
//     return text.replace(regex, '\\$&')
// }

export async function geminiAI(vision: boolean, text: string, image?: string[]) {
    let parts: any = [];
    let model = vision ? MODEL_VISION.model : MODEL_TEXT.model;

    parts.push({ text });

    if (image && image.length > 0) {
        for (let i = 0; i < image.length; i++) {

            parts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: Buffer.from(fs.readFileSync(image[i])).toString("base64")
                }
            });

        }
    }

    const result = await model.generateContent({
        contents: [{ role: "user", parts }],
        generationConfig: vision ? MODEL_VISION.config : MODEL_TEXT.config,
        safetySettings,
    });

    const response = result.response;
    // const hasil = escapeMarkdown(response.text());
    return response.text()
}