const Discord = require('discord.js');
const client = new Discord.Client();
const steem = require("steem");

const config = require('./config');
const helper = require('./helper');

let scheduledVotes = [];

steem.api.setOptions({url:'https://anyx.io'})

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client
        .guilds
        .get(config.discord.curation.guild)
        .channels
        .get(config.discord.curation.channel)
        .fetchMessages({limit: 100})
        .then(messages => {
            messages = Array.from(messages);
            messages.forEach(message => {
                helper.database.updateReactions(message[0], helper.countReaction(message[1]));
            })
        })

    // setInterval(() => {
    //     helper.database.getMessagesToVote().then(messages => {
    //         messages.forEach(message => {
    //             helper.vote(message, client);
    //         })
    //     });
    // }, 1000 * 60)

    // setTimeout(() => {
    //     helper.database.getMessagesToVote().then(messages => {
    //         messages.forEach(message => {
    //             helper.vote(message, client);
    //         })
    //     });
    // }, 5 * 1000 * config.discord.curation.timeout_minutes)
});

client.on('message', msg => {
    if (msg.author.bot) {
        return;
    }
    if (msg.channel.id === config.discord.curation.channel) {
        if (helper.DTubeLink(msg.content)) {
            const link = helper.DTubeLink(msg.content)
            let video = new Discord.RichEmbed();
            video.setFooter("Powered by oneloved.tube Curation")
                .setTimestamp();
            let authorInformation = link.replace('/#!', '').replace('https://d.tube/v/', '').replace('https://dtube.network/v/', '').split('/');
            steem.api.getContent(authorInformation[0], authorInformation[1], async (err, result) => {
                if (err) {
                    msg.reply("Oops! An error occured. Please check the logs!");
                    console.log(err);
                } else {
                    try {
                        let json = JSON.parse(result.json_metadata);
                        let posted_ago = Math.round(helper.getMinutesSincePost(new Date(result.created + 'Z')));
                        if (posted_ago > 2880) {
                            msg.channel.send("This post is too old for curation through oneloved.tube");
                        } else {
                            json.tags.splice(4)
                            video.setTitle(json.video.info.title.substr(0, 1024))
                                .setAuthor("@" + json.video.info.author, null, "https://d.tube/#!/c/" + json.video.info.author)
                                .setThumbnail('https://cloudflare-ipfs.com/ipfs/' + json.video.info.snaphash)
                                .setDescription("[Watch Video](" + link + ")")
                                .addField("Tags", json.tags.join(', '))
                                .addField("Uploaded", posted_ago + ' minutes ago', true);
                            let exist = await helper.database.existMessage(json.video.info.author, json.video.info.permlink);
                            if (!exist) {
                                msg.channel.send({embed: video}).then(async (embed) => {
                                    embed.react(config.discord.curation.other_emojis.clock).then(clockReaction => {
                                        setTimeout(() => {
                                            clockReaction.remove()
                                            helper.database.getMessage(json.video.info.author, json.video.info.permlink).then(message => {
                                                helper.vote(message, client).then(async (tx) => {
                                                    let msg = await helper.database.getMessage(json.video.info.author, json.video.info.permlink);
                                                    embed.react(config.discord.curation.other_emojis.check);
                                                    video.addField("Vote Weight", (msg.vote_weight / 100) + "%", true);
                                                    embed.edit({embed: video})
                                                }).catch(error => {
                                                    let errmsg = "An error occured while voting. Please check the logs!";
                                                    try {
                                                        errmsg = error.cause.data.stack[0].format.split(":")[1]
                                                    } catch (e) {

                                                    }
                                                    video.addField("ERROR", errmsg);
                                                    embed.edit({embed: video})
                                                    console.error('Failed to vote!')
                                                    embed.react(config.discord.curation.other_emojis.cross);
                                                })
                                            })
                                        }, 60 * 1000 * config.discord.curation.timeout_minutes)
                                    });
                                    helper.database.addMessage(embed.id, json.video.info.author, json.video.info.permlink)
                                }).catch(error => {
                                    console.log(error)
                                });
                            } else {
                                msg.reply("This video has already been posted to the curation channel.").then(reply => {
                                    setTimeout(() => {
                                        reply.delete();
                                    }, 5000)
                                })
                            }
                        }

                    } catch (err) {
                        msg.reply("Oops! An error occured. Please check the logs!");
                        console.log(err);
                    }
                }
            })


        }
    }
    
    if (msg.content.startsWith('!faq') && config.mod_settings.enabled === true) {
        let faq = msg.content.replace('!faq', '').trim();
        if (faq.length > 0) {
            if (faq === 'list') {
                let faqs = Object.keys(config.mod_settings.faq);
                let faq_embed = new Discord.RichEmbed().setTimestamp().setFooter("Powered by oneloved.tube")
                    .setTitle("These are the help topics I know").setDescription(faqs.join(", "))
                    .addField("Usage:", "!faq *topic*")
                    .setThumbnail('https://image.flaticon.com/icons/png/512/258/258349.png');
                msg.channel.send({embed: faq_embed});
            } else {
                if (config.mod_settings.faq.hasOwnProperty(faq)) {
                    faq = config.mod_settings.faq[faq];
                    let faq_embed = new Discord.RichEmbed().setTimestamp().setFooter("Powered by oneloved.tube")
                        .setTitle(faq[0]).setDescription(faq[1])
                        .setThumbnail('https://image.flaticon.com/icons/png/512/258/258349.png');
                    msg.channel.send({embed: faq_embed});
                }
            }
        }
    }

});

client.on('messageReactionAdd', (reaction, user) => {
    helper.database.updateReactions(reaction.message.id, helper.countReaction(reaction.message))
});

client.on('messageReactionRemove', (reaction, user) => {
    helper.database.updateReactions(reaction.message.id, helper.countReaction(reaction.message))
});

client.login(config.discord.token);

process.on('uncaughtException', function (error) {
    //do nothing
});

process.on('unhandledRejection', function (error, p) {
    //do nothing
});