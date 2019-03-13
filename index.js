const Discord = require('discord.js');
const client = new Discord.Client();
const steem = require("steem");
const fetch = require("node-fetch");

const config = require('./config');
const helper = require('./helper');

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
});

function countCurators() {
    return client.guilds.get(config.discord.curation.guild).channels.get(config.discord.curation.channel).permissionOverwrites.filter(x => x.type === 'member').array().length
}

async function getSP(account) {
    let sp = await steem.api.getAccountsAsync([account]);
    let props = await steem.api.getDynamicGlobalPropertiesAsync();
    sp = sp[0];
    return steem.formatter.vestToSteem(parseFloat(sp.vesting_shares) + parseFloat(sp.received_vesting_shares), props.total_vesting_shares, props.total_vesting_fund_steem)

}

async function getVoteValue(vw, user) {
    let vp = parseInt(((await getvotingpower(user))).toFixed(0));
    let sp = await getSP(user);
    let a, n, r, i, o, p = 1e4;

    function calculate(sp, vp, vw) {
        let e = sp, //sp
            t = vp, //vp
            n = vw, // vw
            r = e / a,
            m = parseInt(100 * t * (100 * n) / p);
        m = parseInt((m + 49) / 50);
        let l = parseInt(r * m * 100) * i * o;
        return l.toFixed(2);
    }

    return new Promise((resolve, reject) => {
        steem.api.getRewardFund("post", function (e, t) {
            n = t.reward_balance,
                r = t.recent_claims,
                i = n.replace(" STEEM", "") / r;
            steem.api.getCurrentMedianHistoryPrice(function (e, t) {
                o = t.base.replace(" SBD", "") / t.quote.replace(" STEEM", "");
                steem.api.getDynamicGlobalProperties(function (t, n) {
                    a = n.total_vesting_fund_steem.replace(" STEEM", "") / n.total_vesting_shares.replace(" VESTS", "");
                    resolve(calculate(sp, vp, vw));
                });
            })

        });
    })
}

function getvotingpower(account_name) {
    return new Promise(resolve => {
        steem.api.getAccounts([account_name], function (err, account) {

            account = account[0];
            if (account === undefined) {

                console.log(account_name)
            }
            const totalShares = parseFloat(account.vesting_shares) + parseFloat(account.received_vesting_shares) - parseFloat(account.delegated_vesting_shares) - parseFloat(account.vesting_withdraw_rate);

            const elapsed = Math.floor(Date.now() / 1000) - account.voting_manabar.last_update_time;
            const maxMana = totalShares * 1000000;
            // 432000 sec = 5 days
            let currentMana = parseFloat(account.voting_manabar.current_mana) + elapsed * maxMana / 432000;

            if (currentMana > maxMana) {
                currentMana = maxMana;
            }

            const currentManaPerc = currentMana * 100 / maxMana;

            return resolve(currentManaPerc);
        });
    });
}

async function getBlacklistEntries(user) {
    let entries = await (await fetch("http://blacklist.usesteem.com/user/" + user)).json();
    return {
        entries: entries.blacklisted,
        text: entries.blacklisted.join(", "),
        count: entries.blacklisted.length
    }
}

client.on('message', msg => {
    if (msg.author.bot) {
        return;
    }

    if (msg.content.startsWith("!status")) {

        // TODO: complete list of team members
        const team = [
            "heimindanger",
            "nannal",
            "steeminator3000",
            "wehmoen",
            "goyard"
        ];

        let user = msg.content.replace("!status", "").trim();

        if (steem.utils.validateAccountName(user) !== null) {
            user = "dtube"
        }

        console.log("next");

        steem.api.getAccounts([user], (err, res) => {
            if (err || res.length === 0) {
                msg.reply(user + " seems not to be a valid Steem account");
            } else {
                helper.database.countMessages().then(count => {
                    helper.database.countCurators().then(curators => {
                        getSP(user).then(sp => {
                            getvotingpower(user).then(vp => {
                                getVoteValue(vp, user).then(vote_value => {
                                    getBlacklistEntries(user).then(blacklist => {
                                        let status = new Discord.RichEmbed();
                                        status.setFooter("Powered by d.tube Curation 🦄");
                                        if (user === "dtube") {
                                            status.setTitle("DTube Curation Bot - Status Overview");
                                        } else {
                                            status.setTitle("@" + user + " - Status Overview");
                                        }

                                        status.setThumbnail('https://login.oracle-d.com/' + user + ".jpg");
                                        status.setColor(0x0878e0);
                                        if (user === "dtube") {
                                            status.addField("Total Curated Videos:", count[0].count, true);
                                            status.addField("Total Number of Curators:", countCurators(), true);
                                        }

                                        status.addField("Current 100% Vote Value:", vote_value + "$", true);
                                        status.addField("Current Steem Power:", sp.toFixed(3) + "SP", true);
                                        status.addField("Current Voting Power:", vp.toFixed(2) + "%", true);

                                        if (blacklist.count > 0 && !team.includes(user)) {
                                            status.addField("Blacklisted:", blacklist.text);
                                        }

                                        if (team.includes(user)) {
                                            status.addField("DTube Team Member:", "Yes 🤟");
                                        }
                                        msg.channel.send(status)
                                    });

                                })
                            })
                        })

                    })

                })
            }
        });
    }

    if (msg.channel.id === config.discord.curation.channel) {
        console.log(msg.content);

        if (msg.content === "!vp") {
            getvotingpower("dtube").then(vp => {
                msg.channel.send("DTubes Voting Power: " + vp.toFixed(2) + "%")
            })
        }

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
                            console.log(exist[0].discord);
                            let user = client.guilds.get(config.discord.curation.guild).members.get(exist[0].discord);
                            let video = new Discord.RichEmbed();
                            video.setFooter("Powered by d.tube Curation 🦄")
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
                                console.log(json.video);
                                let video = new Discord.RichEmbed();
                                video.setFooter("Powered by d.tube Curation 🦄")
                                    .setTimestamp()
                                    .setTitle("Feedback for: @" + json.video.info.author + '/' + json.video.info.permlink)
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
                                            video.addField("Info", "Something went wrong while saving this feedback to the database. Please manually verify that the feedback was posted.");
                                            embed.edit({embed: video})
                                        })
                                    } catch (e) {
                                        video.addField("Info", "Something went wrong while broadcasting the feedback to the blockchain. Please manually verify that the feedback was posted. If not try again. If this still does not work: Don't panic. Contact <@356200653640695811>");
                                        embed.edit({embed: video})
                                    }

                                })

                            })
                        }
                    });
                }
            } else if (parts.length === 1) {
                const video = helper.DTubeLink(parts[0].trim());
                if (video !== undefined) {
                    let authorInformation = video.replace('/#!', '').replace('https://d.tube/v/', '').split('/');
                    helper.database.feedBackExist(authorInformation[0], authorInformation[1]).then(exist => {
                        if (exist.length === 1) {
                            console.log(exist[0].discord);
                            let user = client.guilds.get(config.discord.curation.guild).members.get(exist[0].discord);
                            let video = new Discord.RichEmbed();
                            video.setFooter("Powered by d.tube Curation 🦄")
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

        } else {
            if (helper.DTubeLink(msg.content)) {
                const link = helper.DTubeLink(msg.content);
                let video = new Discord.RichEmbed();
                video.setFooter("Powered by d.tube Curation 🦄")
                    .setTimestamp();
                let authorInformation = link.replace('/#!', '').replace('https://d.tube/v/', '').split('/');
                steem.api.getContent(authorInformation[0], authorInformation[1], async (err, result) => {
                    if (err) {
                        msg.reply("Oups! An error occured. See the logs for more details");
                        console.log(err);
                    } else {
                        try {
                            let json = JSON.parse(result.json_metadata);
                            let posted_ago = Math.round(helper.getMinutesSincePost(new Date(result.created + 'Z')));
                            if (posted_ago > 2880) {
                                msg.channel.send("This post is too old for curation through d.tube");
                            } else {
                                json.tags.splice(4);
                                video.setTitle(json.video.info.title.substr(0, 1024))
                                    .setAuthor("@" + json.video.info.author, null, "https://d.tube/#!/c/" + json.video.info.author)
                                    .setThumbnail('https://snap1.d.tube/ipfs/' + json.video.info.snaphash)
                                    .setDescription("[Watch Video](" + link + ")")
                                    .addField("Tags", json.tags.join(', '))
                                    .addField("Uploaded", posted_ago + ' minutes ago', true)
                                    .setColor("DARK_NAVY");
                                let exist = await helper.database.existMessage(json.video.info.author, json.video.info.permlink);
                                if (!exist) {
                                    msg.channel.send({embed: video}).then(async (embed) => {
                                        embed.react(config.discord.curation.other_emojis.clock).then(clockReaction => {
                                            setTimeout(() => {
                                                clockReaction.remove();
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
                                                        embed.edit({embed: video});
                                                        console.error('Vote failed',);
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
                            msg.reply("Oups! An error occured. See the logs for more detauls");
                            console.log(err);
                        }
                    }
                })


            }
        }


    }

    if (msg.content.startsWith('!faq') && config.mod_settings.enabled === true) {
        let faq = msg.content.replace('!faq', '').trim();
        if (faq.length > 0) {
            if (faq === 'list') {
                let faqs = Object.keys(config.mod_settings.faq);
                let faq_embed = new Discord.RichEmbed().setTimestamp().setFooter("Powered by d.tube 🦄")
                    .setTitle("This are the help topics I know").setDescription(faqs.join(", "))
                    .addField("Usage:", "!faq *topic*")
                    .setThumbnail('https://image.flaticon.com/icons/png/512/258/258349.png');
                msg.channel.send({embed: faq_embed});
            } else {
                if (config.mod_settings.faq.hasOwnProperty(faq)) {
                    faq = config.mod_settings.faq[faq];
                    let faq_embed = new Discord.RichEmbed().setTimestamp().setFooter("Powered by d.tube 🦄")
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
    console.log(error)
});

process.on('unhandledRejection', function (error, p) {
    console.log(error, p)
});