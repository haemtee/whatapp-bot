import makeWASocket, {
    downloadMediaMessage,
    BufferJSON,
    DisconnectReason,
    WAConnectionState,
    makeInMemoryStore,
    useMultiFileAuthState,
} from "@whiskeysockets/baileys";
import MAIN_LOGGER from "@whiskeysockets/baileys/lib/Utils/logger";
import { Boom } from "@hapi/boom";
import { geminiAI } from "./gemini";
import { findMessageId, removeKey, saveMessageId } from "./redis";
// @ts-ignore
import { conversationGemini } from "./conv";
// @ts-ignore
import { tldrArticle } from "./article";

require('dotenv').config();

const GRUP_ID = process.env.GRUP_ID;
const OWNER_ID = process.env.OWNER_ID;
const KATA_KUNCI = "AI, "
const logger = MAIN_LOGGER.child({})
logger.level = 'error'

const store = makeInMemoryStore({});
store.readFromFile("./baileys_store.json");
// saves the state to a file every 10s
setInterval(() => {
    store.writeToFile("./baileys_store.json");
}, 10_000);

async function connectToWhatsApp() {
    // utility function to help save the auth state in a single folder
    // this function serves as a good guide to help write auth & key states for SQL/no-SQL databases, which I would recommend in any production grade system
    const { state, saveCreds } = await useMultiFileAuthState("auth_info_baileys");

    // will use the given state to connect
    // so if valid credentials are available -- it'll connect without QR
    const conn = makeWASocket({ auth: state, printQRInTerminal: true });

    // this will be called as soon as the credentials are updated
    store.bind(conn.ev);

    conn.ev.on("creds.update", saveCreds);

    conn.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === "close") {
            const shouldReconnect =
                (lastDisconnect?.error as Boom)?.output?.statusCode !==
                DisconnectReason.loggedOut;
            console.log(
                "connection closed due to ",
                lastDisconnect?.error,
                ", reconnecting ",
                shouldReconnect
            );
            // reconnect if not logged out
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === "open") {
            console.log("opened connection");
        }
    });

    conn.ev.on("messages.upsert", async ({ messages }) => {
        const m = messages[0];
        const id = m.key.remoteJid
        console.log(m);
        // console.log("===qu===");

        if (!m.message) return; // if there is no text or media message
        if ((m.key.remoteJid != GRUP_ID && m.key.fromMe) || (m.key.remoteJid != OWNER_ID && m.key.fromMe)) return

        const messageType = Object.keys(m.message)[0]; // get what type of message it is -- text, image, video

        if (m.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            if (messageType !== "extendedTextMessage") return;
            // console.log( m.message.extendedTextMessage.contextInfo);

            const quotedMessage = m.message.extendedTextMessage.contextInfo.quotedMessage
            const quotedMessageType = Object.keys(quotedMessage)[0]
            let quotedText = quotedMessageType === "extendedTextMessage" ? quotedMessage.extendedTextMessage?.text : quotedMessage.conversation

            let text = m.message.extendedTextMessage?.text
            if (!text) return

            if (quotedText) {
                const urlRegex = /https?:\/\/[^\s]+/g
                console.log(quotedText);
                if (urlRegex.test(quotedText)) {
                    const url = quotedText.match(urlRegex)![0];

                    let result
                    try {
                        if (text === "tldr") {
                            await conn.sendPresenceUpdate('composing', id!)
                            result = await tldrArticle(url);
                        } else {
                            const keyword = text.substring(0, 4);
                            if (keyword === KATA_KUNCI) {
                                await conn.sendPresenceUpdate('composing', id!)
                                text = text.substring(4) + "?"
                                result = await tldrArticle(url, text)
                            } else {
                                return
                            }
                        }
                    } catch (error) {
                        console.log(error)
                        return conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m });
                    }
                    if (!result) { return await conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m }); }
                    const balasan = `Judul : *${result.title}*\n\n *Males Baca :* \n${result.tldr}`
                    const reply = await conn.sendMessage(id!, { text: balasan }, { quoted: m });
                    return await saveMessageId(reply?.key.id!)
                }
            }

            const msgid = m.message.extendedTextMessage.contextInfo.stanzaId
            let isConv
            if (msgid) isConv = await findMessageId(msgid)
            if (!isConv) {
                const keyword = text.substring(0, 4)
                if (keyword !== KATA_KUNCI) return
                else {
                    text = text.substring(4) + "?"
                }
            }
            // console.log(quotedMessageType);
            if (quotedMessageType === "extendedTextMessage" || quotedMessageType === "conversation") {

                quotedText += "\n" + text + "?"
                let result: string
                // console.log(quotedText);

                await conn.sendPresenceUpdate('composing', id!)
                try {
                    result = await conversationGemini(false, quotedText)
                    // console.log(result);

                } catch (error) {
                    console.log(error)
                    return conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m });
                }
                if (!result) { return await conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m }); }
                const reply = await conn.sendMessage(id!, { text: result }, { quoted: m });
                return await saveMessageId(reply?.key.id!)
            }
            if (quotedMessageType === "imageMessage") {
                // download the message
                const Jid = GRUP_ID!
                const msgId = m.message.extendedTextMessage.contextInfo.stanzaId!

                const photoMessage = await store.loadMessage(Jid, msgId);

                if (!photoMessage) return
                // Get the media URL from the message
                const filePath: string = './temp_image/whatapp-image' + new Date().getTime() + '.jpeg';
                let buffer: Buffer | any
                try {
                    buffer = await downloadMediaMessage(
                        photoMessage,
                        "buffer",
                        {},
                        {
                            logger,
                            // pass this so that baileys can request a reupload of media
                            // that has been deleted
                            reuploadRequest: conn.updateMediaMessage,
                        }
                    );

                    // save to file
                    await import("fs/promises").then((fs) =>
                        fs.writeFile(filePath, buffer)
                    );
                } catch (error) { console.log(error) };

                let result: string

                await conn.sendPresenceUpdate('composing', id!)
                try {
                    result = await geminiAI(true, text, [filePath])
                    // console.log(result);

                } catch (error) {
                    console.log(error)
                    return conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m });
                }
                console.log(result);

                if (!result) { return await conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m }); }
                const reply = await conn.sendMessage(id!, { text: result }, { quoted: m });
                return await saveMessageId(reply?.key.id!)
            }
        }
        if (messageType === "extendedTextMessage" || messageType === "conversation") {
            let text = m.message.extendedTextMessage?.text ? m.message.extendedTextMessage?.text : m.message.conversation
            if (!text) return; // if there is no text
            const keyword = text.substring(0, 4);
            if (keyword !== KATA_KUNCI) return

            text = text.substring(4) + "?"
            let result: string
            await removeKey(id!)
            await conn.sendPresenceUpdate('composing', id!)
            try {
                result = await conversationGemini(id, text)
                // console.log(result);

            } catch (error) {
                console.log(error)
                return conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m });
            }
            if (!result) { return await conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m }); }
            const reply = await conn.sendMessage(id!, { text: result }, { quoted: m });
            return await saveMessageId(reply?.key.id!)
        }

        // if the message is an image
        if (messageType === "imageMessage") {
            let text = m.message.imageMessage?.caption; // get the caption of the image message
            if (!text) return; // if there is no text
            const keyword = text.substring(0, 4);
            if (keyword !== KATA_KUNCI) return

            const filePath: string = './temp_image/whatapp-image' + new Date().getTime() + '.jpeg';
            let buffer: Buffer | any
            try {
                // download the message
                buffer = await downloadMediaMessage(
                    m,
                    "buffer",
                    {},
                    {
                        logger,
                        // pass this so that baileys can request a reupload of media
                        // that has been deleted
                        reuploadRequest: conn.updateMediaMessage,
                    }
                );

                // save to file
                await import("fs/promises").then((fs) =>
                    fs.writeFile(filePath, buffer)
                );
            } catch (error) { console.log(error) };

            text = text.substring(4) + "?"
            let result: string

            await conn.sendPresenceUpdate('composing', id!)
            try {
                result = await geminiAI(true, text, [filePath])
                // console.log(result);

            } catch (error) {
                console.log(error)
                return conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m });
            }
            if (!result) { return await conn.sendMessage(id!, { text: "Something wrong" }, { quoted: m }); }
            const reply = await conn.sendMessage(id!, { text: result }, { quoted: m });
            return await saveMessageId(reply?.key.id!)
        }
    });
}

connectToWhatsApp();