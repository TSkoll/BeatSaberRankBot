const config = require("./config.json");

const Discord = require("discord.js");
const client = new Discord.Client();
const prefix = config.prefix;
const fetch = require("node-fetch");

const MongoClient = require("mongodb").MongoClient;
const assert = require("assert");

const url = "mongodb://localhost:27017";
const dbName = "discordRankBot";

MongoClient.connect(url, async (err, client) => {
    assert.strictEqual(null, err);
    console.log("Connected successfully to database");
    const db = client.db(dbName);

    await discordlogin();
    discordClientReady();

    onLeave(db);
    commandHandler(db);
});

function onLeave(db) {
    client.on("guildMemberRemove", async (member) => {
        const myquery = { discId: member.id };
        const dbres = await db.collection("discordRankBotUsers").find(myquery).toArray();

        if (!dbres[0]?.discId) console.log(`${member.user.username} was not in db`);
        else {
            await db.collection("discordRankBotUsers").deleteOne(myquery);
            console.log(`${member.user.username} deleted from the database`);
        }
    });
}

async function discordlogin() {
    await client.login(config.token);
}

function discordClientReady() {
    client.on("ready", async () => {
        console.log("Ready to rumble!");
        await statusOff();
    });
}

async function statusOff() {
    await client.user.setActivity("Updates OFF");
}

function checkIfOwner(message) {
    if (message.author.id === message.guild.ownerID) return true;
    else message.channel.send(`Sorry you lack the permissions for this command.`);
}

async function UpdateAllRoles(db, callback) {
    const dbres = await db.collection("discordRankBotUsers").find({}).toArray();
    const requests = dbres
        .map((user) => `https://new.scoresaber.com/api/player/${user.scId}/full`)
        .map((url) => fetch(url).then((resp) => resp.json()));

    const responses = await Promise.all(requests);
    const playerRanks = responses.map((response) => response.playerInfo.countryRank);
    console.log(`player ranks: ${playerRanks}`);

    const Gid = config.guildId;

    const guild = await client.guilds.fetch(Gid);
    for (let i = 0; i < dbres.length; i++) {
        const member = await guild.members.fetch(dbres[i].discId);
        if (!member) {
            console.log(`Database contained user ${dbres[i].discName} [${dbres[i].discId}] that could not be updated`);
            return;
        }

        const memberRoles = member.roles.cache.array().filter((role) => !role.name.startsWith("Top"));
        const playerRank = playerRanks[i];

        let addRole = null;
        if (playerRank <= 5) {
            addRole = guild.roles.cache.filter((role) => role.name === "Top 5").first();
        } else if (playerRank <= 10) {
            addRole = guild.roles.cache.filter((role) => role.name === "Top 10").first();
        } else if (playerRank <= 15) {
            addRole = guild.roles.cache.filter((role) => role.name === "Top 15").first();
        } else if (playerRank <= 20) {
            addRole = guild.roles.cache.filter((role) => role.name === "Top 20").first();
        } else if (playerRank <= 25) {
            addRole = guild.roles.cache.filter((role) => role.name === "Top 25").first();
        } else if (playerRank <= 50) {
            addRole = guild.roles.cache.filter((role) => role.name === "Top 50").first();
        } else if (playerRank > 50) {
            addRole = guild.roles.cache.filter((role) => role.name === "Top 50+").first();
        }

        console.log(`Adding role ${addRole.name} to user ${dbres[i].discName}`);
        memberRoles.push(addRole);
        await member.roles.set(memberRoles);
        console.log(`Successfully added role ${addRole.name} to user ${dbres[i].discName}`);
    }
    callback();
}

async function removeOtherRankRoles(message) {
    const msgMembRole = message.member.roles;
    if (msgMembRole.cache.some((role) => role.name.startsWith(`Top`))) {
        const removableRole = msgMembRole.cache.find((role) => role.name.startsWith(`Top`));
        await msgMembRole.remove(removableRole, [`automatic removal of rank role`]);
        console.log(`Removed role: ${removableRole.name} from user ${message.author.username}`);
    }
}

let automaticUpdatesOnOff;

function toggleUpdates(message, db) {
    if (!automaticUpdatesOnOff) {
        automaticUpdatesOnOff = setInterval(async () => {
            await updates(message, db);
        }, 1000 * 60);
    } else {
        clearInterval(automaticUpdatesOnOff);
        statusOff();
        automaticUpdatesOnOff = null;
    }
}

let TimeRemainingHours = config.updateIntervalHours;
let TimeRemainingMinutes = 0;

async function updates(message, db) {
    if (TimeRemainingHours === 0 && TimeRemainingMinutes === 0) {
        TimeRemainingHours = config.updateIntervalHours - 1;
        TimeRemainingMinutes = 59;
        message.channel.send("Started an automatic role update");
        console.log(`Updating rank roles.`);
        await UpdateAllRoles(db, function () {
            message.channel.send("Finished.");
            console.log(`Completed role updates.`);
        });
    } else if (TimeRemainingMinutes === 0) {
        TimeRemainingHours--;
        TimeRemainingMinutes = 59;
    } else TimeRemainingMinutes--;
    await client.user.setActivity(
        `Next update in ${TimeRemainingHours}:${TimeRemainingMinutes.toString().padStart(2, "0")}`
    );
}

function commandHandler(db) {
    client.on("message", async (message) => {
        if (!message.content.startsWith(prefix) || message.author.bot) return;

        const args = message.content.slice(prefix.length).trim().split(" ");
        const command = args.shift().toLowerCase();

        if (command === "test") {
        }

        if (command === "toggleupdates") {
            if (checkIfOwner(message)) {
                await message.channel.send(`Toggled automatic updates on for roles.`);
                toggleUpdates(message, db);
            }
        }

        if (command === "updateallroles") {
            if (checkIfOwner(message)) {
                await message.channel.send(`Updating all registered user roles.`);
                await UpdateAllRoles(db);
                await message.channel.send("Finished.");
                await console.log(`Completed role updates.`);
            }
        }
        if (command === "me") {
            const query = { discId: message.author.id };
            db.collection("discordRankBotUsers")
                .find(query)
                .toArray(function (err, dbres) {
                    if (err) throw err;
                    if (!dbres[0]?.scId) {
                        message.channel.send(`I'm sorry I could not find you in the database.`);
                    } else {
                        fetch(`https://new.scoresaber.com/api/player/${dbres[0].scId}/full`)
                            .then((res) => res.json())
                            .then((res) => {
                                console.log(`${res.playerInfo.playerName} r:${res.playerInfo.countryRank}`);
                                message.channel.send(
                                    `${res.playerInfo.playerName} is rank ${res.playerInfo.countryRank} in ${res.playerInfo.country} with ${res.playerInfo.pp}pp`
                                );
                            });
                    }
                });
        }

        if (command === "deleteme") {
            removeOtherRankRoles(message);
            const myquery = { discId: message.author.id };
            db.collection("discordRankBotUsers")
                .find(query)
                .toArray(function (err, dbres) {
                    if (err) throw err;
                    if (!dbres[0]?.discId) {
                        message.channel.send(`I dont think you are in the database...`);
                    } else {
                        db.collection("discordRankBotUsers").deleteOne(myquery, function (err) {
                            if (err) throw err;
                            console.log(`${message.author.username} deleted from the database`);
                        });
                        message.channel.send("I removed your rankrole & deleted you from the database.");
                    }
                });
        }

        if (command === "addme") {
            if (!args.length) {
                return message.channel.send(`Please use a scoresaber id... ${message.author}!`);
            } else if (args) {
                let myobj = { discId: message.author.id, scId: args[0], discName: message.author.username };
                let query = { discId: message.author.id };
                fetch(`https://new.scoresaber.com/api/player/${args[0]}/full`)
                    .then((res) => res.json())
                    .then((res) => {
                        if (res.playerInfo.country === config.country) {
                            message.channel.send("Trying to add you...");
                            db.collection("discordRankBotUsers")
                                .find(query)
                                .toArray(function (err, dbres) {
                                    if (err) throw err;
                                    if (dbres?.length < 1) {
                                        db.collection("discordRankBotUsers").insertOne(myobj, function (err) {
                                            if (err) throw err;
                                            console.log(
                                                `inserted ${message.author.username} with sc ${res.playerInfo.playerName}`
                                            );
                                            message.channel.send(`... it worked, you have been added.`);
                                        });
                                    } else {
                                        message.channel.send("You propably already exist in the database...");
                                        console.log(
                                            `${message.author.username} tried to add themself to the db but alrdy existed.`
                                        );
                                    }
                                });
                        } else {
                            message.channel.send("I'm sorry this is not available for international players.");
                        }
                    })
                    .catch((err) => {
                        console.log(err);
                        message.channel.send("Something went terribly wrong, check your scoresaber id and try again.");
                    });
            }
        }

        if (command === "createroles") {
            if (checkIfOwner(message)) {
                const roleNames = ["Top 50+", "Top 50", "Top 25", "Top 20", "Top 15", "Top 10", "Top 5"];

                for (let roleName of roleNames) if (!message.guild.roles.cache.some((role) => role.name == roleName));
                message.guild.roles
                    .create({
                        data: {
                            name: roleName,
                        },
                    })
                    .catch((err) => console.error(`Failed to create role ${roleName}`, err));
            }
        }

        if (command === "roleme") {
            let query = { discId: message.author.id };
            db.collection("discordRankBotUsers")
                .find(query)
                .toArray(function (err, dbres) {
                    if (!dbres[0]?.scId) {
                        message.channel.send(`I'm sorry I could not find you in the database.`);
                    } else {
                        if (err) throw err;
                        console.log(dbres[0].scId);
                        fetch(`https://new.scoresaber.com/api/player/${dbres[0].scId}/full`)
                            .then((res) => res.json())
                            .then((res) => {
                                console.log(
                                    `Player: ${res.playerInfo.playerName} countryrank: ${res.playerInfo.countryRank}`
                                );
                                const msgMembRole = message.member.roles;
                                try {
                                    removeOtherRankRoles(message);
                                    if (res.playerInfo.countryRank <= 5) {
                                        const role = message.guild.roles.cache.find((role) => role.name === "Top 5");
                                        msgMembRole.add(role);
                                    } else if (res.playerInfo.countryRank <= 10) {
                                        const role = message.guild.roles.cache.find((role) => role.name === "Top 10");
                                        msgMembRole.add(role);
                                    } else if (res.playerInfo.countryRank <= 15) {
                                        const role = message.guild.roles.cache.find((role) => role.name === "Top 15");
                                        msgMembRole.add(role);
                                    } else if (res.playerInfo.countryRank <= 20) {
                                        const role = message.guild.roles.cache.find((role) => role.name === "Top 20");
                                        msgMembRole.add(role);
                                    } else if (res.playerInfo.countryRank <= 25) {
                                        const role = message.guild.roles.cache.find((role) => role.name === "Top 25");
                                        msgMembRole.add(role);
                                    } else if (res.playerInfo.countryRank <= 50) {
                                        const role = message.guild.roles.cache.find((role) => role.name === "Top 50");
                                        msgMembRole.add(role);
                                    } else if (res.playerInfo.countryRank > 50) {
                                        const role = message.guild.roles.cache.find((role) => role.name === "Top 50+");
                                        msgMembRole.add(role);
                                    }
                                    message.channel.send(`I added an approriate role for your rank.`);
                                } catch {
                                    message.channel.send(
                                        "It seems I was unable to add a role approriate for your rank."
                                    );
                                    console.log(err);
                                }
                            });
                    }
                });
        }
    });
}
