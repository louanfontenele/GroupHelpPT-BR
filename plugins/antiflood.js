var LGHelpTemplate = require("../GHbot.js");
const { bold, punishmentToText, getUnixTime, genPunishmentTimeSetButton, punishmentToFullText, chunkArray, textToPunishment, genPunishButtons, handlePunishmentCallback } = require("../api/utils/utils.js");
const SN = require("../api/editors/setNum.js");
const ST = require("../api/editors/setTime.js");
const RM = require("../api/utils/rolesManager.js");
const { punishUser } = require("../api/utils/punishment.js");

//object structure: global.LGHFlood[chatId+userId] = { lastPunishment, grouped: { [groupId] : {ids: [messageIds], time} }, single: { [messageId] : time } }
global.LGHFlood = {};

function clearOutOfRangeMessages(key, now, maxTime)
{
    var grouped = global.LGHFlood[key].grouped;
    Object.keys(grouped).forEach((groupId)=>{
        var time = grouped[groupId].time;
        if( (now-time) > maxTime) delete global.LGHFlood[key].grouped[groupId];
    })
    Object.keys(global.LGHFlood[key].single).forEach((id)=>{
        var time  = global.LGHFlood[key].single[id];
        if( (now-time) > maxTime) delete global.LGHFlood[key].single[id];
    })
}


function main(args)
{

    const GHbot = new LGHelpTemplate(args);
    const {TGbot, db, config} = GHbot;

    var msgMin = config.ANTIFLOOD_msgMin;
    var msgMax = config.ANTIFLOOD_msgMax;
    var timeMin = config.ANTIFLOOD_timeMin;
    var timeMax = config.ANTIFLOOD_timeMax;

    //clear useless chats/messages on global.LGHFlood
    setInterval(()=>{
        var now = getUnixTime();
        var keys = Object.keys(global.LGHFlood);
        keys.forEach((key)=>{
            clearOutOfRangeMessages(key, now, timeMax);

            var groupedNum = Object.keys(global.LGHFlood[key].grouped).length;
            var singleNum = Object.keys(global.LGHFlood[key].single).length;
            if( groupedNum == 0 && singleNum == 0)
                delete global.LGHFlood[key];   
        }
    )},timeMax*1000)

    l = global.LGHLangs; //importing langs object

    GHbot.onCallback( (cb, chat, user) => {

        var msg = cb.message;
        var lang = user.lang;

        //security guards for settings
        if(!chat.isGroup) return;
        if( !cb.data.startsWith("S_FLOOD") ) return;
        if( !(user.hasOwnProperty("perms") && user.perms.settings) ) return;
        if( cb.chat.isGroup && chat.id != cb.chat.id) return;

        var returnButtons = [[{text: l[lang].BACK_BUTTON, callback_data: "S_FLOOD_M_:"+chat.id}]];
        var cb_prefix = cb.data.split("#")[0];

        //main menu based settings
        if( cb.data.startsWith("S_FLOOD_M_EDITS:") )
        {
            chat.flood.edit = !chat.flood.edit;
            db.chats.update(chat)
        }
        if( cb.data.startsWith("S_FLOOD_M_P_") )
        {
            var toSetPunishment = handlePunishmentCallback(GHbot, cb, user.id, chat.flood.punishment);
            if(toSetPunishment == chat.flood.punishment) return;
            else {chat.flood.punishment = toSetPunishment; db.chats.update(chat)};
        }
        //Set punishment duration
        if(cb.data.startsWith("S_FLOOD_M_PTIME#STIME") )
        {
            var currentTime = chat.flood.PTime;
            var title = l[lang].SEND_PUNISHMENT_DURATION.replace("{punishment}",punishmentToText(lang, chat.flood.punishment));
            var time = ST.callbackEvent(GHbot, db, currentTime, cb, chat, user, cb_prefix, returnButtons, title)

            if(time != -1 && time != currentTime)
            {
                chat.flood.PTime = time;
                db.chats.update(chat);
            }
            return;
        }
        if( cb.data.startsWith("S_FLOOD_M_DELETION:") )
        {
            chat.flood.delete = !chat.flood.delete;
            db.chats.update(chat)
        }
        if( cb.data.startsWith("S_FLOOD_M_") )
        {

            var punishment = chat.flood.punishment;
            var punishmentText = punishmentToFullText(lang, punishment, chat.flood.PTime, chat.flood.delete)
            var text = l[lang].ANTIFLOOD+"\n"+
            l[lang].ANTIFLOOD_DESCRIPTION.replace("{messages}",chat.flood.messages).replace("{seconds}",chat.flood.time)+"\n\n"+
            bold(l[lang].PUNISHMENT+": ")+punishmentText;

            var editButtonText = l[lang].ANTIFLOOD_COUNT_EDIT_BUTTON+(chat.flood.edit?" ✔️":" ✖️")
            
            var buttons = [
                [{text: l[lang].MESSAGES_BUTTON, callback_data: "S_FLOOD_MESSAGES#SNUM_MENU:"+chat.id}, {text: l[lang].TIME_BUTTON, callback_data: "S_FLOOD_TIME#SNUM_MENU:"+chat.id}],
                [{text: editButtonText, callback_data: "S_FLOOD_M_EDITS:"+chat.id}]
            ]
            genPunishButtons(lang, punishment, "S_FLOOD_M", chat.id, true, chat.flood.delete).forEach((line)=>buttons.push(line));
            buttons.push([{text: l[lang].BACK_BUTTON, callback_data: "SETTINGS_HERE:"+chat.id}]);

            var options = {
                message_id : msg.message_id,
                chat_id : cb.chat.id,
                parse_mode : "HTML",
                reply_markup : {inline_keyboard: buttons} 
            }
            GHbot.editMessageText(user.id, text, options)
            GHbot.answerCallbackQuery(user.id, cb.id);

        }

        //Setnum variables
        if( cb.data.startsWith("S_FLOOD_MESSAGES#SNUM_MENU") )
        {
            var title = l[lang].ANTIFLOOD_DESCRIPTION.replaceAll("{messages}",bold("{number}")).replaceAll("{seconds}",chat.flood.time);
            var num = SN.callbackEvent(GHbot, db, chat.flood.messages, cb, chat, user, cb_prefix, returnButtons, title, msgMin, msgMax);

            if(num != -1 && num != chat.flood.messages)
            {
                chat.flood.messages = num;
                db.chats.update(chat);
            }
        }
        if( cb.data.startsWith("S_FLOOD_TIME#SNUM_MENU") )
        {
            var title = l[lang].ANTIFLOOD_DESCRIPTION.replaceAll("{seconds}",bold("{number}")).replaceAll("{messages}",chat.flood.messages);
            var num = SN.callbackEvent(GHbot, db, chat.flood.time, cb, chat, user, cb_prefix, returnButtons, title, timeMin, timeMax);

            if(num != -1 && num != chat.flood.time)
            {
                chat.flood.time = num;
                db.chats.update(chat);
            }
        }

    })

    /**
     * @param {LGHelpTemplate.LGHMessage} msg
     * @param {LGHelpTemplate.LGHChat} chat
     * @param {LGHelpTemplate.LGHUser} user
     */
    async function handleFloodMessage(msg, chat, user)
    {
        if(!msg.chat.isGroup) return;
        if(msg.chat.flood.punishment == 0 && msg.chat.flood.delete == false) return;
        if(user.perms.flood == 1) return;

        var key = msg.chat.id+"_"+user.id;

        if(!global.LGHFlood.hasOwnProperty(key))
            global.LGHFlood[key] = {lastPunishment : 0, grouped: {}, single: {}};
        
        var now = msg.date;
        var mLevel = msg.chat.flood.messages;
        var tLevel = msg.chat.flood.time;
        var grouped = global.LGHFlood[key].grouped;
        clearOutOfRangeMessages(key, now, tLevel);

        //count this message
        if(msg.hasOwnProperty("media_group_id") && !grouped.hasOwnProperty(msg.media_group_id))
        {
            global.LGHFlood[key].grouped[msg.media_group_id] = {ids:[msg.message_id], time: now}
        }
        else if(msg.hasOwnProperty("media_group_id") && grouped.hasOwnProperty(msg.media_group_id))
        {
            global.LGHFlood[key].grouped[msg.media_group_id].ids.push(msg.message_id);
            global.LGHFlood[key].grouped[msg.media_group_id].time = now;
        }
        else if(!msg.hasOwnProperty("media_group_id"))
        {
            //add id, and re-count anyway if already exhist
            var curKey = msg.message_id;
            while (true) {
                if(global.LGHFlood[key].single.hasOwnProperty(curKey))
                    curKey = curKey+"+";
                else
                {
                    global.LGHFlood[key].single[curKey] = now;
                    break
                }
                    
            }
        }

        //check if antiflood fired
        var fire = false;
        var messageCount = Object.keys(global.LGHFlood[key].grouped).length + Object.keys(global.LGHFlood[key].single).length;
        if(messageCount > mLevel) fire = true;


        //flood reaction//
        if(fire && msg.chat.flood.delete)
        {
            var messagesIds = [];

            Object.keys(grouped).forEach((groupId)=>{
                grouped[groupId].ids.forEach((id)=>{messagesIds.push(id)});
                delete global.LGHFlood[key].grouped[groupId];
            })
            Object.keys(global.LGHFlood[key].single).forEach((id)=>{
                if(!id.includes("+")) //filter duplicates
                    messagesIds.push(id);
                delete global.LGHFlood[key].single[id];
            })

            //keep inside 100 messages telegram limit
            chunkArray(messagesIds, 100).forEach((ids)=>{
                TGbot.deleteMessages(msg.chat.id, ids)
            })
            
        }

        //punish
        var lastPunishment = global.LGHFlood[key].lastPunishment;
        var recentlyPunished = (now - lastPunishment) < tLevel;
        if(fire && !recentlyPunished)
        {
            var PTime = (msg.chat.flood.PTime == 0) ? -1 : msg.chat.flood.PTime;
            var reason = l[msg.chat.lang].ANTIFLOOD_PUNISHMENT.replaceAll("{number}",msg.chat.flood.messages).replaceAll("{time}",msg.chat.flood.time);
            punishUser(GHbot, user.id,  msg.chat, RM.userToTarget(msg.chat, user), msg.chat.flood.punishment, PTime, reason)
        }
        if(fire) global.LGHFlood[key].lastPunishment = now;

    }

    GHbot.onMessage( async (msg, chat, user) => {

        handleFloodMessage(msg, chat, user);

        //security guards
        if( !(msg.waitingReply && msg.waitingReply.startsWith("S_FLOOD")) ) return;
        if( msg.chat.isGroup && chat.id != msg.chat.id ) return;//additional security guard
        if( !(user.perms && user.perms.settings) ) return;
        
        //punishment time setting
        var returnButtons = [[{text: l[user.lang].BACK_BUTTON, callback_data: "S_FLOOD_M_:"+chat.id}]]
        var cb_prefix = msg.waitingReply.split("#")[0];
        if( msg.waitingReply.startsWith("S_FLOOD_M_PTIME#STIME") )
        {
            var title = l[user.lang].SEND_LINK_DURATION.replace("{punishment}",punishmentToText(user.lang, chat.flood.punishment));
            var time = ST.messageEvent(GHbot, chat.flood.PTime, msg, chat, user, cb_prefix, returnButtons, title);

            if(time != -1 && time != chat.flood.PTime)
            {
                chat.flood.PTime = time;
                db.chats.update(chat);
            }
        }

        var newValue = -1;
        var returnButtons = [[{text: l[user.lang].BACK_BUTTON, callback_data: "S_FLOOD_M_:"+chat.id}]]
        var title = l[user.lang].SEND_PUNISHMENT_DURATION.replace("{punishment}",punishmentToText(user.lang, chat.flood.punishment));
        if( msg.waitingReply.startsWith("S_FLOOD_MESSAGES#SNUM")  )
        {
            var title = l[user.lang].ANTIFLOOD_DESCRIPTION.replaceAll("{messages}",bold("{number}")).replaceAll("{seconds}",chat.flood.time);
            newValue = SN.messageEvent(GHbot, chat.flood.messages, msg, chat, user, "S_FLOOD_MESSAGES", returnButtons, title, msgMin, msgMax);
        }
    
        if( msg.waitingReply.startsWith("S_FLOOD_TIME#SNUM")  )
        {
            var title = l[user.lang].ANTIFLOOD_DESCRIPTION.replaceAll("{seconds}",bold("{number}")).replaceAll("{messages}",chat.flood.messages);
            newValue = SN.messageEvent(GHbot, chat.flood.time, msg, chat, user, "S_FLOOD_TIME", returnButtons, title, timeMin, timeMax);
        }
        if(newValue != -1)
        {
            if(msg.waitingReply.startsWith("S_FLOOD_MESSAGES#SNUM") && newValue != chat.flood.messages)
            {
                chat.flood.messages = newValue;
                db.chats.update(chat);
            }

            if( msg.waitingReply.startsWith("S_FLOOD_TIME#SNUM") && newValue != chat.flood.time )
            {
                chat.flood.time = newValue;
                db.chats.update(chat);
            }
        }

    })

    GHbot.onEditedMessage( async (msg, chat, user) => {
        if(chat.isGroup && chat.flood.edit)
            handleFloodMessage(msg, chat, user)
    })


}

module.exports = main;
