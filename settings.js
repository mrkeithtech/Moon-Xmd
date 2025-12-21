/*==================================

      🌙 MOON XMD 🌙
  DEVELOPED BY KEITH TECH
    
================================*/

const fs = require('fs')
if (fs.existsSync('.env')) require('dotenv').config({ path: __dirname+'/.env' })



const settings = {

//======= BOT SETTINGS ============//

  SESSION_ID: process.env.SESSION_ID || 'Paste Ur SESSION_ID Here',

  botName: process.env.botName || "*Mᴏᴏɴ Xᴍᴅ*",
 
  timezone: process.env.timezone || "Africa/Harare",
  
  
  ownerNumber: process.env.ownerNumber || '263776509966',
 
  Prefix: process.env.Prefix || '.'

};

module.exports = settings;