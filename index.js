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
    //         })!
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
        if (msg.content.startsWith("!feedback")) {
            let parts = msg.content.replace("!feedback").trim().split(" ").slice(1);
            if (parts.length >= 2) {
                const video = helper.DTubeLink(parts[0].trim());
                const link = video;
                if (video !== undefined) {
                    const feedback = parts.slice(1).join(" ");

                    let authorInformation = video.replace('/#!', '').replace('https://d.tube/v/', '').split('/');
                    helper.database.feedBackExist(authorInformation[0], authorInformation[1]).then(exist => {
                        if (exist.length !== 0) {
                            console.log(exist[0].discord)
                            let user = client.guilds.get(config.discord.curation.guild).members.get(exist[0].discord)
                            let video = new Discord.RichEmbed();
                            video.setFooter("Powered by d.tube Curation")
                                .setTimestamp()
                                .setTitle("Feedback for: @" + exist[0].author + '/' + exist[0].permlink)
                                .addField("View Video", "[Watch Video](https://d.tube/#!/v/" + exist[0].author + "/" + exist[0].permlink + ")", true)
                                .setDescription("This video already received feedback from <@" + user.user.id + '>')
                                .addField("Feedback", exist[0].message, true)
                                .setColor("LUMINOUS_VIVID_PINK");
                            msg.channel.send(video);
                        } else {
                            steem.api.getContent(authorInformation[0], authorInformation[1], async (err, result) => {
                                let json = JSON.parse(result.json_metadata);
                                let posted_ago = Math.round(helper.getMinutesSincePost(new Date(result.created + 'Z')));
                                console.log(json.video)
                                let video = new Discord.RichEmbed();
                                video.setFooter("Powered by d.tube Curation")
                                    .setTimestamp()
                                    .setTitle("Feedback for: @" + exist[0].author + '/' + exist[0].permlink)
                                    .setAuthor("@" + json.video.info.author, 'https://login.oracle-d.com/' + json.video.info.author + '.jpg', "https://d.tube/#!/c/" + json.video.info.author)
                                    .setThumbnail('https://snap1.d.tube/ipfs/' + json.video.info.snaphash)
                                    .setDescription("[Watch Video](" + link + ")")
                                    .addField("Tags", json.tags.join(', '))
                                    .addField("Uploaded", posted_ago + ' minutes ago', true)
                                    .setColor("DARK_GOLD");

                                msg.channel.send(video).then(async (embed) => {
                                    try {
                                        const permlink = steem.formatter.commentPermlink(authorInformation[0], authorInformation[1]);
                                        let id = await steem.broadcast.comment(config.steem.wif, authorInformation[0], authorInformation[1], config.steem.account, permlink, "", feedback, JSON.stringify({
                                            app: "dtube/feedback"
                                        }));
                                        video.addField("Commented", "[View on Steemit](https://steemit.com/@" + config.steem.account + "/" + permlink + ")");

                                        helper.database.addFeedback(msg.author.id, feedback, authorInformation[0], authorInformation[1]).then(() => {
                                            embed.edit({embed: video})
                                        }).catch(() => {
                                            video.addField("Info", "Something went wrong while saving this feedback to the database. Please manually verify that the feedback was posted.")
                                            embed.edit({embed: video})
                                        })
                                    } catch (e) {
                                        video.addField("Info", "Something went wrong while broadcasting the feedback to the blockchain. Please manually verify that the feedback was posted. If not try again. If this still does not work: Don't panic. Contact <@356200653640695811>")
                                        embed.edit({embed: video})
                                    }

                                })

                            })
                        }
                    });
                }
            } else if(parts.length === 1) {
                const video = helper.DTubeLink(parts[0].trim());
                if (video !== undefined) {
                    let authorInformation = video.replace('/#!', '').replace('https://d.tube/v/', '').split('/');
                    helper.database.feedBackExist(authorInformation[0], authorInformation[1]).then(exist => {
                        if (exist.length === 1) {
                            console.log(exist[0].discord)
                            let user = client.guilds.get(config.discord.curation.guild).members.get(exist[0].discord)
                            let video = new Discord.RichEmbed();
                            video.setFooter("Powered by d.tube Curation")
                                .setTimestamp()
                                .setTitle("Feedback for: @" + exist[0].author + '/' + exist[0].permlink)
                                .addField("View Video", "[Watch Video](https://d.tube/#!/v/" + exist[0].author + "/" + exist[0].permlink + ")", true)
                                .setDescription("This video already received feedback from <@" + user.user.id + '>')
                                .addField("Feedback", exist[0].message, true)
                                .setColor("LUMINOUS_VIVID_PINK");
                            msg.channel.send(video);
                        } else {
                            const emote = client.emojis.find(emoji => emoji.name === "DTube_D");
                            msg.reply(`This video has not received any feedback. ${emote}`)
                        }
                    });
                }
            }

        } else if (msg.content == '!mana') {
            steem.api.getAccounts([config.mainAccount],(err,res) => {
                if (err) {
                    msg.channel.send('An error occured. Please check the logs!')
                    return
                }
                // Obtain mana
                var secondsago = (new Date - new Date(res[0].last_vote_time + 'Z')) / 1000
                var mana = res[0].voting_power + (10000 * secondsago / 432000)
                mana = Math.min(mana/100,100).toFixed(2)

                var active = 'Active'
                // Decide whethher if curation is active
                if (mana < config.voting_threshold) {
                    active = 'Inactive'
                }

                var statusText = 'Curation status: ' + active
                if (mana < config.voting_threshold) {
                    active += '\nTime to recharge mana to threshold of ' + config.voting_threshold + '%: ' + helper.getRechargeTime(mana,config.voting_threshold)
                }

                if (mana != 100) {
                    // Calculate full recharge time
                    active += '\nTime for a full recharge: ' + helper.getRechargeTime(mana,100)
                } else {
                    // Mana is fully charged
                    active += '\nMana is fully charged.'
                }

                var embed = new Discord.RichEmbed();
                embed.addField('Current voting mana for @' + config.mainAccount + ': ' + mana + '%','Curation status: ' + active)
                msg.channel.send(embed)
            })
        } else if (helper.DTubeLink(msg.content)) {
            // Check if voting mana is above threshold
            steem.api.getAccounts([config.mainAccount],(err,res) => {
                if (err) {
                    msg.channel.send('An error occured. Please check the logs!')
                    return
                }
                var secondsago = (new Date - new Date(res[0].last_vote_time + 'Z')) / 1000
                var mana = res[0].voting_power + (10000 * secondsago / 432000)
                mana = Math.min(mana/100,100).toFixed(2)
                if (mana < config.voting_threshold) {
                    msg.channel.send('Our current voting mana is ' + mana + '% but our minimum threshold for curation is ' + config.voting_threshold + '%. Please wait for our mana to recharge and try again later.')
                    return
                } else {
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
                                        .setAuthor("@" + json.video.info.author, null, "https://dtube.network/#!/c/" + json.video.info.author)
                                        .setThumbnail('https://cloudflare-ipfs.com/ipfs/' + json.video.info.snaphash)
                                        .setDescription("[Watch Video](" + link + ")")
                                        .addField("Tags", json.tags.join(', '))
                                        .addField("Uploaded", posted_ago + ' minutes ago', true)
                                        .setColor("DARK_NAVY");
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

client.on('error', (error) => console.log('Discord error: ' + error))

client.login(config.discord.token);

process.on('uncaughtException', function (error) {
    //do nothing
});

process.on('unhandledRejection', function (error, p) {
    //do nothing
});