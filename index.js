require('dotenv').config();
const Discord = require('discord.js');
const bot = new Discord.Client();
const fs = require('fs');
const path = require('path');
const localdb = require("node-persist");
// eslint-disable-next-line no-undef
const TOKEN = process.env.TOKEN;
var texturesData = {};
var usersData = {};
var approvalsData = {};
const when = require('when');
const imageinfo = require('imageinfo');
const request = require('request').defaults({ encoding: null });
const GET_TEXTURES_CHANNELID = "697151313410261053";
const GET_TEXTURES_MESSAGEID = "697151487838781510";
const APPROVALS_CHANNELID = "697138292046692393";
const VOTES_NEEDED = 5;
const APPROVAL_SQUAD_ROLE_ID = "697470303340855387";
const PACK_CONTRIBUTOR_ROLE_ID = "697143499698733137";
var complete = false;

class QueuedStorage {

    constructor() {
        this.storage = localdb.create({
            dir: 'data',
            logging: console.log
        });
    }

    async init() {
        await this.storage.init();
    }


    async getItem(key) {
        this.current = when(this.current,
            () => { return this.storage.getItem(key) },
            () => { return this.storage.getItem(key) });
        return this.current;
    }

    async setItem(key, value) {
        this.current = when(this.current,
            () => { return this.storage.setItem(key, value) },
            () => { return this.storage.setItem(key, value) });
        return this.current;
    }
}
const storage = new QueuedStorage();

async function initStorage() {
    await storage.init();
    texturesData = await storage.getItem('texturesData');
    usersData = await storage.getItem('usersData');
    approvalsData = await storage.getItem('approvalsData');
    if (texturesData === undefined) {
        texturesData = {};
    }
    if (usersData === undefined) {
        usersData = {};
    }
    if (approvalsData === undefined) {
        approvalsData = {};
    }
}

var dirty = false;

async function save() {
    dirty = true;
}

async function serialize(callback) {
    if (dirty) {
        dirty = false;
        await storage.setItem('texturesData', texturesData);
        await storage.setItem('usersData', usersData);
        await storage.setItem('approvalsData', approvalsData);
    }
    if (callback) {
        callback();
    }
}

function isExpired(data) {
    return !isDone(data) && data.expiresafter != 0 && data.expiresafter < new Date().getTime() && (data.approvalmsg == "" || data.approvalmsg == undefined);
}

function isChoosing(data) {
    return !isAvailable(data) && !isExpired(data) && data.userid == "";
}

function isCreating(data) {
    return !isAvailable(data) && !isExpired(data) && (data.approvalmsg == "" || data.approvalmsg == undefined);
}

function isApproving(data) {
    return !isAvailable(data) && data.approvalmsg != "" && data.approvalmsg != undefined;
}

function isAvailable(data) {
    return data.available;
}

function isDone(data) {
    return data.done;
}

function getAvailableTextures() {
    console.log("Querying expiries...");
    let availableList = [];
    for (let texture in texturesData) {
        let data = texturesData[texture];
        if (data.available) {
            availableList.push(texture);
        } else if (isExpired(data)) {
            notifyReturnTexture(data.path);
            availableList.push(texture);
        }
    }
    serialize();
    return availableList;
}

function queryTextures() {
    console.log("Querying expiries...");
    let availableList = [];
    let choosingList = [];
    let creationList = [];
    let approvalsList = [];
    let doneList = [];
    for (let texture in texturesData) {
        let data = texturesData[texture];
        if (data.available) {
            availableList.push(texture);
        } else if (isApproving(data)) {
            approvalsList.push(texture);
        } else if (isDone(data)) {
            doneList.push(texture);
        } else if (isExpired(data)) {
            notifyReturnTexture(texture);
            availableList.push(texture);
        } else if (isChoosing(data)) {
            choosingList.push(texture);
        } else if (isCreating(texture)) {
            creationList.push(texture);
        }
    }
    serialize();
    console.log(availableList.length + " available textures.");
    console.log(choosingList.length + " textures in choosing.");
    console.log(creationList.length + " textures in creation.");
    console.log(approvalsList.length + " textures in approval.");
    console.log(doneList.length + " textures completed.");
    return availableList;
}

function getRandomTexture() {
    let array = getAvailableTextures();
    return array[Math.floor(Math.random() * array.length)];
}

async function returnTexture(texture) {
    let data = texturesData[texture];
    data.available = true;
    if (usersData[data.userid] != undefined) {
        usersData[data.userid].assigned = "";
        if (data.approvalmsg != "" && data.approvalmsg != undefined) {
            delete approvalsData[data.approvalmsg];
            let msg = bot.channels.cache.get(APPROVALS_CHANNELID).messages.cache.get(data.approvalmsg);
            if (msg == undefined) {
                msg = await bot.channels.cache.get(APPROVALS_CHANNELID).messages.fetch({
                    around: data.approvalmsg,
                    limit: 1
                });
            }
            data.approvalmsg = "";
            if (msg.reactions != undefined) {
                msg.reactions.removeAll();
            }
            const oldEmbed = msg.embeds[0];
            const embed = new Discord.MessageEmbed(oldEmbed).setTitle('Submission (Canceled)').setColor(15158332);
            msg.edit("Submission Status: `Canceled By User`", embed);
            fs.unlink("approvals/" + data.userid + ".png", () => {});
        }
    }
    data.userid = "";
    data.expiresafter = 0;
    console.log("Returning " + texture + " to pool");
    save();
}

function notifyReturnTexture(texture) {
    let data = texturesData[texture];
    data.available = true;
    if (usersData[data.userid] != undefined) {
        usersData[data.userid].assigned = "";
        if (bot.users.cache.get(data.userid) != undefined) {
            bot.users.cache.get(data.userid).send("Returning " + texture + " to pool due to expiry.");
        }
    }
    data.userid = "";
    data.expiresafter = 0;
    console.log("Returning " + texture + " to pool");
    save();
}

function assignTexture(texture, user) {
    let data = texturesData[texture];
    data.available = false;
    data.expiresafter = new Date().getTime() + 1000 * 60 * 60; // 1 hour
    usersData[user.id].assigned = texture;
    data.userid = user.id;
    console.log("Assigned " + data.path + " to " + user.tag);
    save();
}

function hasTexture(user) {
    return usersData[user.id] != undefined && usersData[user.id].assigned != "";
}

function canAssign(texture, user) {
    return (usersData[user.id] == undefined || usersData[user.id].assigned == "") && texturesData[texture].userid == "" && texturesData[texture].available == false;
}

async function acceptApproval(data, reaction) {
    let texture = data.texture;
    let userid = data.user;
    let messageid = data.message;
    let message = reaction.message;
    let fsName = "approvals/" + userid + ".png";
    let texDat = texturesData[texture];
    message.reactions.removeAll();
    const oldEmbed = message.embeds[0];
    const embed = new Discord.MessageEmbed(oldEmbed).setTitle('Submission (Approved)').setColor(3066993).setDescription(`**Original:** \`${texture}\`
**From <@${userid}>**
**Filesystem:** \`${texDat.output_location}\`
------------`)
    message.edit("Submission Status: `Approved`", embed);
    delete approvalsData[messageid];
    texDat.available = false;
    texDat.done = true;
    texDat.approvalmsg = "";
    usersData[userid].assigned = "";
    let user = bot.users.cache.get(userid);
    if (user == undefined) {
        user = await bot.users.fetch(userid);
    }
    user.send("Your submission for `" + texture + "` was approved by 4 staff members! Congratulations! You now have the \"Pack Contributor\" role in the server.");
    let member = message.guild.members.cache.get(userid);
    if (member == undefined) {
        member = await message.guild.members.fetch(userid);
    }
    member.roles.add(message.guild.roles.cache.get(PACK_CONTRIBUTOR_ROLE_ID));
    let dirs = texDat.output_location.substring(0, texDat.output_location.lastIndexOf("/"));
    if (!fs.existsSync(dirs)) {
        fs.mkdirSync(dirs, {
            recursive: true
        });
    }
    fs.rename(fsName, texDat.output_location, () => {});
    save();
}

function denyApproval(data, reaction) {
    let texture = data.texture;
    let userid = data.user;
    let messageid = data.message;
    let message = reaction.message;
    let fsName = "approvals/" + userid + ".png";
    message.reactions.removeAll();
    const oldEmbed = message.embeds[0];
    const embed = new Discord.MessageEmbed(oldEmbed).setTitle('Submission (Denied)').setColor(15158332);
    message.edit("Submission Status: `Denied`", embed);
    delete approvalsData[messageid];
    let texDat = texturesData[texture];
    texDat.available = true;
    texDat.expiresafter = 0;
    texDat.userid = "";
    usersData[userid].assigned = "";
    bot.users.cache.get(userid).send("Your submission for `" + texture + "` was denied by 4 staff members. If you would like a reason, contact staff in #questions.");
    fs.unlink(fsName, () => {});
    save();
}

function checkApproval(reaction, approval, vote, removeOpposite, user) {
    let yesList = reaction.message.reactions.cache.get("✅");
    let noList = reaction.message.reactions.cache.get("❌");
    let yesVotes = yesList.count + (removeOpposite && !vote ? -1 : 0);
    let noVotes = noList.count + (removeOpposite && vote ? -1 : 0);
    console.log("Received vote towards " + texturesData[approval.texture].name + ": " + (vote ? "yes" : "no") + " (from " + user.tag + ")");
    console.log("Yes votes: " + yesVotes);
    console.log("No votes: " + noVotes);
    if (yesVotes == VOTES_NEEDED && vote || yesVotes >= VOTES_NEEDED + 1) {
        acceptApproval(approval, reaction);
    } else if (noVotes == VOTES_NEEDED && !vote || noVotes >= VOTES_NEEDED + 1) {
        denyApproval(approval, reaction);
    }
}

function optionMessage(data, user) {
    return message => {
        message.react("✅");
        usersData[user.id].options[message.id] = data.path
        message.awaitReactions((reaction, rUser) => {
            return rUser.id === user.id && reaction.emoji.name == "✅" && message.id === reaction.message.id
        }, {
            max: 1,
            time: 1000 * 60,
            errors: ['time'] // 1 minute
        }).then(collect => {
            if (collect.first() != undefined && !collect.first().message.deleted && data.userid == "") {
                const newEmbed = new Discord.MessageEmbed()
                    .setTitle(data.path)
                    .setDescription(`You have selected this texture.
Drag and drop the attached image or right click and press "Copy Link" on it to download the texture. Edit it with software of your choice. We recommend [paint.net](https://www.getpaint.net/)
Requirements for textures:
- Must match original resolution EXACTLY. The bot will not pick up submissions that do not meet this requirement.
- Must be in PNG format. The bot will not pick up submissions that do not meet this requirement.
- Must not contain obscene, NSFW, or otherwise inappropriate content. Keep it YouTube friendly!
- Must follow the guidelines of the original texture (no shape changes, it should be an ACTUAL applicable texturemap)
- Must be significantly different from the original (do not submit the texture with a few marks on it, it should be different)

If you are confused on any of these requirements, ask in #questions
You have 1 hour to upload the image, just send it as a reply to this bot and it will automatically pick it up.
After it is submitted, your image will be sent to the staff team and reviewed for requirements. If your image is denied or accepted, the bot will inform you.
If your image is denied, contact staff for a reason. We may allow you to re-submit the same texture following modifications.
If you no longer want to complete this image, reply with "cancel" and the bot will return this image to the pool.`)
                    .attachFiles([data.path])
                    .setImage('attachment://' + data.name);
                if (canAssign(data.path, user)) {
                    assignTexture(data.path, user);
                } else {
                    message.reply("**Error assigning this texture. Contact its_meow#6903.**");
                }
                for (let id of Object.keys(usersData[user.id].options)) {
                    message.channel.messages.cache.get(id).delete();
                    if (id != message.id) {
                        let tex = usersData[user.id].options[id];
                        message.reply("Returning " + tex + " to pool.");
                        returnTexture(tex);
                    }
                }
                usersData[user.id].options = {}
                save();
                message.reply(newEmbed);
            }
        }).catch(() => {
            if (!message.deleted && data.userid == "") {
                message.delete();
                delete usersData[user.id].options[message.id];
            }
            message.reply("Returning " + data.name + " to pool.");
            returnTexture(data.path);
        });
    };
}

bot.on('ready', () => {
    console.log(`Logged in as ${bot.user.tag}!`);
    // get emoji
    const emoji = bot.emojis.cache.find(emoji => emoji.name === "texture");
    // cache react message
    bot.channels.cache.get(GET_TEXTURES_CHANNELID).messages.fetch({ around: GET_TEXTURES_MESSAGEID, limit: 1 }).then(collect => {
        collect.first().react(emoji);
    });
    // cache all approval messages and users with pending messages
    bot.channels.cache.get(APPROVALS_CHANNELID).messages.fetch({
        limit: 100,
    }).then(async function(collect) {
        for (let approvalmsg of Object.values(collect)) {
            console.log(approvalmsg.id);
            if (approvalsData[approvalmsg.id] != undefined) {
                approvalmsg.reactions.removeAll();

                approvalmsg.react("✅");
                approvalmsg.react("❌");
                approvalmsg.reactions.users.fetch();
            }
        }
    }).catch(() => {
        console.log("Failed to fetch approval msg during init");
    });
    for (let userid of Object.keys(usersData)) {
        bot.users.fetch(userid).then(user => {
            /*bot.channels.cache.get(GET_TEXTURES_CHANNELID).guild.members.fetch({
                user: user.id
            });*/
        });
        usersData[userid].options = {};
    }
    complete = true;
});

bot.on('message', msg => {
    if (msg.channel.type === "dm") {
        if (msg.content.toLowerCase() === "texture") {
            requestTexture(msg.author);
        } else if (msg.content.toLowerCase() === "cancel") {
            if (hasTexture(msg.author)) {
                let texture = usersData[msg.author.id].assigned;
                msg.reply("Returning " + texturesData[texture].name + " to pool.");
                returnTexture(texture);
            } else {
                msg.reply("Error: You don't currently have an assigned texture to cancel.");
            }
        } else if (hasTexture(msg.author) && msg.content == "" && msg.attachments.size == 1) {
            if (usersData[msg.author.id] != undefined && texturesData[usersData[msg.author.id].assigned].approvalmsg == "") {
                const attach = msg.attachments.first();
                console.log("Received file from " + msg.author.tag);
                if (attach.name.endsWith(".png")) {
                    request.get(attach.url, (err1, _res, body) => {
                        if (err1) console.log(err1);
                        let attachImg = imageinfo(body);
                        if (attachImg.mimeType == "image/png") {
                            let texture = usersData[msg.author.id].assigned;
                            fs.readFile(texture, (err, data) => {
                                if (err) console.log(err);
                                let img = imageinfo(data);
                                if (img.width == attachImg.width && img.height == attachImg.height) {
                                    msg.reply("Your image has passed automated approval and will now be sent to staff awaiting voting. If your texture gets 4 votes on either approve or deny an action will be taken. You will be informed when this happens. You cannot get another texture until your image is approved, denied, or canceled. You can cancel your submission by replying to this bot with \"cancel\"");
                                    console.log("Image good. Writing to filesystem.");
                                    let fsName = "approvals/" + msg.author.id + ".png";
                                    fs.writeFile(fsName, body, () => {
                                        let approvals = bot.channels.cache.get(APPROVALS_CHANNELID);
                                        approvals.send(`Submission Status: \`Awaiting Approval\` ` + approvals.guild.roles.cache.get(APPROVAL_SQUAD_ROLE_ID).toString(), new Discord.MessageEmbed()
                                            .setColor(10181046)
                                            .setTitle("Submission")
                                            .setDescription(`**Original:** \`${texture}\`
**From <@${msg.author.id}>**
**Width:** ${attachImg.width}px
**Height:** ${attachImg.height}px
**MIME:** \`${attachImg.mimeType}\`
**Attachment Name:** \`${attach.name}\`
**Filesystem:** \`${fsName}\`
------------`)
                                            .setImage(attach.url)
                                            .attachFiles([texture])
                                            .setThumbnail('attachment://' + texturesData[texture].name)
                                        ).then(approvalmsg => {
                                            texturesData[texture].approvalmsg = approvalmsg.id;
                                            approvalsData[approvalmsg.id] = {
                                                texture: texture,
                                                user: msg.author.id,
                                                messageid: approvalmsg.id
                                            };
                                            save();
                                            approvalmsg.react("✅");
                                            approvalmsg.react("❌");
                                        });
                                        console.log("Submission complete! Sent to approvals.");
                                    });
                                } else {
                                    msg.reply(`This image does not match the size of the original texture. It must be ${img.width}x${img.height}, but it is ${attach.width}x${attach.height}!`);
                                }
                            });
                        } else {
                            console.log("Denied, MIME incorrect.");
                            msg.reply(`This file has a MIME type of "${attachImg.mimeType}", it must be "image/png". The image was likely not saved properly or saved as something else and renamed.`);
                        }
                    });
                } else {
                    console.log("Denied, non PNG.");
                    msg.reply("This file does not have a PNG extension!");
                }
            } else {
                msg.reply("You have already sent your submission. Cancel it if you wish to do another.");
            }
        }
    }
});

async function requestTexture(user) {
    if (usersData[user.id] == null || Object.keys(usersData[user.id].options).length === 0) {
        if (usersData[user.id] != null && usersData[user.id].assigned != null && usersData[user.id].assigned != "") {
            if (texturesData[usersData[user.id].assigned].approvalmsg != "") {
                user.send(`You already have a texture waiting for approval! You must wait for this to be approved before you can do another texture.`);
            } else {
                user.send(`You must submit or cancel your current texture before you can get another! Reply with "cancel" to cancel your current texture.`);
            }
        } else {
            user.send(
                `**Hi, thanks for your interest in contributing to The Pack!** 
You will receive several options of textures to contribute.
Press the ✅ under which one you want within 1 minute, after which your options will expire and you will need to re-react.
After accepting a texture, you will have 1 hour to complete it until your request expires and the texture is added back into the pool. If your texture expires, you will be informed.`);
            if (usersData[user.id] == null) {
                usersData[user.id] = {
                    id: user.id,
                    tag: user.tag,
                    assigned: "",
                    options: {},
                }
            }
            for (let i = 1; i <= 3; i++) {
                let texture = getRandomTexture();
                if (texture == undefined || texture == null || texture == "") {
                    user.send("There are no more textures available!");
                } else {
                    let data = texturesData[texture];
                    const embed = new Discord.MessageEmbed()
                        .setTitle("Texture Option #" + i)
                        .setDescription(
                            `Press the ✅ to choose this option.
**Texture:** \`${texture}\``)
                        .attachFiles([texture])
                        .setImage('attachment://' + data.name);
                    data.available = false;
                    data.expiresafter = new Date().getTime() + 1000 * 60; // 1 minute
                    save();
                    await user.send(embed).then(optionMessage(data, user));
                }

            }
        }
    } else {
        user.send("Pick one of the above options or wait 1 minute before requesting more textures!");
    }
}

bot.on('messageReactionAdd', async function(reaction, user) {
    if (user !== bot.user) {
        if (reaction.message.id === GET_TEXTURES_MESSAGEID && reaction.emoji.name === "texture") {
            console.log(`Reaction added by ${user.tag}`);
            reaction.users.remove(user);
            requestTexture(user);
        } else if (reaction.message.channel.id === APPROVALS_CHANNELID && (reaction.emoji.name == "❌" || reaction.emoji.name == "✅")) {
            let msgid = reaction.message.id;
            if (approvalsData[msgid] != undefined) {
                let approval = approvalsData[msgid];
                let vote = reaction.emoji.name == "✅";

                let yesList = reaction.message.reactions.cache.get("✅");
                let noList = reaction.message.reactions.cache.get("❌");
                if (noList != undefined && yesList != undefined) {
                    if (vote && noList.users.cache.has(user.id)) {
                        // remove no vote
                        noList.users.remove(user.id).then((newReaction) => {
                            checkApproval(newReaction, approval, vote, true, user);
                        });
                    } else if (!vote && yesList.users.cache.has(user.id)) {
                        // remove yes vote
                        yesList.users.remove(user.id).then((newReaction) => {
                            checkApproval(newReaction, approval, vote, true, user);
                        });
                    } else {
                        // new vote
                        checkApproval(reaction, approval, vote, false, user);

                    }
                }
            }
        }
    }
});
// eslint-disable-next-line no-undef
process.on('SIGINT', () => {
    console.log("Exiting...");
    save();
    // eslint-disable-next-line no-undef
    serialize(process.exit);
});
initStorage().then(() => {
    const walkSync = (dir, filelist = []) => {
        fs.readdirSync(dir).forEach(file => {
            if (fs.statSync(path.join(dir, file)).isDirectory()) {
                filelist = walkSync(path.join(dir, file), filelist)
            } else {
                if (file.endsWith(".png")) {
                    filelist = filelist.concat(path.join(dir, file).replace(/\\/g, "/"));
                }
            }
        });
        return filelist;
    }
    let texlist = walkSync("textures");
    // eslint-disable-next-line no-unused-vars
    texlist.forEach((value, _index, _array) => {
        if (value in texturesData) {
            console.log("Loaded " + value);
        } else {
            texturesData[value] = {
                output_location: value.replace("textures", "texturesout"),
                available: true,
                userid: "",
                done: false,
                expiresafter: 0,
                name: value.substring(value.lastIndexOf("/") + 1),
                path: value,
                approvalmsg: ""
            }
        }
    });
    save();
    queryTextures();
    console.log("Total textures: " + texlist.length);
    bot.login(TOKEN);
    setInterval(queryTextures, 20000); // query every 20s
});