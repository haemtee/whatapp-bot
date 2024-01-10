'use strict';
const { geminiAI } = require('./gemini');


async function getArticle(url) {
    // const module = require('@extractus/article-extractor');
    // const article = await module.extract(url);
    return await import("@extractus/article-extractor").then(async (module) => {
        const article = await module.extract(url)
        if (article?.content === undefined) {
            throw new Error("Article not found");
        }
        const cleanedContent = article.content
            .replace(/<(br|p|div)[^>]*>/g, "\n")
            .replace(/&nbsp;/g, " ")
            .replace(/<[^>]*>/g, "")
            .trim();
        // console.log(cleanedContent);
        return {
            title: article.title ?? "Unknown title",
            content: cleanedContent,
            url,
        };
    });

}

async function tldrArticle(url, tanya = "0") {
    const article = await getArticle(url);
    let ask = ""
    if (tanya !== "0") {
        ask = `saya ingin bertanya, ${tanya} dari url ${article.url} yang kontennya, ${article.content} \nabaikan konten yang tidak berhubungan`
    } else {
        ask = `buat TLDR dalam bahasa indonesia gunakan bullet point untuk poin-poin penting \n` + article.content;
    }
    article.tldr = await geminiAI(false, ask);
    return article
}

module.exports = { tldrArticle };