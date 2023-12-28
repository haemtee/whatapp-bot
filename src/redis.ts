import { RedisClientType, createClient } from 'redis';
require("dotenv").config();

let redisPass = process.env.REDIS_PASSWORD!;
let clientRedis: RedisClientType
let isDev = process.env.DEV!

clientRedis = createClient({
    url: "redis://localhost:6379/",
    name: "gemini",
    // password: redisPass,
    legacyMode: false
})

if (isDev === "TRUE") {
    clientRedis = createClient({
        password: process.env.REDIS_CLOUD,
        socket: {
            host: 'redis-15480.c54.ap-northeast-1-2.ec2.cloud.redislabs.com',
            port: 15480
        }
    });
}

clientRedis.on('error', err => console.log('Redis Client Error', err))
    .connect().then(async () => {
        console.log('Redis Client Connected')
    });

export async function saveMem(id: string, role: string, text: string) {
    let mem = await getMem(id)
    // console.log(mem);

    if (mem && typeof (mem) === "object") {
        const newMem = {
            role,
            parts: [{ text }]
        }

        return await addMem(id, newMem)
    }

    await clientRedis.json.set(id, '$', {
        history: [{
            role,
            parts: [{ text }]
        }]
    });
    return await clientRedis.expire(id, 5 * 60)
}

export async function getMem(id: string) {
    try {
        const mem = await clientRedis.json.get(id, { path: '.history' })
        return mem

    }
    catch (e) {
        console.log(e);
        return false
    }
}

export async function removeKey(id: string) {
    await clientRedis.del(id)
}

export async function addMem(id: string, history: any) {
    await clientRedis.json.arrAppend(id, '.history',
        history
    );
    return await clientRedis.expire(id, 5 * 60)
}

export async function saveMessageId(messageid: string) {
    await clientRedis.rPush("msg", messageid);
    await clientRedis.expire("msg", 5 * 60);
}

export async function findMessageId(messageid: string) {
    const values = await clientRedis.lRange("msg", 0, -1);

    for (let i = 0; i < values.length; i++) {
        if (values[i] === messageid) {
            return values[i];
        }
    }

    return null;
}