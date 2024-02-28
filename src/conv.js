// import {
//     GoogleGenerativeAI,
//     HarmCategory,
//     HarmBlockThreshold,
// } from "@google/generative-ai";

const { getMem, saveMem } = require("./redis");
const { MODEL_TEXT, safetySettings } = require("./gemini");

async function conversationGemini(id, text) {
    let history
    const mem = await getMem(id.toString())
    console.log(mem);
    if (mem) {
        if (mem[mem.length - 1].user === "user") mem.pop()
        history = mem
    } else {
        history = []
    }
    if (history.length > 10) history.slice(-10)
    let model = MODEL_TEXT.model;
    const chat = model.startChat({
        generationConfig: MODEL_TEXT.config,
        safetySettings,
        history: history
    });
    await saveMem(id.toString(), "user", text)
    const result = await chat.sendMessage(text);
    const response = result.response;
    const hasil = response.text()
    if (hasil.length > 0) await saveMem(id.toString(), "model", hasil)
    return hasil
}

module.exports = { conversationGemini}